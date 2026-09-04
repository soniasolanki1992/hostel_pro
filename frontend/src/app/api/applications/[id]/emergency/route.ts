import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/authorize';

/**
 * GET /api/applications/[id]/emergency
 * Returns emergency-relevant info for an application — sourced from
 * applications.data (jsonb). Works for applicants who do not yet have a
 * student user account.
 *
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // S-18: enforce allowed roles via requireAuth itself rather than a
    // post-hoc check that lets any authenticated user reach the body.
    await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS']);
    const { id } = await params;

    const { rows } = await query(
      `SELECT id, tracking_number, current_status, applicant_name, applicant_mobile,
              applicant_email, vertical, data
       FROM applications WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Application not found' }, { status: 404 });
    }
    const app = rows[0];
    const data = app.data || {};

    const personal = data.personal_info || {};
    const guardian = data.guardian_info || {};
    const emergency = data.emergency_contact || {};
    const address = data.address || {};
    const hostelPrefs = data.hostel_preferences || {};

    return NextResponse.json({
      success: true,
      data: {
        student: {
          id: app.id,
          name: app.applicant_name || personal.full_name || 'Unknown',
          mobile: app.applicant_mobile || null,
          email: app.applicant_email || null,
          vertical: app.vertical || null,
          bloodGroup: personal.blood_group || null,
          dateOfBirth: personal.date_of_birth || null,
          gender: personal.gender || null,
        },
        father: {
          name: guardian.father_name || null,
          mobile: guardian.father_mobile || null,
          occupation: guardian.father_occupation || null,
          email: guardian.father_email || null,
        },
        mother: {
          name: guardian.mother_name || null,
          mobile: guardian.mother_mobile || null,
          occupation: guardian.mother_occupation || null,
          email: guardian.mother_email || null,
        },
        localGuardian: {
          name: guardian.guardian_name || null,
          relationship: guardian.guardian_relationship || null,
          mobile: guardian.guardian_mobile || null,
        },
        emergencyContact: {
          name: emergency.name || null,
          mobile: emergency.mobile || null,
          relationship: emergency.relationship || null,
        },
        address: {
          line1: address.line1 || null,
          line2: address.line2 || null,
          city: address.city || null,
          state: address.state || null,
          pinCode: address.pin_code || null,
        },
        medicalNotes: hostelPrefs.special_requirements || null,
        application: {
          id: app.id,
          trackingNumber: app.tracking_number,
          status: app.current_status,
        },
      },
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/applications/[id]/emergency:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
