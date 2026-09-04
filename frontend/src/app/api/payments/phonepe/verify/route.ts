import { NextRequest } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { checkOrderStatus } from '@/lib/payments/phonepe';
import { sendEmail } from '@/lib/mailer';
import { renderPaymentReceipt } from '@/lib/email-templates/payment-receipt';
import { logger } from '@/lib/logger';

const ADMISSION_AMOUNT = 500;

async function logAudit(applicationId: string | null, event: string, payload: any) {
  if (!applicationId) {
    console.error('phonepe verify audit (no application uuid):', event, payload);
    return;
  }
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
    const body = await request.json();
    const merchantOrderId = body.merchantOrderId;
    if (!merchantOrderId) return badRequestResponse('merchantOrderId is required');

    const { rows: txnRows } = await query(
      `SELECT t.id, t.fee_id, t.status, f.application_id, f.amount AS fee_amount
       FROM transactions t JOIN fees f ON f.id = t.fee_id
       WHERE t.transaction_ref = $1`,
      [merchantOrderId],
    );
    if (!txnRows[0]) return notFoundResponse('Order not found');
    const txn = txnRows[0];
    const applicationId: string = txn.application_id;

    if (txn.status === 'SUCCESS') {
      return successResponse({ status: 'SUCCESS', idempotent: true });
    }

    // S-16: a transaction we previously marked FAILED (e.g. superseded by a retry
    // after the reuse window) might still complete at the gateway if the applicant
    // goes back to that original checkout tab. Don't short-circuit blindly — check
    // the gateway's current state before deciding this is really a dead order.
    const wasFailed = txn.status === 'FAILED';

    const orderStatus = await checkOrderStatus(merchantOrderId);

    if (wasFailed && orderStatus.state !== 'COMPLETED') {
      return successResponse({ status: 'FAILED', idempotent: true });
    }

    if (orderStatus.state === 'PENDING') {
      return successResponse({ status: 'PENDING' });
    }

    if (orderStatus.state === 'FAILED') {
      await query(
        `UPDATE transactions SET status='FAILED', gateway_response=$2, payment_notes='PhonePe order failed' WHERE id=$1`,
        [txn.id, JSON.stringify(orderStatus)],
      );
      await logAudit(applicationId, 'PHONEPE_VERIFY_FAILED', { merchantOrderId });
      return successResponse({ status: 'FAILED' });
    }

    if (orderStatus.state !== 'COMPLETED') {
      await logAudit(applicationId, 'PHONEPE_VERIFY_UNKNOWN_STATE', {
        merchantOrderId,
        state: orderStatus.state,
      });
      return successResponse({ status: 'PENDING' });
    }

    if (Number(orderStatus.amount) !== ADMISSION_AMOUNT * 100 || Number(txn.fee_amount) !== ADMISSION_AMOUNT) {
      await logAudit(applicationId, 'PHONEPE_VERIFY_AMOUNT_MISMATCH', {
        merchantOrderId,
        gotAmountPaise: orderStatus.amount,
        expected: txn.fee_amount,
      });
      return badRequestResponse('Amount mismatch');
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE transactions SET status='SUCCESS', gateway_response=$2, payment_notes=$3 WHERE id=$1`,
        [txn.id, JSON.stringify(orderStatus), `PhonePe order ${merchantOrderId}`],
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
      wasFailed ? 'PHONEPE_VERIFY_RECOVERED_AFTER_SUPERSEDE' : 'PHONEPE_VERIFY_SUCCESS',
      { merchantOrderId },
    );

    try {
      const { rows: rcptRows } = await query(
        `SELECT a.applicant_email, a.applicant_name, f.fee_head
         FROM applications a JOIN fees f ON f.application_id = a.id
         WHERE a.id = $1 AND f.id = $2`,
        [applicationId, txn.fee_id],
      );
      const r = rcptRows[0];
      if (r?.applicant_email) {
        const rendered = renderPaymentReceipt({
          name: r.applicant_name || 'Applicant',
          amount: ADMISSION_AMOUNT,
          orderId: merchantOrderId,
          transactionId: orderStatus.orderId,
          feeHead: r.fee_head || null,
        });
        sendEmail({ to: r.applicant_email, subject: rendered.subject, html: rendered.html, text: rendered.text }).catch(
          (err) => {
            logger.error('Payment-receipt email dispatch failed', {
              merchantOrderId,
              error: err instanceof Error ? err.message : String(err),
            });
          },
        );
      }
    } catch (err) {
      logger.error('Payment-receipt email lookup failed', {
        merchantOrderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return successResponse({ status: 'SUCCESS' });
  } catch (error: any) {
    console.error('Error in POST /api/payments/phonepe/verify:', error);
    return serverErrorResponse('Failed to verify payment', error);
  }
}
