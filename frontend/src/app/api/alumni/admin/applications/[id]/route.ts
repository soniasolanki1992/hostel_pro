import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';
import { createAuditLog } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/mailer';
import { renderAlumniDecision } from '@/lib/email-templates/alumni-decision';

/**
 * PATCH /api/alumni/admin/applications/[id]
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * On approve: status -> APPROVED, ensures a users row with role ALUMNI is
 * created and linked. On reject: status -> REJECTED with reason. Trustees and
 * Accounts can act on any vertical; superintendents are vertical-scoped.
 */
function sendAlumniEmail(
  record: { email?: string | null; first_name?: string | null; last_name?: string | null },
  decision: 'APPROVED' | 'REJECTED',
  reason: string | null,
  request: NextRequest
) {
  if (!record?.email) return;
  const origin =
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';
  const name = `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Alumnus';
  const rendered = renderAlumniDecision({
    name,
    decision,
    reason,
    portalUrl: `${origin}/alumni/login`,
  });
  sendEmail({
    to: record.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  }).catch((err) => {
    logger.error('Alumni-decision email dispatch failed', {
      decision,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireAuth(request, ['TRUSTEE', 'SUPERINTENDENT', 'ACCOUNTS']);
    const { action, reason } = await request.json();

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ success: false, error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const cur = await query(
      `SELECT id, vertical, status, email, first_name, last_name FROM alumni WHERE id = $1`,
      [id]
    );
    if (cur.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Alumni record not found' }, { status: 404 });
    }
    const record = cur.rows[0];

    const verticalFilter = getVerticalFilter(user);
    if (verticalFilter && record.vertical !== verticalFilter) {
      return NextResponse.json({ success: false, error: 'Not authorised for this vertical' }, { status: 403 });
    }

    if (action === 'approve') {
      const upd = await query(
        `UPDATE alumni
         SET status = 'APPROVED', approved_at = NOW(), approved_by = $1,
             rejection_reason = NULL, rejected_at = NULL, rejected_by = NULL
         WHERE id = $2
         RETURNING id, status, approved_at`,
        [user.id, id]
      );
      const updated = upd.rows[0];

      await createAuditLog({
        entityType: 'alumni',
        entityId: id,
        action: 'APPROVAL',
        performedBy: user.id,
        oldValue: { status: record.status },
        newValue: { status: 'APPROVED' },
      });

      sendAlumniEmail(record, 'APPROVED', null, request);

      return NextResponse.json({ success: true, data: updated });
    }

    // reject
    const upd = await query(
      `UPDATE alumni
       SET status = 'REJECTED', rejected_at = NOW(), rejected_by = $1, rejection_reason = $2
       WHERE id = $3
       RETURNING id, status, rejected_at, rejection_reason`,
      [user.id, reason || null, id]
    );

    await createAuditLog({
      entityType: 'alumni',
      entityId: id,
      action: 'REJECTION',
      performedBy: user.id,
      oldValue: { status: record.status },
      newValue: { status: 'REJECTED', reason: reason || null },
    });

    sendAlumniEmail(record, 'REJECTED', reason || null, request);

    return NextResponse.json({ success: true, data: upd.rows[0] });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni admin action failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to update alumni record' }, { status: 500 });
  }
}
