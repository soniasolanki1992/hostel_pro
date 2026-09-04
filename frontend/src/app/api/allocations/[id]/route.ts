import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth } from '@/lib/authorize';

/**
 * GET /api/allocations/[id]
 * Get a single allocation by ID
 * Auth: SUPERINTENDENT, TRUSTEE
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE']);
    const { id } = await props.params;



    const { rows } = await query(
      `SELECT ra.*,
              row_to_json(r.*) AS rooms,
              row_to_json(u.*) AS users
       FROM room_allocations ra
       LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN users u ON u.id = ra.student_id
       WHERE ra.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return notFoundResponse('Allocation not found');
    }

    return successResponse(rows[0]);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/allocations/[id]:', error);
    return serverErrorResponse('Failed to fetch allocation', error);
  }
}

/**
 * PUT /api/allocations/[id]
 * Update an allocation (e.g. check-in confirmation)
 * Auth: SUPERINTENDENT, TRUSTEE
 */
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request, ['STUDENT', 'SUPERINTENDENT', 'TRUSTEE']);
    const { id } = await props.params;
    const body = await request.json();

    // Check if allocation exists
    const { rows: existingRows } = await query(
      'SELECT * FROM room_allocations WHERE id = $1',
      [id]
    );

    if (existingRows.length === 0) {
      return notFoundResponse('Allocation not found');
    }

    // Students can only update their own allocation (S-18).
    if (user.role === 'STUDENT' && existingRows[0].student_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'You can only check in to your own allocation' },
        { status: 403 }
      );
    }

    // Only allow updating specific fields. Students can only confirm
    // check-in; status transitions (VACATED, etc.) are staff-only.
    const STUDENT_ALLOWED_FIELDS = ['check_in_confirmed', 'check_in_confirmed_at', 'check_in_inventory'];
    const STAFF_ALLOWED_FIELDS = [...STUDENT_ALLOWED_FIELDS, 'status'];
    const ALLOWED_FIELDS = user.role === 'STUDENT' ? STUDENT_ALLOWED_FIELDS : STAFF_ALLOWED_FIELDS;
    const setClauses: string[] = [];
    const values: any[] = [];

    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        values.push(key === 'check_in_inventory' ? JSON.stringify(body[key]) : body[key]);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return successResponse(existingRows[0]);
    }

    values.push(id);

    const { rows: updatedRows } = await query(
      `UPDATE room_allocations SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (updatedRows.length === 0) {
      return serverErrorResponse('Failed to update allocation');
    }

    return successResponse(updatedRows[0]);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in PUT /api/allocations/[id]:', error);
    return serverErrorResponse('Failed to update allocation', error);
  }
}
