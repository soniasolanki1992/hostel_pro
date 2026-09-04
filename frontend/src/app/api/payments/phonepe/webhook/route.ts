import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { verifyWebhookAuth } from '@/lib/payments/phonepe';

const ADMISSION_AMOUNT = 500;

async function logAudit(applicationId: string | null, event: string, payload: any) {
  if (!applicationId) return;
  try {
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
       VALUES ('APPLICATION', $1, 'STATUS_CHANGE', $2)`,
      [applicationId, JSON.stringify({ event, payload })],
    );
  } catch (e) {
    console.error('audit log failed', e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!verifyWebhookAuth(authHeader)) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const eventType: string = event?.event;
    const p = event?.payload;
    if (!p?.merchantOrderId) return NextResponse.json({ ok: true, ignored: true });

    const merchantOrderId: string = p.merchantOrderId;
    const orderId: string = p.orderId;
    const state: string = p.state;
    const amountPaise: number = p.amount;

    const { rows } = await query(
      `SELECT t.id, t.status, t.fee_id, f.application_id, f.amount AS fee_amount
       FROM transactions t JOIN fees f ON f.id = t.fee_id
       WHERE t.transaction_ref = $1`,
      [merchantOrderId],
    );
    const txn = rows[0];
    if (!txn) {
      return NextResponse.json({ ok: true, unknown: true });
    }
    const applicationId: string = txn.application_id;

    if (txn.status === 'SUCCESS') {
      await logAudit(applicationId, 'PHONEPE_WEBHOOK_DUPLICATE', {
        merchantOrderId, orderId, eventType, currentStatus: txn.status,
      });
      return NextResponse.json({ ok: true, idempotent: true });
    }

    // S-16: a transaction we previously marked FAILED (e.g. superseded by a retry
    // after the reuse window) might still complete at the gateway if the applicant
    // goes back to that original checkout tab. Only treat FAILED as a terminal
    // idempotent duplicate when this webhook event itself isn't reporting COMPLETED.
    const wasFailed = txn.status === 'FAILED';
    if (wasFailed && state !== 'COMPLETED') {
      await logAudit(applicationId, 'PHONEPE_WEBHOOK_DUPLICATE', {
        merchantOrderId, orderId, eventType, currentStatus: txn.status,
      });
      return NextResponse.json({ ok: true, idempotent: true });
    }

    if (state === 'COMPLETED') {
      if (Number(amountPaise) !== ADMISSION_AMOUNT * 100 || Number(txn.fee_amount) !== ADMISSION_AMOUNT) {
        await logAudit(applicationId, 'PHONEPE_WEBHOOK_AMOUNT_MISMATCH', {
          merchantOrderId, amountPaise, expected: txn.fee_amount,
        });
        return NextResponse.json({ ok: false, error: 'Amount mismatch' }, { status: 400 });
      }
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE transactions SET status='SUCCESS', gateway_response=$2, payment_notes=$3 WHERE id=$1`,
          [txn.id, JSON.stringify(event), `PhonePe webhook ${orderId}`],
        );
        await client.query(
          `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE' WHERE id=$1`,
          [txn.fee_id],
        );
        await client.query(
          `UPDATE applications
              SET current_status = CASE WHEN current_status = 'DRAFT' THEN 'SUBMITTED'::application_status ELSE current_status END,
                  submitted_at = COALESCE(submitted_at, NOW()),
                  payment_status = 'PAID'
            WHERE id = $1`,
          [applicationId],
        );
      });
      await logAudit(
        applicationId,
        wasFailed ? 'PHONEPE_WEBHOOK_RECOVERED_AFTER_SUPERSEDE' : 'PHONEPE_WEBHOOK_SUCCESS',
        { merchantOrderId, orderId },
      );
    } else if (state === 'FAILED') {
      await query(
        `UPDATE transactions SET status='FAILED', gateway_response=$2 WHERE id=$1`,
        [txn.id, JSON.stringify(event)],
      );
      await logAudit(applicationId, 'PHONEPE_WEBHOOK_FAILED', { merchantOrderId, orderId });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in /api/payments/phonepe/webhook:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
