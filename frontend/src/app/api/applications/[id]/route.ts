import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  badRequestResponse,
  serverErrorResponse,
  errorResponse,
} from '@/lib/api/responses';
import type { ApplicationAPI } from '@/types/api';
import { requireAuth } from '@/lib/authorize';
import { hasAvailableRoom, type VerticalCode } from '@/lib/rooms';
import { adjustAdmissionFeeCredit } from '@/lib/payments/admission-credit';
import { sendEmail } from '@/lib/mailer';
import { renderLoginInvite } from '@/lib/email-templates/login-invite';
import { renderApplicationRejected } from '@/lib/email-templates/application-rejected';
import { logger } from '@/lib/logger';

/**
 * GET /api/applications/[id]
 * Get a single application by ID
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS (staff only)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(_request, ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS']);
    const { id } = await params;

    const { rows } = await query(
      'SELECT * FROM applications WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return notFoundResponse('Application not found');
    }

    const application = rows[0];

    // Fetch documents from documents table (linked by application_id or student_user_id)
    const { rows: docs } = await query(
      `SELECT id, document_type, category, file_name, file_path, file_size, mime_type, verification_status, uploaded_at
       FROM documents
       WHERE application_id = $1 OR ($2::uuid IS NOT NULL AND student_user_id = $2)
       ORDER BY uploaded_at DESC`,
      [id, application.student_user_id]
    );

    // Add documents to application response
    const formattedDocs = docs.map((doc: any) => ({
      id: doc.id,
      type: doc.document_type,
      documentType: doc.document_type,
      dbDocumentType: doc.document_type,
      category: doc.category,
      originalFileName: doc.file_name,
      fileSize: doc.file_size,
      mimeType: doc.mime_type,
      storagePath: doc.file_path,
      status: doc.verification_status,
      uploadedAt: doc.uploaded_at,
    }));

    // Put documents both at root level and inside data for compatibility
    application.documents = formattedDocs;
    if (application.data) {
      application.data.documents = formattedDocs;
    }

    return successResponse({ data: application } as ApplicationAPI.GetResponse);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/applications/[id]:', error);
    return serverErrorResponse('Failed to fetch application', error);
  }
}

/**
 * PUT /api/applications/[id]
 * Update an application
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS (staff only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS']);
    const { id } = await params;
    const body = await request.json() as any;

    // Get existing application
    const { rows: existingRows } = await query(
      'SELECT * FROM applications WHERE id = $1',
      [id]
    );

    if (existingRows.length === 0) {
      return notFoundResponse('Application not found');
    }

    const application = existingRows[0];

    // Only allow updates if application is in DRAFT status (for data changes)
    if (application.current_status !== 'DRAFT' && body.data) {
      return badRequestResponse(
        'Cannot modify application data after submission. Only status updates are allowed.'
      );
    }

    // Build update object with only valid database columns
    const updateData: Record<string, any> = {};

    // Map status fields (frontend may send 'status' or 'current_status')
    const newStatus = body.current_status || body.status;
    if (newStatus) {
      // State machine guard: enforce allowed transitions per role.
      // Map: { fromStatus: { toStatus: allowedRoles[] } }
      const allowedTransitions: Record<string, Record<string, string[]>> = {
        SUBMITTED:           { TRUSTEE_REVIEW: ['SUPERINTENDENT'], REVIEW: ['SUPERINTENDENT'] },
        REVIEW:              { TRUSTEE_REVIEW: ['SUPERINTENDENT'] },
        TRUSTEE_REVIEW:      { SHORTLISTED: ['TRUSTEE'], REJECTED: ['TRUSTEE'] },
        SHORTLISTED:         { INTERVIEW: ['SUPERINTENDENT'] },
        INTERVIEW:           { APPROVED: ['SUPERINTENDENT'], TRUSTEE_FINAL_REVIEW: ['SUPERINTENDENT'], WAITLIST: ['SUPERINTENDENT'] },
        TRUSTEE_FINAL_REVIEW:{ APPROVED: ['TRUSTEE'], WAITLIST: ['TRUSTEE'], REJECTED: ['TRUSTEE'] },
        WAITLIST:            { APPROVED: ['SUPERINTENDENT'], REJECTED: ['TRUSTEE'] },
      };

      const fromStatus = application.current_status;
      if (newStatus !== fromStatus) {
        const allowed = allowedTransitions[fromStatus]?.[newStatus];
        if (!allowed) {
          return badRequestResponse(
            `Invalid status transition: ${fromStatus} → ${newStatus}`
          );
        }
        if (!allowed.includes(user.role)) {
          return badRequestResponse(
            `Role ${user.role} cannot transition application from ${fromStatus} to ${newStatus}`
          );
        }

        // Auto-suggest WAITLIST when approving but no rooms are free in this vertical.
        // Trustee/superintendent can override with `force: true`.
        if (
          newStatus === 'APPROVED' &&
          (fromStatus === 'TRUSTEE_FINAL_REVIEW' || fromStatus === 'INTERVIEW') &&
          !body.force
        ) {
          const roomFree = await hasAvailableRoom(application.vertical as VerticalCode);
          if (!roomFree) {
            return errorResponse(
              'No rooms available in this vertical. Suggest moving to WAITLIST.',
              409,
              { suggested_status: 'WAITLIST', room_available: false, vertical: application.vertical }
            );
          }
        }
      }

      updateData.current_status = newStatus;

      // Set appropriate timestamp fields based on status transition
      const now = new Date().toISOString();
      switch (newStatus) {
        case 'SUBMITTED':
          if (!application.submitted_at) {
            updateData.submitted_at = now;
          }
          break;
        case 'REVIEW':
        case 'TRUSTEE_REVIEW':
          if (!application.reviewed_at) {
            updateData.reviewed_at = now;
          }
          break;
        case 'INTERVIEW':
          // interview timestamp stored in interview_scheduled_at
          break;
        case 'APPROVED':
          updateData.approved_at = now;
          break;
        case 'REJECTED':
          updateData.rejected_at = now;
          if (body.remarks) {
            updateData.rejection_reason = body.remarks;
          }
          break;
        case 'WAITLIST':
          if (!application.waitlisted_at) {
            updateData.waitlisted_at = now;
          }
          break;
        case 'WITHDRAWN':
          // Store withdrawn_at in data JSONB
          break;
      }
    }

    // Map other valid columns
    if (body.data !== undefined) updateData.data = body.data;
    if (body.applicant_name !== undefined) updateData.applicant_name = body.applicant_name;
    if (body.applicant_mobile !== undefined) updateData.applicant_mobile = body.applicant_mobile;
    if (body.applicant_email !== undefined) updateData.applicant_email = body.applicant_email;
    if (body.vertical !== undefined) updateData.vertical = body.vertical;
    if (body.interview_scheduled_at !== undefined) updateData.interview_scheduled_at = body.interview_scheduled_at;
    if (body.interview_completed_at !== undefined) updateData.interview_completed_at = body.interview_completed_at;
    if (body.student_user_id !== undefined) updateData.student_user_id = body.student_user_id;

    // Store remarks and workflow metadata in the data JSON
    if (body.remarks || newStatus === 'WITHDRAWN') {
      updateData.data = {
        ...(application.data || {}),
        ...(body.remarks ? { status_remarks: body.remarks } : {}),
        last_status_update: new Date().toISOString(),
        ...(newStatus === 'WITHDRAWN' ? { withdrawn_at: new Date().toISOString() } : {}),
      };
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return badRequestResponse('No valid fields to update');
    }

    // Build dynamic UPDATE query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      setClauses.push(`${key} = $${paramIndex++}`);
      values.push(key === 'data' ? JSON.stringify(value) : value);
    }

    values.push(id);
    const updateSql = `UPDATE applications SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    // Run all writes in a single transaction
    const updatedApplication = await withTransaction(async (client) => {
      const { rows: updatedRows } = await client.query(updateSql, values);

      if (updatedRows.length === 0) {
        throw new Error('Failed to update application');
      }

      let result = updatedRows[0];

      // Log status change if status was updated
      if (updateData.current_status && updateData.current_status !== application.current_status) {
        await client.query(
          `INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'APPLICATION',
            id,
            'STATUS_CHANGE',
            user.id,
            JSON.stringify({
              tracking_number: application.tracking_number,
              old_status: application.current_status,
              new_status: updateData.current_status,
              remarks: body.remarks || null,
            }),
          ]
        );
      }

      // Create student user when application is approved
      if (updateData.current_status === 'APPROVED' && !application.student_user_id) {
        const bcrypt = require('bcryptjs');
        // Temp password = {LastName}@{last4ofTracking}#{DDMMYYYY}
        // e.g. Joshi@0006#12092004
        const nameParts = (application.applicant_name || '').trim().split(/\s+/);
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || 'User';
        const last4 = (application.tracking_number || '').slice(-4);
        const dobRaw = application.data?.personal_info?.date_of_birth || null;
        const dob = dobRaw ? new Date(dobRaw) : null;
        const dobStr = dob
          ? `${String(dob.getDate()).padStart(2, '0')}${String(dob.getMonth() + 1).padStart(2, '0')}${dob.getFullYear()}`
          : '01011990';
        const tempPassword = `${lastName}@${last4}#${dobStr}`;
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const { rows: userRows } = await client.query(
          `INSERT INTO users (
            role, vertical, full_name, email, mobile, date_of_birth,
            password_hash, is_active, requires_password_change, profile_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            'STUDENT',
            application.vertical,
            application.applicant_name,
            application.applicant_email,
            application.applicant_mobile,
            dobRaw,
            passwordHash,
            true,
            true,
            JSON.stringify({
              application_id: id,
              tracking_number: application.tracking_number,
              approved_at: new Date().toISOString(),
              guardian_info: application.data?.guardian_info || {},
            }),
          ]
        );

        if (userRows.length === 0) {
          throw new Error('Failed to create user record');
        }

        const newUser = userRows[0];

        // Link the new user to the application
        await client.query(
          'UPDATE applications SET student_user_id = $1 WHERE id = $2',
          [newUser.id, id]
        );

        // Log user creation
        await client.query(
          `INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'USER',
            newUser.id,
            'CREATE',
            user.id,
            JSON.stringify({
              application_id: id,
              tracking_number: application.tracking_number,
              reason: 'Application approved - student account created',
            }),
          ]
        );

        result.student_user_id = newUser.id;
        result.student_user = newUser;
        result.__login_invite = {
          name: application.applicant_name,
          email: application.applicant_email,
          tempPassword,
          trackingNumber: application.tracking_number,
        };

        await adjustAdmissionFeeCredit(id, newUser.id, client);
      }

      return result;
    });

    // Fire login-invite email outside the transaction so SMTP failure does
    // not roll back the approval. Errors are logged, not thrown.
    const invite = (updatedApplication as Record<string, unknown>).__login_invite as
      | { name: string; email: string; tempPassword: string; trackingNumber: string }
      | undefined;
    if (invite && invite.email) {
      const origin =
        request.headers.get('origin') ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://localhost:3000';
      const rendered = renderLoginInvite({
        name: invite.name || 'Resident',
        email: invite.email,
        tempPassword: invite.tempPassword,
        trackingNumber: invite.trackingNumber,
        loginUrl: `${origin}/login`,
      });
      sendEmail({
        to: invite.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }).catch((err) => {
        logger.error('Login-invite email dispatch failed', {
          applicationId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
    delete (updatedApplication as Record<string, unknown>).__login_invite;

    // Application rejection email
    if (
      updateData.current_status === 'REJECTED' &&
      application.current_status !== 'REJECTED' &&
      application.applicant_email
    ) {
      const rejected = renderApplicationRejected({
        name: application.applicant_name || 'Applicant',
        trackingNumber: application.tracking_number || id,
        reason: body.remarks || updateData.rejection_reason || null,
      });
      sendEmail({
        to: application.applicant_email,
        subject: rejected.subject,
        html: rejected.html,
        text: rejected.text,
      }).catch((err) => {
        logger.error('Application-rejected email dispatch failed', {
          applicationId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return successResponse({
      data: updatedApplication,
    } as ApplicationAPI.UpdateResponse);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in PUT /api/applications/[id]:', error);
    return serverErrorResponse('Failed to update application', error);
  }
}

/**
 * DELETE /api/applications/[id]
 * Delete an application (soft delete - mark as ARCHIVED)
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS (staff only)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(_request, ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS']);
    const { id } = await params;

    // Get application
    const { rows } = await query(
      'SELECT * FROM applications WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return notFoundResponse('Application not found');
    }

    const application = rows[0];

    // Only allow deletion if application is in DRAFT status
    if (application.current_status !== 'DRAFT') {
      return badRequestResponse(
        'Cannot delete application after submission. Contact administration for withdrawal.'
      );
    }

    // Soft delete by marking as ARCHIVED
    await query(
      "UPDATE applications SET current_status = 'ARCHIVED' WHERE id = $1",
      [id]
    );

    // Log deletion
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'APPLICATION',
        id,
        'DELETE',
        user.id,
        JSON.stringify({
          tracking_number: application.tracking_number,
          old_status: application.current_status,
          new_status: 'ARCHIVED',
        }),
      ]
    );

    return successResponse({ success: true, message: 'Application deleted successfully' });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in DELETE /api/applications/[id]:', error);
    return serverErrorResponse('Failed to delete application', error);
  }
}
