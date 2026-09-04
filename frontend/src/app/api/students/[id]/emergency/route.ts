import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/authorize';

/**
 * GET /api/students/[id]/emergency
 * Returns emergency-relevant info for a student/resident, sourced from:
 *  - users (basic identity, blood_group)
 *  - applications.data (guardian info, emergency contact, address, medical/special notes)
 *
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS, or self.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(request);
    const { id } = await params;

    const allowedRoles = ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS'];
    if (!allowedRoles.includes(authUser.role) && authUser.id !== id) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Pull the user (for blood group + identity) and the most recent application
    // tied to this student.
    const { rows: userRows } = await query(
      `SELECT id, full_name, mobile, email, vertical FROM users WHERE id = $1`,
      [id]
    );
    if (userRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }
    const user = userRows[0];

    const { rows: appRows } = await query(
      `SELECT id, tracking_number, current_status, data, vertical
       FROM applications
       WHERE student_user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );
    const app = appRows[0];
    const data = app?.data || {};

    const guardian = data.guardian_info || {};
    const emergency = data.emergency_contact || {};
    const personal = data.personal_info || {};
    const address = data.address || {};
    const hostelPrefs = data.hostel_preferences || {};

    return NextResponse.json({
      success: true,
      data: {
        student: {
          id: user.id,
          name: user.full_name,
          mobile: user.mobile,
          email: user.email,
          vertical: user.vertical,
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
        application: app
          ? {
              id: app.id,
              trackingNumber: app.tracking_number,
              status: app.current_status,
            }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/students/[id]/emergency:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
