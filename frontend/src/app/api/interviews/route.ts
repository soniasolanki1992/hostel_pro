import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  createdResponse,
  badRequestResponse,
  serverErrorResponse,
  paginatedResponse,
  validateFields,
} from '@/lib/api/responses';
import { InterviewAPI, InterviewStatus } from '@/types/api';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';
import { sendEmail } from '@/lib/mailer';
import { renderInterviewScheduled } from '@/lib/email-templates/interview-scheduled';
import { logger } from '@/lib/logger';

/**
 * GET /api/interviews
 * List all interviews with application details
 * Auth: TRUSTEE, SUPERINTENDENT
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['TRUSTEE', 'SUPERINTENDENT']);
    const verticalFilter = getVerticalFilter(user);
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('application_id');
    const status = searchParams.get('status') as InterviewStatus | null;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Scope interviews by role
    if (verticalFilter) {
      // Superintendent: only their vertical, only active interviews they conduct
      conditions.push(`a.vertical = $${paramIndex++}`);
      params.push(verticalFilter);
      conditions.push(`a.current_status = 'INTERVIEW'`);
    } else if (user.role === 'TRUSTEE') {
      // Trustees no longer conduct interviews; return none.
      conditions.push(`1 = 0`);
    }

    if (applicationId) {
      conditions.push(`i.application_id = $${paramIndex++}`);
      params.push(applicationId);
    }

    if (status === 'SCHEDULED') {
      conditions.push(`i.status = 'SCHEDULED'`);
    } else if (status === 'COMPLETED') {
      conditions.push(`i.status = 'COMPLETED'`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS count FROM interviews i JOIN applications a ON i.application_id = a.id ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0]?.count || '0', 10);

    // Get paginated results with application details
    const { rows: interviews } = await query(
      `SELECT i.*,
              a.tracking_number, a.applicant_name, a.vertical,
              a.current_status AS application_status, a.data AS application_data,
              u.full_name AS trustee_name
       FROM interviews i
       JOIN applications a ON i.application_id = a.id
       LEFT JOIN users u ON i.trustee_id = u.id
       ${whereClause}
       ORDER BY i.scheduled_date DESC, i.scheduled_time DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // Transform to expected format
    const formattedInterviews = (interviews || []).map((row: any) => ({
      id: row.id,
      application_id: row.application_id,
      trustee_id: row.trustee_id,
      schedule_time: row.scheduled_date && row.scheduled_time
        ? (() => {
            const d = row.scheduled_date instanceof Date
              ? row.scheduled_date.toISOString().split('T')[0]
              : String(row.scheduled_date);
            const t = String(row.scheduled_time);
            return `${d}T${t}`;
          })()
        : null,
      mode: row.mode,
      status: row.status,
      score: row.score,
      internal_remarks: row.internal_remarks,
      location_or_link: row.location_or_link,
      created_at: row.created_at,
      application: {
        id: row.application_id,
        tracking_number: row.tracking_number,
        applicant_name: row.applicant_name,
        vertical: row.vertical,
        current_status: row.application_status,
        data: row.application_data,
      },
    }));

    return paginatedResponse(formattedInterviews, page, limit, total);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    return serverErrorResponse('Failed to fetch interviews', error);
  }
}

/**
 * POST /api/interviews
 * Schedule an interview for an application
 * Auth: TRUSTEE, SUPERINTENDENT
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['TRUSTEE', 'SUPERINTENDENT']);
    const body: InterviewAPI.CreateRequest = await request.json();
    const { application_id, trustee_id, schedule_time, mode } = body;

    // Validate input
    const validation = validateFields([
      {
        field: 'application_id',
        value: application_id,
        rules: [{ type: 'required', message: 'Application ID is required' }],
      },
      {
        field: 'schedule_time',
        value: schedule_time,
        rules: [{ type: 'required', message: 'Schedule time is required' }],
      },
      {
        field: 'mode',
        value: mode,
        rules: [{ type: 'required', message: 'Interview mode is required' }],
      },
    ]);

    if (!validation.isValid) {
      return badRequestResponse('Validation failed', validation.errors);
    }

    // Validate application exists
    const { rows: appRows } = await query(
      'SELECT * FROM applications WHERE id = $1',
      [application_id]
    );

    if (appRows.length === 0) {
      return badRequestResponse('Invalid application ID');
    }

    const application = appRows[0];

    // Precondition: applications can only enter INTERVIEW from SHORTLISTED.
    if (application.current_status !== 'SHORTLISTED') {
      return badRequestResponse(
        `Cannot schedule interview: application must be SHORTLISTED (current: ${application.current_status})`
      );
    }

    // Validate trustee exists if provided
    const effectiveTrusteeId = trustee_id || (await query(
      "SELECT id FROM users WHERE role = 'TRUSTEE' LIMIT 1"
    )).rows[0]?.id;

    if (effectiveTrusteeId) {
      const { rows: trusteeRows } = await query(
        "SELECT id FROM users WHERE id = $1 AND role = 'TRUSTEE'",
        [effectiveTrusteeId]
      );
      if (trusteeRows.length === 0) {
        return badRequestResponse('Invalid trustee ID');
      }
    }

    // Parse schedule_time into date and time
    const scheduleDate = new Date(schedule_time);
    const dateStr = scheduleDate.toISOString().split('T')[0];
    const timeStr = scheduleDate.toTimeString().split(' ')[0].substring(0, 5);

    // Map mode to DB enum
    const modeMap: Record<string, string> = {
      'IN_PERSON': 'IN_PERSON',
      'PHYSICAL': 'IN_PERSON',
      'ONLINE': 'ZOOM',
      'VIDEO_CALL': 'ZOOM',
      'ZOOM': 'ZOOM',
      'GOOGLE_MEET': 'GOOGLE_MEET',
      'WHATSAPP_VIDEO': 'WHATSAPP_VIDEO',
      'PHONE_CALL': 'PHONE_CALL',
    };
    const dbMode = modeMap[mode] || 'IN_PERSON';

    // Insert into interviews table
    const { rows: insertedRows } = await query(
      `INSERT INTO interviews (application_id, trustee_id, scheduled_date, scheduled_time, mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (application_id) DO UPDATE
       SET scheduled_date = $3, scheduled_time = $4, mode = $5, status = 'SCHEDULED', updated_at = NOW()
       RETURNING *`,
      [application_id, effectiveTrusteeId, dateStr, timeStr, dbMode]
    );

    if (insertedRows.length === 0) {
      return serverErrorResponse('Failed to schedule interview');
    }

    // Update application status to INTERVIEW
    await query(
      `UPDATE applications SET current_status = 'INTERVIEW', updated_at = NOW() WHERE id = $1`,
      [application_id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        'INTERVIEW',
        insertedRows[0].id,
        'STATUS_CHANGE',
        JSON.stringify({
          application_id,
          tracking_number: application.tracking_number,
          schedule_time,
          mode: dbMode,
          trustee_id: effectiveTrusteeId,
        }),
      ]
    );

    // Notify applicant via email
    if (application.applicant_email) {
      const origin =
        request.headers.get('origin') ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://localhost:3000';
      const rendered = renderInterviewScheduled({
        name: application.applicant_name || 'Applicant',
        trackingNumber: application.tracking_number,
        scheduleTime: schedule_time,
        mode: dbMode,
        trackUrl: `${origin}/track/${application.tracking_number}`,
      });
      sendEmail({
        to: application.applicant_email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }).catch((err) => {
        logger.error('Interview-scheduled email dispatch failed', {
          applicationId: application_id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return createdResponse(
      {
        data: {
          id: insertedRows[0].id,
          application_id,
          trustee_id: effectiveTrusteeId,
          schedule_time,
          mode: dbMode,
          status: InterviewStatus.SCHEDULED,
        },
      } as InterviewAPI.CreateResponse,
      'Interview scheduled successfully'
    );
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    return serverErrorResponse('Failed to create interview', error);
  }
}
