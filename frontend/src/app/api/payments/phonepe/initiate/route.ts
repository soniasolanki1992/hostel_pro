import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api/responses';
import { generateMerchantOrderId, createOrder } from '@/lib/payments/phonepe';
import { verifySignedSessionToken } from '@/lib/auth';

const ADMISSION_AMOUNT = 500;
const REUSE_WINDOW_MS = 15 * 60 * 1000;

const VERTICAL_SLUG: Record<string, string> = {
  BOYS_HOSTEL: 'boys-hostel',
  GIRLS_ASHRAM: 'girls-ashram',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const applicationId = body.applicationId || body.application_id;
    if (!applicationId) return badRequestResponse('applicationId is required');

    const sessionToken: string | undefined = body.sessionToken;
    if (!sessionToken) return unauthorizedResponse('sessionToken is required');
    const payload = verifySignedSessionToken(sessionToken) as
      | { contact?: string; verified?: boolean }
      | null;
    if (!payload || payload.verified !== true) {
      return unauthorizedResponse('Invalid or expired session');
    }

    const { rows: appRows } = await query(
      `SELECT id, vertical, current_status, applicant_mobile, applicant_name, applicant_email, tracking_number
       FROM applications WHERE id = $1`,
      [applicationId],
    );
    if (!appRows[0]) return notFoundResponse('Application not found');
    const app = appRows[0];

    // S-10: the verified contact in the token must match the application so an
    // attacker who guesses an application UUID cannot mint PhonePe orders or
    // read back the applicant's tracking number via the return URL below.
    const contact = (payload.contact || '').trim();
    let contactMatches = false;
    if (contact.includes('@')) {
      const tokenEmail = contact.toLowerCase();
      const appEmail = String(app.applicant_email || '').trim().toLowerCase();
      contactMatches = !!tokenEmail && tokenEmail === appEmail;
    } else {
      const tokenMobile = contact.replace(/\D/g, '').slice(-10);
      const appMobile = String(app.applicant_mobile || '').replace(/\D/g, '').slice(-10);
      contactMatches = tokenMobile.length === 10 && tokenMobile === appMobile;
    }
    if (!contactMatches) {
      return unauthorizedResponse('Session does not match application');
    }

    if (app.vertical !== 'BOYS_HOSTEL' && app.vertical !== 'GIRLS_ASHRAM') {
      return badRequestResponse('Admission fee only applies to hostel verticals');
    }
    if (app.current_status !== 'DRAFT') {
      return badRequestResponse(`Application is already ${app.current_status}`);
    }

    const { rows: feeRows } = await query(
      `SELECT id, status FROM fees
       WHERE application_id = $1 AND fee_head = 'ADMISSION_FEE'
       ORDER BY created_at DESC LIMIT 1`,
      [applicationId],
    );
    if (!feeRows[0]) return badRequestResponse('No pending admission fee found for this application');
    const fee = feeRows[0];
    if (fee.status === 'PAID') return badRequestResponse('Admission fee already paid');

    const { rows: pendingTxn } = await query(
      `SELECT id, transaction_ref, gateway_response, created_at
       FROM transactions
       WHERE fee_id = $1 AND status = 'PENDING'
       ORDER BY created_at DESC LIMIT 1`,
      [fee.id],
    );

    let merchantOrderId: string;
    let internalTxnId: string;
    let checkoutUrl: string | undefined;

    const canReuse =
      pendingTxn[0] && Date.now() - new Date(pendingTxn[0].created_at).getTime() < REUSE_WINDOW_MS;

    if (canReuse) {
      const stored = pendingTxn[0].gateway_response;
      checkoutUrl = (typeof stored === 'string' ? JSON.parse(stored) : stored)?.order?.checkoutUrl;
    }

    if (canReuse && checkoutUrl) {
      merchantOrderId = pendingTxn[0].transaction_ref;
      internalTxnId = pendingTxn[0].id;
    } else {
      if (pendingTxn[0]) {
        await query(
          `UPDATE transactions SET status='FAILED', payment_notes='Superseded by new order' WHERE id=$1`,
          [pendingTxn[0].id],
        );
      }
      merchantOrderId = generateMerchantOrderId(applicationId);
      // S-15: NEXT_PUBLIC_APP_URL (server-configured) must win over the client-controlled
      // Origin header — the header is attacker-influenceable on a direct API request and
      // would otherwise let a caller redirect the post-payment browser to an arbitrary host.
      const origin = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000';
      const verticalSlug = VERTICAL_SLUG[app.vertical] || 'boys-hostel';
      const returnUrl =
        `${origin}/apply/payment-callback` +
        `?applicationId=${encodeURIComponent(applicationId)}` +
        `&merchantOrderId=${encodeURIComponent(merchantOrderId)}` +
        `&trackingNumber=${encodeURIComponent(app.tracking_number || '')}` +
        `&vertical=${encodeURIComponent(verticalSlug)}`;

      const order = await createOrder({ amount: ADMISSION_AMOUNT, merchantOrderId, redirectUrl: returnUrl });
      checkoutUrl = order.checkoutUrl;

      const { rows: ins } = await query(
        `INSERT INTO transactions (fee_id, amount, payment_method, transaction_ref, gateway_response, status)
         VALUES ($1, $2, 'ONLINE', $3, $4, 'PENDING') RETURNING id`,
        [fee.id, ADMISSION_AMOUNT, merchantOrderId, JSON.stringify({ order, returnUrl, initiatedAt: new Date().toISOString() })],
      );
      internalTxnId = ins[0].id;
    }

    return successResponse({ checkoutUrl, merchantOrderId, internalTxnId });
  } catch (error: any) {
    console.error('Error in POST /api/payments/phonepe/initiate:', error);
    return serverErrorResponse('Failed to initiate payment', error);
  }
}
