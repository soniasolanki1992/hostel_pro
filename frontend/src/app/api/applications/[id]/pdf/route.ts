import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { extractTokenFromHeader, getUserFromToken } from '@/lib/auth';
import { resolveAndValidatePath } from '@/lib/storage';
import fs from 'fs/promises';
import path from 'path';

const PHOTO_MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function loadApplicantPhotoDataUri(applicationId: string): Promise<string | null> {
  try {
    const { rows } = await query(
      `SELECT file_path, mime_type FROM documents
        WHERE application_id = $1 AND document_type = 'PHOTOGRAPH'
        ORDER BY uploaded_at DESC LIMIT 1`,
      [applicationId],
    );
    if (!rows?.[0]?.file_path) return null;
    const ext = path.extname(rows[0].file_path).toLowerCase();
    const mime = rows[0].mime_type || PHOTO_MIME_BY_EXT[ext];
    if (!mime || !mime.startsWith('image/')) return null;
    const abs = await resolveAndValidatePath(rows[0].file_path);
    const buf = await fs.readFile(abs);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * GET /api/applications/[id]/pdf
 * Generate and download application as printable HTML
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try auth — staff get full access, guests can access by tracking number
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('token');
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader) || queryToken;
    let isStaff = false;

    if (token) {
      const user = await getUserFromToken(token);
      if (user && ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS'].includes(user.role)) {
        isStaff = true;
      }
    }

    // Find by UUID or tracking number
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const { rows } = await query(
      isUuid
        ? 'SELECT * FROM applications WHERE id = $1'
        : 'SELECT * FROM applications WHERE tracking_number = $1',
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const application = rows[0];
    const data = application.data || {};
    const personalInfo = data.personal_info || {};
    const guardianInfo = data.guardian_info || {};
    const academicInfo = data.academic_info || {};
    const hostelPrefs = data.hostel_preferences || {};
    const emergencyContact = data.emergency_contact || {};

    const trackingNumber = application.tracking_number;
    const vertical = (application.vertical || '').replace(/_/g, ' ');
    const status = application.current_status || 'DRAFT';
    const submittedAt = application.submitted_at || application.created_at;
    const fullName = application.applicant_name || personalInfo.full_name || 'N/A';
    const dob = application.date_of_birth || personalInfo.date_of_birth || 'N/A';
    const gender = application.gender || personalInfo.gender || 'N/A';
    const mobile = application.applicant_mobile || 'N/A';
    const email = application.applicant_email || personalInfo.email || 'N/A';
    const bloodGroup = personalInfo.blood_group || 'N/A';

    const address = data.address
      ? [data.address.line1, data.address.line2, data.address.city, data.address.state, data.address.pin_code].filter(Boolean).join(', ')
      : 'N/A';

    const photoDataUri = await loadApplicantPhotoDataUri(application.id);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Application - ${trackingNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', serif;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 { font-size: 24px; margin-bottom: 5px; }
    .header h2 { font-size: 18px; font-weight: normal; color: #666; }
    .header p { font-size: 12px; color: #888; margin-top: 10px; }
    .tracking {
      background: #f5f5f5;
      padding: 15px;
      text-align: center;
      margin-bottom: 30px;
      border-radius: 5px;
    }
    .tracking strong { font-size: 20px; }
    .section { margin-bottom: 25px; }
    .section-title {
      font-size: 16px;
      font-weight: bold;
      background: #333;
      color: white;
      padding: 8px 15px;
      margin-bottom: 15px;
    }
    .row {
      display: flex;
      border-bottom: 1px solid #ddd;
      padding: 8px 0;
    }
    .label {
      width: 200px;
      font-weight: bold;
      color: #555;
    }
    .value { flex: 1; }
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 12px;
    }
    .status-SUBMITTED { background: #dbeafe; color: #1e40af; }
    .status-REVIEW { background: #fef3c7; color: #92400e; }
    .status-APPROVED { background: #d1fae5; color: #065f46; }
    .status-REJECTED { background: #fee2e2; color: #991b1b; }
    .status-DRAFT { background: #f3f4f6; color: #374151; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #888;
      text-align: center;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Hirachand Gumanji Family Charitable Trust</h1>
    <h2>Hostel Application Form</h2>
    <p>Generated on ${new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}</p>
  </div>

  <div class="tracking">
    <p>Application Tracking Number</p>
    <strong>${trackingNumber}</strong>
    <br><br>
    <span class="status status-${status}">${status.replace(/_/g, ' ')}</span>
  </div>

  <div class="section">
    <div class="section-title">Application Details</div>
    <div class="row"><div class="label">Vertical</div><div class="value">${vertical}</div></div>
    <div class="row"><div class="label">Submitted On</div><div class="value">${submittedAt ? new Date(submittedAt).toLocaleString('en-IN') : 'N/A'}</div></div>
    <div class="row"><div class="label">Application Type</div><div class="value">${application.type || 'NEW'}</div></div>
  </div>

  <div class="section">
    <div class="section-title">Personal Information</div>
    ${photoDataUri ? `
    <div style="float: right; margin: 0 0 10px 15px;">
      <img src="${photoDataUri}" alt="Applicant photograph"
           style="width: 110px; height: 140px; object-fit: cover; border: 1px solid #999; background: #f5f5f5;" />
    </div>
    ` : ''}
    <div class="row"><div class="label">Full Name</div><div class="value">${fullName}</div></div>
    <div class="row"><div class="label">Date of Birth</div><div class="value">${dob}</div></div>
    <div class="row"><div class="label">Gender</div><div class="value">${gender}</div></div>
    <div class="row"><div class="label">Blood Group</div><div class="value">${bloodGroup}</div></div>
    <div class="row"><div class="label">Mobile Number</div><div class="value">${mobile}</div></div>
    <div class="row"><div class="label">Email</div><div class="value">${email}</div></div>
    <div class="row"><div class="label">Address</div><div class="value">${address}</div></div>
    <div style="clear: both;"></div>
  </div>

  <div class="section">
    <div class="section-title">Guardian Information</div>
    <div class="row"><div class="label">Father's Name</div><div class="value">${guardianInfo.father_name || 'N/A'}</div></div>
    <div class="row"><div class="label">Father's Occupation</div><div class="value">${guardianInfo.father_occupation || 'N/A'}</div></div>
    <div class="row"><div class="label">Father's Mobile</div><div class="value">${guardianInfo.father_mobile || 'N/A'}</div></div>
    <div class="row"><div class="label">Mother's Name</div><div class="value">${guardianInfo.mother_name || 'N/A'}</div></div>
    <div class="row"><div class="label">Mother's Occupation</div><div class="value">${guardianInfo.mother_occupation || 'N/A'}</div></div>
    <div class="row"><div class="label">Mother's Mobile</div><div class="value">${guardianInfo.mother_mobile || 'N/A'}</div></div>
    <div class="row"><div class="label">Emergency Contact</div><div class="value">${emergencyContact.name || 'N/A'} (${emergencyContact.mobile || 'N/A'})</div></div>
  </div>

  <div class="section">
    <div class="section-title">Education Details</div>
    <div class="row"><div class="label">Institution</div><div class="value">${academicInfo.institution || 'N/A'}</div></div>
    <div class="row"><div class="label">Course</div><div class="value">${academicInfo.course || 'N/A'}</div></div>
    <div class="row"><div class="label">Year</div><div class="value">${academicInfo.year || 'N/A'}</div></div>
    <div class="row"><div class="label">Previous Qualification</div><div class="value">${academicInfo.qualification || 'N/A'}</div></div>
    <div class="row"><div class="label">Board/University</div><div class="value">${academicInfo.board || 'N/A'}</div></div>
    <div class="row"><div class="label">Passing Year</div><div class="value">${academicInfo.passing_year || 'N/A'}</div></div>
  </div>

  <div class="section">
    <div class="section-title">Hostel Preferences</div>
    <div class="row"><div class="label">Room Type</div><div class="value">${hostelPrefs.room_type || 'N/A'}</div></div>
    <div class="row"><div class="label">Duration</div><div class="value">${hostelPrefs.duration || 'N/A'}</div></div>
    <div class="row"><div class="label">Joining Date</div><div class="value">${hostelPrefs.joining_date || 'N/A'}</div></div>
    ${hostelPrefs.special_requirements ? `<div class="row"><div class="label">Special Requirements</div><div class="value">${hostelPrefs.special_requirements}</div></div>` : ''}
  </div>

  ${data.declaration_accepted ? `
  <div class="section">
    <div class="section-title">Declaration</div>
    <p style="padding: 10px 0; font-size: 14px;">
      I hereby declare that all the information provided above is true and correct to the best of my knowledge.
      I understand that any false information may result in rejection of my application.
    </p>
    <p style="padding: 5px 0; font-size: 12px; color: #666;">
      Declaration accepted on: ${data.declaration_timestamp ? new Date(data.declaration_timestamp).toLocaleString('en-IN') : 'N/A'}
    </p>
  </div>
  ` : ''}

  <div class="footer">
    <p>This is a computer-generated document. For official use, please contact the hostel administration.</p>
    <p>Hirachand Gumanji Family Charitable Trust | Contact: +91 22 2414 1234</p>
  </div>

  <script class="no-print">
    window.onload = function() { window.print(); }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="application-${trackingNumber}.html"`,
      },
    });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
