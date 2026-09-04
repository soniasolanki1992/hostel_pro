import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  badRequestResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { LeaveStatus } from '@/types/api';
import { requireAuth } from '@/lib/authorize';
import { sendEmail } from '@/lib/mailer';
import { renderLeaveDecision } from '@/lib/email-templates/leave-decision';
import { logger } from '@/lib/logger';

/**
 * PUT /api/leaves/[id]/approve
 * Approve a leave request
 * Auth: SUPERINTENDENT only
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(_request, ['SUPERINTENDENT']);
    const { id } = await params;

    // Get leave request
    const { rows: leaveRows } = await query(
      'SELECT * FROM leave_requests WHERE id = $1',
      [id]
    );

    if (leaveRows.length === 0) {
      return notFoundResponse('Leave request not found');
    }

    const leave = leaveRows[0];

    if (leave.status !== 'PENDING') {
      return badRequestResponse(
        `Leave request has already been ${leave.status.toLowerCase()}`
      );
    }

    // Update leave status and log — in one transaction
    const now = new Date().toISOString();
    const updatedLeave = await withTransaction(async (client) => {
      const { rows: updatedRows } = await client.query(
        `UPDATE leave_requests
         SET status = $1, approved_at = $2, parent_notified_at = $3
         WHERE id = $4
         RETURNING *`,
        ['APPROVED', now, now, id]
      );

      if (updatedRows.length === 0) {
        throw new Error('Failed to approve leave');
      }

      // Log approval
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          'LEAVE_REQUEST',
          id,
          'APPROVE',
          JSON.stringify({
            student_id: leave.student_id,
            leave_type: leave.leave_type,
            old_status: 'PENDING',
            new_status: 'APPROVED',
          }),
        ]
      );

      return updatedRows[0];
    });

    // Notify student via email
    try {
      const { rows: studentRows } = await query(
        'SELECT email, full_name FROM users WHERE id = $1',
        [leave.student_id]
      );
      const student = studentRows[0];
      if (student?.email) {
        const rendered = renderLeaveDecision({
          name: student.full_name || 'Resident',
          decision: 'APPROVED',
          leaveType: leave.leave_type,
          startTime: leave.start_time,
          endTime: leave.end_time,
        });
        sendEmail({
          to: student.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        }).catch((err) => {
          logger.error('Leave-approved email dispatch failed', {
            leaveId: id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.error('Leave-approved email lookup failed', {
        leaveId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return successResponse({ data: updatedLeave });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in PUT /api/leaves/[id]/approve:', error);
    return serverErrorResponse('Failed to approve leave', error);
  }
}
