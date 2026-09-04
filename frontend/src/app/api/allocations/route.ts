import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  serverErrorResponse,
  validateFields,
} from '@/lib/api/responses';
import { AllocationAPI, AllocationStatus } from '@/types/api';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';

/**
 * GET /api/allocations
 * List room allocations
 * Auth: STUDENT (own only), SUPERINTENDENT, TRUSTEE
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['STUDENT', 'SUPERINTENDENT', 'TRUSTEE']);
    const { searchParams } = new URL(request.url);
    const studentIdParam = searchParams.get('student_id');

    // Students can only see their own allocations
    const isStudent = user.role === 'STUDENT';
    const filterStudentId = isStudent ? user.id : studentIdParam;

    let sql = `SELECT ra.*,
              row_to_json(r.*) AS rooms,
              row_to_json(u.*) AS users
       FROM room_allocations ra
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN users u ON u.id = ra.student_id`;
    const params: string[] = [];
    const conditions: string[] = [];

    if (filterStudentId) {
      params.push(filterStudentId);
      conditions.push(`ra.student_id = $${params.length}`);
    }

    // Superintendents only see their vertical's allocations
    const verticalFilter = getVerticalFilter(user);
    if (verticalFilter) {
      params.push(verticalFilter);
      conditions.push(`r.vertical = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY ra.allocated_at DESC`;

    const { rows: allocations } = await query(sql, params);

    return successResponse(allocations);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/allocations:', error);
    return serverErrorResponse('Failed to fetch allocations', error);
  }
}

/**
 * POST /api/allocations
 * Create a new room allocation.
 * Pass either:
 *   - { student_id, room_id } for standard allocation (student already APPROVED), OR
 *   - { application_id, room_id } to atomically promote a WAITLIST application to
 *     APPROVED, create its student user, and allocate a room — all in one transaction.
 * Auth: SUPERINTENDENT, TRUSTEE
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE']);
    const body: AllocationAPI.CreateRequest & { application_id?: string } = await request.json();
    const { room_id } = body;
    let { student_id } = body;
    const application_id = body.application_id;

    if (!room_id) {
      return badRequestResponse('Validation failed', { room_id: ['Room ID is required'] });
    }
    if (!student_id && !application_id) {
      return badRequestResponse('Validation failed', {
        student_id: ['Either student_id or application_id is required'],
      });
    }

    // If promoting from waitlist, look up the application up-front so we can validate vertical.
    let waitlistApp: any = null;
    if (application_id) {
      const { rows: appRows } = await query(
        'SELECT * FROM applications WHERE id = $1',
        [application_id]
      );
      if (appRows.length === 0) {
        return badRequestResponse('Application not found');
      }
      waitlistApp = appRows[0];
      if (waitlistApp.current_status !== 'WAITLIST') {
        return badRequestResponse(
          `Application is not on the waitlist (status: ${waitlistApp.current_status})`
        );
      }
    }

    // Verify room exists and has capacity
    const { rows: roomRows } = await query(
      'SELECT * FROM rooms WHERE id = $1',
      [room_id]
    );

    if (roomRows.length === 0) {
      return badRequestResponse('Room not found');
    }

    const room = roomRows[0];

    // Enforce vertical scope for superintendents
    const verticalFilter = getVerticalFilter(user);
    if (verticalFilter && room.vertical !== verticalFilter) {
      return badRequestResponse('You can only allocate rooms in your own vertical');
    }

    if (room.occupied_count >= room.capacity) {
      return badRequestResponse('Room is at full capacity');
    }

    // For waitlist promotion: verify the application's vertical matches the room.
    if (waitlistApp && waitlistApp.vertical !== room.vertical) {
      return badRequestResponse('Application and room must belong to the same vertical');
    }

    // For standard allocation: verify student vertical and existing-allocation guard.
    if (student_id) {
      const { rows: studentRows } = await query(
        'SELECT vertical FROM users WHERE id = $1 AND role = $2',
        [student_id, 'STUDENT']
      );
      if (studentRows.length === 0) {
        return badRequestResponse('Student not found');
      }
      if (studentRows[0].vertical !== room.vertical) {
        return badRequestResponse('Student and room must belong to the same vertical');
      }

      const { rows: existingRows } = await query(
        'SELECT id FROM room_allocations WHERE student_id = $1 AND status = $2',
        [student_id, 'ACTIVE']
      );

      if (existingRows.length > 0) {
        return badRequestResponse('Student already has an active room allocation');
      }
    }

    // Create allocation, update room occupancy, and log — all in one transaction.
    // For waitlist promotion: also flip the application to APPROVED and create the student user.
    const newAllocation = await withTransaction(async (client) => {
      // Promote waitlist → APPROVED + create student user, if applicable.
      if (waitlistApp && !student_id) {
        const bcrypt = require('bcryptjs');
        const nameParts = (waitlistApp.applicant_name || '').trim().split(/\s+/);
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || 'User';
        const last4 = (waitlistApp.tracking_number || '').slice(-4);
        const dob = waitlistApp.date_of_birth ? new Date(waitlistApp.date_of_birth) : null;
        const dobStr = dob
          ? `${String(dob.getDate()).padStart(2, '0')}${String(dob.getMonth() + 1).padStart(2, '0')}${dob.getFullYear()}`
          : '01011990';
        const tempPassword = `${lastName}@${last4}#${dobStr}`;
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        let createdStudentId: string | null = waitlistApp.student_user_id || null;
        if (!createdStudentId) {
          const { rows: userRows } = await client.query(
            `INSERT INTO users (
              role, vertical, full_name, email, mobile, date_of_birth,
              password_hash, is_active, requires_password_change, profile_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
            [
              'STUDENT',
              waitlistApp.vertical,
              waitlistApp.applicant_name,
              waitlistApp.applicant_email,
              waitlistApp.applicant_mobile,
              waitlistApp.date_of_birth || null,
              passwordHash,
              true,
              true,
              JSON.stringify({
                application_id: waitlistApp.id,
                tracking_number: waitlistApp.tracking_number,
                approved_at: new Date().toISOString(),
                promoted_from_waitlist: true,
                guardian_info: waitlistApp.data?.guardian_info || {},
              }),
            ]
          );
          createdStudentId = userRows[0].id;
        }

        await client.query(
          `UPDATE applications
           SET current_status = 'APPROVED', approved_at = NOW(), student_user_id = $1
           WHERE id = $2`,
          [createdStudentId, waitlistApp.id]
        );

        await client.query(
          `INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'APPLICATION',
            waitlistApp.id,
            'STATUS_CHANGE',
            user.id,
            JSON.stringify({
              tracking_number: waitlistApp.tracking_number,
              old_status: 'WAITLIST',
              new_status: 'APPROVED',
              reason: 'Promoted from waitlist on room allocation',
            }),
          ]
        );

        student_id = createdStudentId!;
      }

      const { rows: insertRows } = await client.query(
        `INSERT INTO room_allocations (student_id, room_id, status)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [student_id, room_id, 'ACTIVE']
      );

      if (insertRows.length === 0) {
        throw new Error('Failed to create allocation');
      }

      const allocation = insertRows[0];

      // Update room occupancy
      const newOccupied = room.occupied_count + 1;
      const newStatus =
        newOccupied >= room.capacity ? 'FULL' :
        newOccupied > 0 ? 'PARTIAL' : 'AVAILABLE';
      await client.query(
        `UPDATE rooms SET occupied_count = $1, status = $2 WHERE id = $3`,
        [newOccupied, newStatus, room_id]
      );

      // Log allocation
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          'ROOM_ALLOCATION',
          allocation.id,
          'CREATE',
          JSON.stringify({
            student_id,
            room_id,
            room_number: room.room_number,
          }),
        ]
      );

      return allocation;
    });

    return createdResponse(
      { data: newAllocation } as AllocationAPI.CreateResponse,
      'Room allocated successfully'
    );
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in POST /api/allocations:', error);
    return serverErrorResponse('Failed to create allocation', error);
  }
}
