import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  badRequestResponse,
  serverErrorResponse,
  validateFields,
} from '@/lib/api/responses';
import { LeaveAPI } from '@/types/api';
import { requireAuth } from '@/lib/authorize';
import { sendEmail } from '@/lib/mailer';
import { renderLeaveDecision } from '@/lib/email-templates/leave-decision';
import { logger } from '@/lib/logger';

/**
 * PUT /api/leaves/[id]/reject
 * Reject a leave request with reason
 * Auth: SUPERINTENDENT only
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT']);
    const { id } = await params;
    const body: LeaveAPI.RejectRequest = await request.json();
    const { reason } = body;

    // Validate rejection reason
    const validation = validateFields([
      {
        field: 'reason',
        value: reason,
        rules: [
          { type: 'required', message: 'Rejection reason is required' },
          {
            type: 'min',
            param: 10,
            message: 'Reason must be at least 10 characters',
          },
        ],
      },
    ]);

    if (!validation.isValid) {
      return badRequestResponse('Validation failed', validation.errors);
    }

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
         SET status = $1, rejected_at = $2, rejection_reason = $3, parent_notified_at = $4
         WHERE id = $5
         RETURNING *`,
        ['REJECTED', now, reason, now, id]
      );

      if (updatedRows.length === 0) {
        throw new Error('Failed to reject leave');
      }

      // Log rejection
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          'LEAVE_REQUEST',
          id,
          'REJECT',
          JSON.stringify({
            student_id: leave.student_id,
            leave_type: leave.leave_type,
            rejection_reason: reason,
            old_status: 'PENDING',
            new_status: 'REJECTED',
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
          decision: 'REJECTED',
          leaveType: leave.leave_type,
          startTime: leave.start_time,
          endTime: leave.end_time,
          reason,
        });
        sendEmail({
          to: student.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        }).catch((err) => {
          logger.error('Leave-rejected email dispatch failed', {
            leaveId: id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.error('Leave-rejected email lookup failed', {
        leaveId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return successResponse({ data: updatedLeave });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in PUT /api/leaves/[id]/reject:', error);
    return serverErrorResponse('Failed to reject leave', error);
  }
}
