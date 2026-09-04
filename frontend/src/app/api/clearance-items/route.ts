import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth } from '@/lib/authorize';

/**
 * GET /api/clearance-items
 * List exit-clearance requests with progress and outstanding fee dues.
 * Used by the Accounts dashboard Clearance tab.
 * Auth: ACCOUNTS, SUPERINTENDENT, TRUSTEE
 *
 * Optional filters: vertical, status (clearance_status)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ACCOUNTS', 'SUPERINTENDENT', 'TRUSTEE']);
    const { searchParams } = new URL(request.url);
    const vertical = searchParams.get('vertical');
    const status = searchParams.get('status');

    let sql = `
      SELECT
        er.id,
        er.student_id,
        er.requested_date,
        er.actual_exit_date,
        er.status,
        er.clearance_status,
        er.created_at,
        u.full_name AS student_name,
        u.vertical,
        r.room_number,
        COALESCE(due.outstanding_amount, 0) AS outstanding_amount,
        COALESCE(due.outstanding_count, 0) AS outstanding_count
      FROM exit_requests er
      LEFT JOIN users u ON u.id = er.student_id
      LEFT JOIN room_allocations ra ON ra.student_id = er.student_id AND ra.status = 'ACTIVE'
      LEFT JOIN rooms r ON r.id = ra.room_id
      LEFT JOIN (
        SELECT
          student_id,
          SUM(GREATEST(amount - COALESCE(paid_amount, 0), 0)) AS outstanding_amount,
          COUNT(*) FILTER (WHERE status != 'PAID') AS outstanding_count
        FROM fees
        WHERE status != 'PAID'
        GROUP BY student_id
      ) due ON due.student_id = er.student_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (vertical && vertical !== 'ALL') {
      params.push(vertical);
      sql += ` AND u.vertical = $${params.length}`;
    }

    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND er.clearance_status = $${params.length}`;
    }

    // Superintendents are scoped to their vertical
    if (user.role === 'SUPERINTENDENT' && user.vertical) {
      params.push(user.vertical);
      sql += ` AND u.vertical = $${params.length}`;
    }

    sql += ` ORDER BY er.created_at DESC`;

    const { rows: exitRequests } = await query(sql, params);

    const requests = await Promise.all(
      exitRequests.map(async (er: any) => {
        const { rows: items } = await query(
          `SELECT id, item_type, status FROM exit_clearance_items WHERE exit_request_id = $1`,
          [er.id]
        );
        const total = items.length;
        const completed = items.filter((i: any) => i.status === 'COMPLETED').length;
        const pending = items.filter((i: any) => i.status === 'PENDING').length;
        const daysSinceSubmission = Math.floor(
          (Date.now() - new Date(er.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          id: er.id,
          studentId: er.student_id,
          studentName: er.student_name || 'Unknown',
          vertical: er.vertical || 'BOYS',
          roomNumber: er.room_number || 'N/A',
          requestedExitDate: er.requested_date,
          actualExitDate: er.actual_exit_date,
          submittedDate: er.created_at,
          status: er.status,
          clearanceStatus: er.clearance_status,
          outstandingAmount: Number(er.outstanding_amount) || 0,
          outstandingCount: Number(er.outstanding_count) || 0,
          progress: { total, completed, pending },
          agingDays: daysSinceSubmission,
        };
      })
    );

    return successResponse(requests);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/clearance-items:', error);
    return serverErrorResponse('Failed to fetch clearance items', error);
  }
}
