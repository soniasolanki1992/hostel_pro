import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';

/**
 * GET /api/applications
 * Get all applications or filter by tracking_number, vertical, or status
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS (staff only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS']);
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('tracking_number');
    const vertical = searchParams.get('vertical');
    const status = searchParams.get('status');

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Superintendents can only see their own vertical
    const verticalFilter = getVerticalFilter(user);
    if (verticalFilter) {
      conditions.push(`vertical = $${paramIndex++}`);
      params.push(verticalFilter);
    }

    if (trackingNumber) {
      conditions.push(`tracking_number = $${paramIndex++}`);
      params.push(trackingNumber);
    }

    if (vertical && !verticalFilter) {
      conditions.push(`vertical = $${paramIndex++}`);
      params.push(vertical);
    }

    if (status) {
      conditions.push(`current_status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Math.min(Math.max(limitParam, 1), 500);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);
    const offset = Math.max(offsetParam, 0);
    const sql = `SELECT * FROM applications ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);

    return successResponse(rows || []);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/applications:', error);
    return serverErrorResponse('Failed to fetch applications', error);
  }
}

/**
 * POST /api/applications
 * Create a new application
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Map frontend vertical to database enum
    const verticalMap: Record<string, string> = {
      'boys-hostel': 'BOYS_HOSTEL',
      'girls-ashram': 'GIRLS_ASHRAM',
      'dharamshala': 'DHARAMSHALA',
      'BOYS_HOSTEL': 'BOYS_HOSTEL',
      'GIRLS_ASHRAM': 'GIRLS_ASHRAM',
      'DHARAMSHALA': 'DHARAMSHALA',
    };
    const vertical = verticalMap[body.vertical] || 'BOYS_HOSTEL';

    // Reject if admissions for this vertical are closed by the Superintendent.
    const verticalSlugMap: Record<string, string> = {
      'BOYS_HOSTEL': 'boys-hostel',
      'GIRLS_ASHRAM': 'girls-ashram',
      'DHARAMSHALA': 'dharamshala',
    };
    const verticalSlug = verticalSlugMap[vertical];
    const { rows: settingRows } = await query(
      'SELECT value FROM system_settings WHERE key = $1',
      [`applications_open_${verticalSlug}`],
    );
    if (settingRows?.[0]?.value === 'false') {
      return NextResponse.json(
        { success: false, error: `Admissions for ${verticalSlug} are currently closed. Please check back later.` },
        { status: 403 },
      );
    }

    // Generate tracking number based on vertical
    const prefix = vertical === 'BOYS_HOSTEL' ? 'BH' : vertical === 'GIRLS_ASHRAM' ? 'GA' : 'DH';
    const year = new Date().getFullYear();

    // Get count of applications this year for this vertical to generate sequence
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS count FROM applications WHERE tracking_number LIKE $1`,
      [`${prefix}-${year}%`]
    );

    const count = parseInt(countRows[0]?.count || '0', 10);
    const sequence = String(count + 1).padStart(5, '0');
    const trackingNumber = `${prefix}-${year}-${sequence}`;

    // Construct applicant name from firstName, middleName, lastName
    const applicantName = body.applicant_name || body.applicantName ||
      [body.firstName, body.middleName, body.lastName].filter(Boolean).join(' ').trim();

    // Get applicant mobile - use fatherMobile as primary contact if not provided
    const applicantMobile = body.applicant_mobile || body.applicantMobile ||
      body.fatherMobile || body.father_mobile || '';

    // Get applicant email
    const applicantEmail = body.applicant_email || body.applicantEmail ||
      body.fatherEmail || body.father_email || null;

    // Map date of birth
    const dateOfBirth = body.date_of_birth || body.dateOfBirth || body.dob || null;

    // Map gender - capitalize first letter for consistency
    let gender = body.gender || '';
    if (gender) {
      gender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
    }

    // Validate required fields
    if (!applicantName) {
      return badRequestResponse('Applicant name is required');
    }
    if (!applicantMobile) {
      return badRequestResponse('Mobile number is required');
    }
    if (!dateOfBirth) {
      return badRequestResponse('Date of birth is required');
    }
    if (!gender) {
      return badRequestResponse('Gender is required');
    }

    // Build the data JSONB object
    const data = {
      // Personal info
      personal_info: {
        full_name: applicantName,
        first_name: body.firstName,
        middle_name: body.middleName,
        last_name: body.lastName,
        date_of_birth: dateOfBirth,
        gender: gender,
        blood_group: body.bloodGroup,
      },
      // Address
      address: {
        line1: body.addressLine1,
        line2: body.addressLine2,
        city: body.city,
        state: body.state,
        pin_code: body.pinCode,
      },
      // Guardian info
      guardian_info: {
        father_name: body.fatherName,
        father_mobile: body.fatherMobile,
        father_occupation: body.fatherOccupation,
        father_email: body.fatherEmail,
        mother_name: body.motherName,
        mother_mobile: body.motherMobile,
        mother_occupation: body.motherOccupation,
        mother_email: body.motherEmail,
        guardian_name: body.guardianName,
        guardian_relationship: body.guardianRelationship,
        guardian_mobile: body.guardianMobile,
      },
      // Emergency contact
      emergency_contact: {
        name: body.emergencyContactPerson,
        mobile: body.emergencyMobile,
        relationship: body.emergencyRelationship,
      },
      // Academic info
      academic_info: {
        institution: body.institution,
        course: body.course,
        year: body.year,
        percentage: body.percentage,
        qualification: body.qualification,
        board: body.board,
        passing_year: body.passingYear,
      },
      // Hostel preferences
      hostel_preferences: {
        vertical: vertical,
        room_type: body.roomType,
        duration: body.duration,
        joining_date: body.joiningDate,
        special_requirements: body.specialRequirements,
      },
      // References
      references: [
        {
          name: body.ref1Name,
          mobile: body.ref1Mobile,
          year_of_stay: body.ref1Year,
          relationship: body.ref1Relationship,
        },
        body.ref2Name ? {
          name: body.ref2Name,
          mobile: body.ref2Mobile,
          year_of_stay: body.ref2Year,
          relationship: body.ref2Relationship,
        } : null,
      ].filter(Boolean),
      // Declaration
      declaration_accepted: body.declarationAccepted,
      declaration_timestamp: body.declarationAccepted ? new Date().toISOString() : null,
      // Documents
      documents: body.documents || [],
    };

    const isHostelVertical = vertical === 'BOYS_HOSTEL' || vertical === 'GIRLS_ASHRAM';

    // Hostel verticals: force DRAFT — only the PhonePe verify route flips to SUBMITTED.
    // Dharamshala: honor whatever status the client sent (typically SUBMITTED).
    const currentStatus = isHostelVertical ? 'DRAFT' : (body.status || 'DRAFT');
    const submittedAt = currentStatus === 'SUBMITTED' ? new Date().toISOString() : null;

    const { rows } = await query(
      `INSERT INTO applications (
        tracking_number, type, applicant_name, applicant_mobile, applicant_email,
        vertical, current_status, data, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        trackingNumber,
        body.type || 'NEW',
        applicantName,
        applicantMobile,
        applicantEmail,
        vertical,
        currentStatus,
        JSON.stringify(data),
        submittedAt,
      ]
    );

    const application = rows[0];

    // For hostel verticals, create the ADMISSION_FEE row that the PhonePe flow will pay.
    if (isHostelVertical) {
      await query(
        `INSERT INTO fees (application_id, fee_head, description, amount, status, due_date)
         VALUES ($1, 'ADMISSION_FEE', 'Non-refundable admission fee', 500, 'PENDING', NOW() + INTERVAL '7 days')`,
        [application.id],
      );
    }

    // Return with trackingNumber in root for frontend compatibility
    return createdResponse({
      ...application,
      trackingNumber: application.tracking_number,
    });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in POST /api/applications:', error);
    return serverErrorResponse('Failed to create application', error);
  }
}
