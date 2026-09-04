import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth } from '@/lib/authorize';

/**
 * GET /api/communications
 * List communication logs (SMS, WhatsApp, Email notifications sent)
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS (staff only)
 *
 * Optional filters:
 *   channel, status, purpose, related_entity_id, related_entity_type, limit
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS']);
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');
    const status = searchParams.get('status');
    const purpose = searchParams.get('purpose');
    const relatedEntityId = searchParams.get('related_entity_id');
    const relatedEntityType = searchParams.get('related_entity_type');
    const limit = parseInt(searchParams.get('limit') || '100');

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (channel) {
      conditions.push(`channel = $${paramIndex++}`);
      params.push(channel.toUpperCase());
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }
    if (purpose) {
      conditions.push(`purpose = $${paramIndex++}`);
      params.push(purpose.toUpperCase());
    }
    if (relatedEntityId) {
      conditions.push(`related_entity_id = $${paramIndex++}`);
      params.push(relatedEntityId);
    }
    if (relatedEntityType) {
      conditions.push(`related_entity_type = $${paramIndex++}`);
      params.push(relatedEntityType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    const sql = `SELECT * FROM communications ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex}`;

    const { rows: logs } = await query(sql, params);

    return successResponse(logs || []);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/communications:', error);
    // Return empty array instead of error for missing table
    return successResponse([]);
  }
}

const VALID_CHANNELS = new Set(['SMS', 'WHATSAPP', 'EMAIL', 'PUSH_NOTIFICATION']);
const VALID_PURPOSES = new Set([
  'INTERVIEW_INVITE',
  'APPROVAL_NOTIFICATION',
  'REJECTION_NOTIFICATION',
  'FEE_REMINDER',
  'PAYMENT_CONFIRMATION',
  'LEAVE_NOTIFICATION',
  'RENEWAL_REMINDER',
  'EXIT_NOTIFICATION',
  'EMERGENCY_ALERT',
  'OTHER',
]);

/**
 * POST /api/communications
 * Record a communication (e.g. fee reminder). Records the entry; actual
 * dispatch to SMS/WhatsApp/Email gateways is handled out-of-band.
 * Auth: SUPERINTENDENT, TRUSTEE, ACCOUNTS
 *
 * Body shape:
 *   recipients: Array<{ user_id?: string; contact: string }>
 *   channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH_NOTIFICATION'
 *   purpose: comm_purpose
 *   subject?: string
 *   message_body: string
 *   related_entity_type?: string
 *   related_entity_id?: string
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS']);
    const body = await request.json();
    const {
      recipients,
      channel,
      purpose,
      subject,
      message_body,
      related_entity_type,
      related_entity_id,
    } = body || {};

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return badRequestResponse('recipients must be a non-empty array');
    }
    if (!channel || !VALID_CHANNELS.has(String(channel).toUpperCase())) {
      return badRequestResponse(`channel must be one of: ${Array.from(VALID_CHANNELS).join(', ')}`);
    }
    if (!purpose || !VALID_PURPOSES.has(String(purpose).toUpperCase())) {
      return badRequestResponse(`purpose must be one of: ${Array.from(VALID_PURPOSES).join(', ')}`);
    }
    if (!message_body || typeof message_body !== 'string' || !message_body.trim()) {
      return badRequestResponse('message_body is required');
    }

    const inserted: any[] = [];
    for (const r of recipients) {
      const contact = r?.contact ? String(r.contact).trim() : '';
      if (!contact) continue;
      const userId = r?.user_id || null;
      const { rows } = await query(
        `INSERT INTO communications
          (recipient_id, recipient_contact, channel, purpose, subject, message_body,
           related_entity_type, related_entity_id, sent_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
         RETURNING *`,
        [
          userId,
          contact,
          String(channel).toUpperCase(),
          String(purpose).toUpperCase(),
          subject || null,
          message_body,
          related_entity_type || null,
          related_entity_id || null,
          user.id,
        ]
      );
      if (rows[0]) inserted.push(rows[0]);
    }

    if (inserted.length === 0) {
      return badRequestResponse('No valid recipients (each recipient needs a contact)');
    }

    return createdResponse(inserted, `Recorded ${inserted.length} communication(s)`);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in POST /api/communications:', error);
    return serverErrorResponse('Failed to record communication', error);
  }
}
