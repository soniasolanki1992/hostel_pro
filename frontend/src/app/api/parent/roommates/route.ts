import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifySignedSessionToken } from '@/lib/auth';

/**
 * GET /api/parent/roommates?sessionToken=...&studentId=...
 * Returns names + mobile numbers of the student's active roommates.
 * Auth: PARENT only — verifies the requested studentId is linked to the parent.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('sessionToken');
    const studentId = searchParams.get('studentId');

    if (!sessionToken) {
      return NextResponse.json({ message: 'Authentication required. Please login again.' }, { status: 401 });
    }

    const tokenData = verifySignedSessionToken(sessionToken);
    if (!tokenData) {
      return NextResponse.json({ message: 'Invalid or expired session token. Please login again.' }, { status: 401 });
    }

    if (tokenData.vertical !== 'parent') {
      return NextResponse.json({ message: 'Access denied. Parent access required.' }, { status: 403 });
    }

    if (!studentId) {
      return NextResponse.json({ message: 'studentId is required.' }, { status: 400 });
    }

    const normalizePhone = (phone: string) => phone?.replace(/[\s+\-]/g, '').slice(-10) || '';
    const normalizedParentMobile = normalizePhone(tokenData.contact as string);

    // Verify the studentId belongs to a ward of this parent.
    const { rows: linkRows } = await query(
      `SELECT 1 FROM applications
       WHERE student_user_id = $1
         AND (data->'guardian_info'->>'father_mobile' LIKE $2
              OR data->'guardian_info'->>'mother_mobile' LIKE $2)
       LIMIT 1`,
      [studentId, `%${normalizedParentMobile}`]
    );

    if (linkRows.length === 0) {
      return NextResponse.json({ message: 'Access denied. Student is not linked to this parent.' }, { status: 403 });
    }

    // Find the student's active room allocation.
    const { rows: allocRows } = await query(
      `SELECT ra.room_id, r.room_number, r.vertical, r.floor, r.building
       FROM room_allocations ra
       LEFT JOIN rooms r ON ra.room_id = r.id
       WHERE ra.student_id = $1 AND ra.status = 'ACTIVE'
       LIMIT 1`,
      [studentId]
    );

    if (allocRows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { room: null, roommates: [] },
        message: 'No active room allocation yet.',
      });
    }

    const room = allocRows[0];

    // Roommates: other ACTIVE allocations in the same room.
    const { rows: mateRows } = await query(
      `SELECT u.id, u.full_name, u.mobile
       FROM room_allocations ra
       JOIN users u ON u.id = ra.student_id
       WHERE ra.room_id = $1
         AND ra.status = 'ACTIVE'
         AND ra.student_id <> $2
       ORDER BY u.full_name ASC`,
      [room.room_id, studentId]
    );

    return NextResponse.json({
      success: true,
      data: {
        room: {
          roomNumber: room.room_number,
          vertical: room.vertical,
          floor: room.floor,
          building: room.building,
        },
        roommates: mateRows.map((r: any) => ({
          id: r.id,
          name: r.full_name,
          mobile: r.mobile,
        })),
      },
    });
  } catch (error) {
    console.error('Error in GET /api/parent/roommates:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ message: 'Method not allowed. This endpoint is read-only.' }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ message: 'Method not allowed. This endpoint is read-only.' }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ message: 'Method not allowed. This endpoint is read-only.' }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ message: 'Method not allowed. This endpoint is read-only.' }, { status: 405 });
}
