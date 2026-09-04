# Razorpay Replace-Paytm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Paytm payment integration with Razorpay Standard Checkout, including server-side order creation, signature verification, async webhook safety net, dev bypass, and updated UI + tests.

**Architecture:** Single-provider replacement. Server creates Razorpay orders via REST (`POST /v1/orders` with Basic auth); the frontend opens `https://checkout.razorpay.com/v1/checkout.js` modal; on success the client posts the signature payload back to a verify route that HMAC-SHA256-verifies it and finalises the `transactions` row. A webhook receiver provides an idempotent async safety net. Existing `transactions` schema (`transaction_ref`, `gateway_response`) is reused — no DB migration. No `razorpay` npm SDK; we use `fetch` + Node `crypto`.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, PostgreSQL via `@/lib/db`, Razorpay Standard Checkout (hosted JS), Node `crypto` for HMAC.

**Spec:** `docs/superpowers/specs/2026-04-30-razorpay-replace-paytm-design.md`

---

## File Structure

**Create:**
- `frontend/src/lib/payments/razorpay.ts` — server: order creation, signature/webhook verification, payment fetch.
- `frontend/src/lib/payments/razorpay.test.ts` — unit tests for the above.
- `frontend/src/lib/payments/razorpayClient.ts` — client: load checkout.js, open modal.
- `frontend/src/app/api/payments/razorpay/initiate/route.ts` — POST: create order + PENDING transaction.
- `frontend/src/app/api/payments/razorpay/verify/route.ts` — POST: verify signature, finalise transaction.
- `frontend/src/app/api/payments/razorpay/status/[orderId]/route.ts` — GET: status + reconcile.
- `frontend/src/app/api/payments/razorpay/webhook/route.ts` — POST: webhook receiver.
- `frontend/src/app/api/payments/razorpay/dev-bypass/route.ts` — POST: dev-only bypass.

**Modify:**
- `frontend/src/components/forms/AdmissionFeeStep.tsx` — switch URLs and SDK invocation.
- `frontend/src/app/api/applications/route.ts` — comment-only refresh (lines ~231, ~257).
- `frontend/tests/payments/AdmissionFeeStep.test.tsx` — Razorpay URLs + mock `razorpayClient`.
- `frontend/package.json` — drop `paytmchecksum`.
- `frontend/.env.local` — swap env vars (manual; documented in Task 13).

**Delete:**
- `frontend/src/lib/payments/paytm.ts`
- `frontend/src/lib/payments/paytm.test.ts`
- `frontend/src/lib/payments/paytmchecksum.d.ts`
- `frontend/src/app/api/payments/paytm/initiate/route.ts`
- `frontend/src/app/api/payments/paytm/callback/route.ts`
- `frontend/src/app/api/payments/paytm/status/[orderId]/route.ts`
- `frontend/src/app/api/payments/paytm/dev-bypass/route.ts`
- The empty `frontend/src/app/api/payments/paytm/` directory tree.

---

## Task 1: Server-side Razorpay library — config + signature verification (TDD)

**Files:**
- Create: `frontend/src/lib/payments/razorpay.ts`
- Test: `frontend/src/lib/payments/razorpay.test.ts`

- [ ] **Step 1: Write the failing test for signature verification**

Create `frontend/src/lib/payments/razorpay.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'crypto';

vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_KEYID');
vi.stubEnv('RAZORPAY_KEY_SECRET', 'TESTSECRET');
vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'WEBHOOKSECRET');

import {
  getRazorpayConfig,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './razorpay';

describe('getRazorpayConfig', () => {
  it('reads keys from env', () => {
    const cfg = getRazorpayConfig();
    expect(cfg.keyId).toBe('rzp_test_KEYID');
    expect(cfg.keySecret).toBe('TESTSECRET');
    expect(cfg.webhookSecret).toBe('WEBHOOKSECRET');
  });
});

describe('verifyPaymentSignature', () => {
  it('returns true for a valid signature', () => {
    const orderId = 'order_ABC';
    const paymentId = 'pay_XYZ';
    const expected = createHmac('sha256', 'TESTSECRET')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    expect(verifyPaymentSignature({ orderId, paymentId, signature: expected })).toBe(true);
  });

  it('returns false for a tampered payment id', () => {
    const orderId = 'order_ABC';
    const paymentId = 'pay_XYZ';
    const expected = createHmac('sha256', 'TESTSECRET')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    expect(
      verifyPaymentSignature({ orderId, paymentId: 'pay_OTHER', signature: expected }),
    ).toBe(false);
  });

  it('returns false for a tampered signature', () => {
    expect(
      verifyPaymentSignature({
        orderId: 'order_ABC',
        paymentId: 'pay_XYZ',
        signature: 'deadbeef',
      }),
    ).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  it('returns true for a valid webhook signature', () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac('sha256', 'WEBHOOKSECRET').update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it('returns false when the body is mutated', () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac('sha256', 'WEBHOOKSECRET').update(body).digest('hex');
    expect(verifyWebhookSignature('{"event":"payment.failed"}', sig)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd frontend && npx vitest run src/lib/payments/razorpay.test.ts
```

Expected: FAIL — `Cannot find module './razorpay'`.

- [ ] **Step 3: Implement the library**

Create `frontend/src/lib/payments/razorpay.ts`:

```typescript
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export function getRazorpayConfig(): RazorpayConfig {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay env vars not configured: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET required',
    );
  }
  return { keyId, keySecret, webhookSecret };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function verifyPaymentSignature(opts: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = getRazorpayConfig();
  const expected = createHmac('sha256', keySecret)
    .update(`${opts.orderId}|${opts.paymentId}`)
    .digest('hex');
  return constantTimeEqualHex(expected, opts.signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const { webhookSecret } = getRazorpayConfig();
  if (!webhookSecret) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return constantTimeEqualHex(expected, signature);
}

export function generateReceipt(applicationId: string): string {
  const short = applicationId.replace(/-/g, '').slice(0, 12);
  const ts = Date.now().toString(36);
  const rand = randomBytes(2).toString('hex');
  return `ADM_${short}_${ts}_${rand}`.slice(0, 40);
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string;
}

export async function createOrder(opts: {
  amount: number; // rupees
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const cfg = getRazorpayConfig();
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(opts.amount * 100), // paise
      currency: opts.currency || 'INR',
      receipt: opts.receipt,
      notes: opts.notes || {},
    }),
  });
  const json = await res.json();
  if (!res.ok || !json?.id) {
    throw new Error(`Razorpay createOrder failed: ${json?.error?.description || res.status}`);
  }
  return {
    id: json.id,
    amount: json.amount,
    currency: json.currency,
    status: json.status,
    receipt: json.receipt,
  };
}

export async function fetchPayment(paymentId: string): Promise<any> {
  const cfg = getRazorpayConfig();
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return res.json();
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd frontend && npx vitest run src/lib/payments/razorpay.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/payments/razorpay.ts frontend/src/lib/payments/razorpay.test.ts
git commit -m "feat(payments): add Razorpay server lib with signature/webhook verification"
```

---

## Task 2: Add `createOrder` request-shape test

**Files:**
- Modify: `frontend/src/lib/payments/razorpay.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `frontend/src/lib/payments/razorpay.test.ts`:

```typescript
import { createOrder } from './razorpay';

describe('createOrder', () => {
  it('builds a Basic-auth POST to /v1/orders with amount in paise', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'order_TEST',
        amount: 50000,
        currency: 'INR',
        status: 'created',
        receipt: 'ADM_X',
      }),
    } as Response);

    const order = await createOrder({ amount: 500, receipt: 'ADM_X' });

    expect(order.id).toBe('order_TEST');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    const body = JSON.parse(init?.body as string);
    expect(body.amount).toBe(50000);
    expect(body.currency).toBe('INR');
    expect(body.receipt).toBe('ADM_X');
  });

  it('throws when Razorpay returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { description: 'invalid amount' } }),
    } as Response);
    await expect(createOrder({ amount: 0, receipt: 'X' })).rejects.toThrow(/invalid amount/);
  });
});
```

- [ ] **Step 2: Run and verify pass**

```bash
cd frontend && npx vitest run src/lib/payments/razorpay.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/payments/razorpay.test.ts
git commit -m "test(payments): cover Razorpay createOrder request shape"
```

---

## Task 3: Implement the `initiate` API route

**Files:**
- Create: `frontend/src/app/api/payments/razorpay/initiate/route.ts`

- [ ] **Step 1: Implement the route**

Create `frontend/src/app/api/payments/razorpay/initiate/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { getRazorpayConfig, generateReceipt, createOrder } from '@/lib/payments/razorpay';

const ADMISSION_AMOUNT = 500;
const REUSE_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const applicationId = body.applicationId || body.application_id;
    if (!applicationId) return badRequestResponse('applicationId is required');

    const { rows: appRows } = await query(
      `SELECT id, vertical, current_status, applicant_mobile, applicant_name, applicant_email
       FROM applications WHERE id = $1`,
      [applicationId],
    );
    if (!appRows[0]) return notFoundResponse('Application not found');
    const app = appRows[0];

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

    // Reuse a recent PENDING transaction if within 15 minutes
    const { rows: pendingTxn } = await query(
      `SELECT id, transaction_ref, gateway_response, created_at
       FROM transactions
       WHERE fee_id = $1 AND status = 'PENDING'
       ORDER BY created_at DESC LIMIT 1`,
      [fee.id],
    );

    let orderId: string = '';
    let internalTxnId: string = '';
    if (pendingTxn[0] && Date.now() - new Date(pendingTxn[0].created_at).getTime() < REUSE_WINDOW_MS) {
      orderId = pendingTxn[0].transaction_ref;
      internalTxnId = pendingTxn[0].id;
    } else {
      if (pendingTxn[0]) {
        await query(`UPDATE transactions SET status='EXPIRED' WHERE id=$1`, [pendingTxn[0].id]);
      }
      const receipt = generateReceipt(applicationId);
      const order = await createOrder({
        amount: ADMISSION_AMOUNT,
        receipt,
        notes: { applicationId, feeId: fee.id },
      });
      orderId = order.id;

      const { rows: ins } = await query(
        `INSERT INTO transactions (fee_id, amount, payment_method, transaction_ref, gateway_response, status)
         VALUES ($1, $2, 'ONLINE', $3, $4, 'PENDING') RETURNING id`,
        [fee.id, ADMISSION_AMOUNT, orderId, JSON.stringify({ order, initiatedAt: new Date().toISOString() })],
      );
      internalTxnId = ins[0].id;
    }

    const cfg = getRazorpayConfig();
    return successResponse({
      orderId,
      keyId: cfg.keyId,
      amount: ADMISSION_AMOUNT,
      currency: 'INR',
      internalTxnId,
      name: 'Hostel Admission Fee',
      description: 'Non-refundable admission fee',
      prefill: {
        name: app.applicant_name || '',
        email: app.applicant_email || '',
        contact: app.applicant_mobile || '',
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/payments/razorpay/initiate:', error);
    return serverErrorResponse('Failed to initiate payment', error);
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/razorpay/initiate/route.ts
git commit -m "feat(payments): add Razorpay initiate route"
```

---

## Task 4: Implement the `verify` API route

**Files:**
- Create: `frontend/src/app/api/payments/razorpay/verify/route.ts`

- [ ] **Step 1: Implement the route**

Create `frontend/src/app/api/payments/razorpay/verify/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { verifyPaymentSignature } from '@/lib/payments/razorpay';
import { sendEmail } from '@/lib/mailer';
import { renderPaymentReceipt } from '@/lib/email-templates/payment-receipt';
import { logger } from '@/lib/logger';

const ADMISSION_AMOUNT = 500;

async function logAudit(applicationId: string | null, event: string, payload: any) {
  if (!applicationId) {
    console.error('razorpay verify audit (no application uuid):', event, payload);
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
    const orderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;

    if (!orderId || !paymentId || !signature) {
      return badRequestResponse('razorpay_order_id, razorpay_payment_id, and razorpay_signature are required');
    }

    const { rows: txnRows } = await query(
      `SELECT t.id, t.fee_id, t.status, f.application_id, f.amount AS fee_amount
       FROM transactions t JOIN fees f ON f.id = t.fee_id
       WHERE t.transaction_ref = $1`,
      [orderId],
    );
    if (!txnRows[0]) return notFoundResponse('Order not found');
    const txn = txnRows[0];
    const applicationId: string = txn.application_id;

    // Idempotency
    if (txn.status === 'SUCCESS') {
      return successResponse({ status: 'SUCCESS', idempotent: true });
    }
    if (txn.status === 'FAILED' || txn.status === 'EXPIRED') {
      return badRequestResponse(`Transaction is ${txn.status}`);
    }

    const sigOk = verifyPaymentSignature({ orderId, paymentId, signature });
    if (!sigOk) {
      await query(
        `UPDATE transactions SET status='FAILED', gateway_response=$2, payment_notes='Signature mismatch' WHERE id=$1`,
        [txn.id, JSON.stringify({ orderId, paymentId, reason: 'signature_mismatch' })],
      );
      await logAudit(applicationId, 'RAZORPAY_VERIFY_SIGNATURE_FAIL', { orderId, paymentId });
      return badRequestResponse('Invalid signature');
    }

    if (Number(txn.fee_amount) !== ADMISSION_AMOUNT) {
      await logAudit(applicationId, 'RAZORPAY_VERIFY_AMOUNT_MISMATCH', { orderId, expected: txn.fee_amount });
      return badRequestResponse('Amount mismatch');
    }

    await query('BEGIN');
    try {
      await query(
        `UPDATE transactions
         SET status='SUCCESS', gateway_response=$2, payment_notes=$3
         WHERE id=$1`,
        [txn.id, JSON.stringify({ orderId, paymentId, signature }), `Razorpay payment ${paymentId}`],
      );
      await query(
        `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE' WHERE id=$1`,
        [txn.fee_id],
      );
      await query(
        `UPDATE applications SET current_status='SUBMITTED', submitted_at=NOW() WHERE id=$1 AND current_status='DRAFT'`,
        [applicationId],
      );
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }

    await logAudit(applicationId, 'RAZORPAY_VERIFY_SUCCESS', { orderId, paymentId });

    // Receipt email (non-blocking)
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
          orderId,
          transactionId: paymentId,
          feeHead: r.fee_head || null,
        });
        sendEmail({
          to: r.applicant_email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        }).catch((err) => {
          logger.error('Payment-receipt email dispatch failed', {
            orderId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.error('Payment-receipt email lookup failed', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return successResponse({ status: 'SUCCESS' });
  } catch (error: any) {
    console.error('Error in POST /api/payments/razorpay/verify:', error);
    return serverErrorResponse('Failed to verify payment', error);
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/razorpay/verify/route.ts
git commit -m "feat(payments): add Razorpay verify route with signature check + finalisation"
```

---

## Task 5: Implement the `status/[orderId]` API route

**Files:**
- Create: `frontend/src/app/api/payments/razorpay/status/[orderId]/route.ts`

- [ ] **Step 1: Implement the route**

Create `frontend/src/app/api/payments/razorpay/status/[orderId]/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const { rows } = await query(
      `SELECT t.id, t.status, t.fee_id, f.application_id, a.current_status AS app_status
       FROM transactions t
       JOIN fees f ON f.id = t.fee_id
       JOIN applications a ON a.id = f.application_id
       WHERE t.transaction_ref = $1`,
      [orderId],
    );
    if (!rows[0]) return notFoundResponse('Order not found');
    const txn = rows[0];

    return successResponse({
      orderId,
      txnStatus: txn.status,
      applicationStatus: txn.app_status,
      applicationId: txn.application_id,
    });
  } catch (error: any) {
    console.error('Error in GET status:', error);
    return serverErrorResponse('Failed to query payment status', error);
  }
}
```

Note: Razorpay's flow finalises through the `verify` route (synchronous, signed) and the `webhook` route (async safety net). The status endpoint exists so the frontend's existing polling fallback keeps working — it simply reads our DB. We do NOT call Razorpay's payments API from here, because the webhook is authoritative for cases where the user closes the browser before verify runs.

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/razorpay/status/[orderId]/route.ts
git commit -m "feat(payments): add Razorpay status route reading from transactions"
```

---

## Task 6: Implement the `webhook` API route

**Files:**
- Create: `frontend/src/app/api/payments/razorpay/webhook/route.ts`

- [ ] **Step 1: Implement the route**

Create `frontend/src/app/api/payments/razorpay/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';

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
    const sig = request.headers.get('x-razorpay-signature') || '';
    if (!verifyWebhookSignature(rawBody, sig)) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const eventType: string = event?.event;
    const payment = event?.payload?.payment?.entity;
    if (!payment) return NextResponse.json({ ok: true, ignored: true });

    const orderId: string = payment.order_id;
    const paymentId: string = payment.id;
    const amountPaise: number = payment.amount;

    const { rows } = await query(
      `SELECT t.id, t.status, t.fee_id, f.application_id, f.amount AS fee_amount
       FROM transactions t JOIN fees f ON f.id = t.fee_id
       WHERE t.transaction_ref = $1`,
      [orderId],
    );
    const txn = rows[0];
    if (!txn) {
      // Webhook for an unknown order — ack to stop retries.
      return NextResponse.json({ ok: true, unknown: true });
    }
    const applicationId: string = txn.application_id;

    if (txn.status === 'SUCCESS' || txn.status === 'FAILED') {
      await logAudit(applicationId, 'RAZORPAY_WEBHOOK_DUPLICATE', {
        orderId, paymentId, eventType, currentStatus: txn.status,
      });
      return NextResponse.json({ ok: true, idempotent: true });
    }

    if (eventType === 'payment.captured') {
      if (Number(amountPaise) !== ADMISSION_AMOUNT * 100 || Number(txn.fee_amount) !== ADMISSION_AMOUNT) {
        await logAudit(applicationId, 'RAZORPAY_WEBHOOK_AMOUNT_MISMATCH', {
          orderId, paymentId, amountPaise, expected: txn.fee_amount,
        });
        return NextResponse.json({ ok: false, error: 'Amount mismatch' }, { status: 400 });
      }
      await query('BEGIN');
      try {
        await query(
          `UPDATE transactions SET status='SUCCESS', gateway_response=$2, payment_notes=$3 WHERE id=$1`,
          [txn.id, JSON.stringify(event), `Razorpay webhook ${paymentId}`],
        );
        await query(
          `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE' WHERE id=$1`,
          [txn.fee_id],
        );
        await query(
          `UPDATE applications SET current_status='SUBMITTED', submitted_at=NOW() WHERE id=$1 AND current_status='DRAFT'`,
          [applicationId],
        );
        await query('COMMIT');
      } catch (e) {
        await query('ROLLBACK');
        throw e;
      }
      await logAudit(applicationId, 'RAZORPAY_WEBHOOK_SUCCESS', { orderId, paymentId });
    } else if (eventType === 'payment.failed') {
      await query(
        `UPDATE transactions SET status='FAILED', gateway_response=$2 WHERE id=$1`,
        [txn.id, JSON.stringify(event)],
      );
      await logAudit(applicationId, 'RAZORPAY_WEBHOOK_FAILED', { orderId, paymentId });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in /api/payments/razorpay/webhook:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/razorpay/webhook/route.ts
git commit -m "feat(payments): add Razorpay webhook route with idempotent finalisation"
```

---

## Task 7: Implement the dev-bypass route

**Files:**
- Create: `frontend/src/app/api/payments/razorpay/dev-bypass/route.ts`

- [ ] **Step 1: Implement the route**

Create `frontend/src/app/api/payments/razorpay/dev-bypass/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * DEV-ONLY: marks the application's admission fee as paid and flips the
 * application to SUBMITTED, without invoking Razorpay. Disabled unless
 * PAYMENT_BYPASS=true in the server env.
 */
export async function POST(request: NextRequest) {
  if (process.env.PAYMENT_BYPASS !== 'true') {
    return NextResponse.json(
      { success: false, error: 'Payment bypass not enabled' },
      { status: 403 },
    );
  }

  try {
    const { applicationId } = (await request.json()) as { applicationId?: string };
    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'applicationId is required' },
        { status: 400 },
      );
    }

    const { rows: feeRows } = await query(
      `SELECT id, status FROM fees
       WHERE application_id = $1 AND fee_head = 'ADMISSION_FEE'
       ORDER BY created_at DESC LIMIT 1`,
      [applicationId],
    );
    if (!feeRows[0]) {
      return NextResponse.json(
        { success: false, error: 'Admission fee record not found' },
        { status: 404 },
      );
    }
    const fee = feeRows[0];

    await query('BEGIN');
    try {
      if (fee.status !== 'PAID') {
        await query(
          `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE'
           WHERE id=$1`,
          [fee.id],
        );
      }
      await query(
        `UPDATE applications
         SET current_status='SUBMITTED', submitted_at=COALESCE(submitted_at, NOW())
         WHERE id=$1 AND current_status='DRAFT'`,
        [applicationId],
      );
      await query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
         VALUES ('APPLICATION', $1, 'STATUS_CHANGE', $2)`,
        [applicationId, JSON.stringify({ event: 'PAYMENT_BYPASS', feeId: fee.id })],
      );
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in /api/payments/razorpay/dev-bypass:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/api/payments/razorpay/dev-bypass/route.ts
git commit -m "feat(payments): add Razorpay dev-bypass route"
```

---

## Task 8: Implement the client-side checkout helper

**Files:**
- Create: `frontend/src/lib/payments/razorpayClient.ts`

- [ ] **Step 1: Implement the helper**

Create `frontend/src/lib/payments/razorpayClient.ts`:

```typescript
declare global {
  interface Window {
    Razorpay?: any;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise: Promise<void> | null = null;

export function loadCheckoutScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in browser'));
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export interface OpenCheckoutOptions {
  keyId: string;
  orderId: string;
  amount: number; // rupees
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export interface CheckoutResult {
  status: 'SUCCESS' | 'CANCELLED' | 'FAILED';
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  error?: string;
}

export async function openCheckout(opts: OpenCheckoutOptions): Promise<CheckoutResult> {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error('Razorpay checkout not available');

  return new Promise<CheckoutResult>((resolve) => {
    const rzp = new window.Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: Math.round(opts.amount * 100),
      currency: opts.currency,
      name: opts.name,
      description: opts.description,
      prefill: opts.prefill,
      handler: (response: any) => {
        resolve({
          status: 'SUCCESS',
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => resolve({ status: 'CANCELLED' }),
      },
    });
    rzp.on('payment.failed', (resp: any) => {
      resolve({ status: 'FAILED', error: resp?.error?.description || 'Payment failed' });
    });
    rzp.open();
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/payments/razorpayClient.ts
git commit -m "feat(payments): add Razorpay client checkout helper"
```

---

## Task 9: Update `AdmissionFeeStep` to use Razorpay (TDD)

**Files:**
- Modify: `frontend/tests/payments/AdmissionFeeStep.test.tsx`
- Modify: `frontend/src/components/forms/AdmissionFeeStep.tsx`

- [ ] **Step 1: Replace the test file content**

Overwrite `frontend/tests/payments/AdmissionFeeStep.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/payments/razorpayClient', () => ({
  loadCheckoutScript: vi.fn().mockResolvedValue(undefined),
  openCheckout: vi.fn(),
}));

import { AdmissionFeeStep } from '@/components/forms/AdmissionFeeStep';
import * as rzpClient from '@/lib/payments/razorpayClient';

describe('AdmissionFeeStep', () => {
  const onSuccess = vi.fn();
  const onFailure = vi.fn();

  beforeEach(() => {
    onSuccess.mockReset();
    onFailure.mockReset();
    vi.mocked(rzpClient.openCheckout).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders the AdmissionFeeNotice and a submit button', () => {
      render(
        <AdmissionFeeStep
          applicationId="app-1"
          onSuccess={onSuccess}
          onFailure={onFailure}
        />,
      );
      expect(screen.getByText(/Admission Fee — ₹500 \(Non-Refundable\)/i)).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('shows the production button label when bypass is off', () => {
      vi.stubEnv('NEXT_PUBLIC_PAYMENT_BYPASS', 'false');
      render(
        <AdmissionFeeStep applicationId="app-1" onSuccess={onSuccess} onFailure={onFailure} />,
      );
      expect(
        screen.getByRole('button', { name: /Pay ₹500 & Submit Application/i }),
      ).toBeInTheDocument();
    });

    it('shows the dev-bypass button label when bypass is on', () => {
      vi.stubEnv('NEXT_PUBLIC_PAYMENT_BYPASS', 'true');
      render(
        <AdmissionFeeStep applicationId="app-1" onSuccess={onSuccess} onFailure={onFailure} />,
      );
      expect(
        screen.getByRole('button', { name: /Submit Application \(Dev: skip ₹500\)/i }),
      ).toBeInTheDocument();
    });
  });

  describe('dev bypass flow', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_PAYMENT_BYPASS', 'true');
    });

    it('calls onSuccess and posts to the Razorpay dev-bypass endpoint', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      render(
        <AdmissionFeeStep applicationId="app-42" onSuccess={onSuccess} onFailure={onFailure} />,
      );
      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('/api/payments/razorpay/dev-bypass');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ applicationId: 'app-42' });
    });

    it('shows an error when bypass endpoint fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Bypass not allowed' }),
      } as Response);

      render(
        <AdmissionFeeStep applicationId="app-1" onSuccess={onSuccess} onFailure={onFailure} />,
      );
      fireEvent.click(screen.getByRole('button'));
      await waitFor(() =>
        expect(screen.getByText(/Bypass not allowed/i)).toBeInTheDocument(),
      );
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('razorpay flow', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_PAYMENT_BYPASS', 'false');
    });

    it('calls initiate, opens checkout, posts to verify on success, then onSuccess', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              orderId: 'order_TEST',
              keyId: 'rzp_test_K',
              amount: 500,
              currency: 'INR',
              internalTxnId: 'txn-1',
              name: 'Hostel Admission Fee',
              description: 'Non-refundable admission fee',
              prefill: { name: 'A', email: 'a@b.c', contact: '9999999999' },
            },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: { status: 'SUCCESS' } }),
        } as Response);

      vi.mocked(rzpClient.openCheckout).mockResolvedValueOnce({
        status: 'SUCCESS',
        razorpay_order_id: 'order_TEST',
        razorpay_payment_id: 'pay_TEST',
        razorpay_signature: 'sigTEST',
      });

      render(
        <AdmissionFeeStep applicationId="app-1" onSuccess={onSuccess} onFailure={onFailure} />,
      );
      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/payments/razorpay/initiate');
      expect(fetchSpy.mock.calls[1][0]).toBe('/api/payments/razorpay/verify');
      const verifyBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
      expect(verifyBody).toMatchObject({
        razorpay_order_id: 'order_TEST',
        razorpay_payment_id: 'pay_TEST',
        razorpay_signature: 'sigTEST',
      });
    });

    it('calls onFailure when the user cancels the modal', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            orderId: 'order_TEST',
            keyId: 'rzp_test_K',
            amount: 500,
            currency: 'INR',
            internalTxnId: 'txn-1',
            name: 'X', description: 'X', prefill: {},
          },
        }),
      } as Response);
      vi.mocked(rzpClient.openCheckout).mockResolvedValueOnce({ status: 'CANCELLED' });

      render(
        <AdmissionFeeStep applicationId="app-1" onSuccess={onSuccess} onFailure={onFailure} />,
      );
      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => expect(onFailure).toHaveBeenCalled());
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('shows an error when the initiate endpoint fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Application not in DRAFT' }),
      } as Response);

      render(
        <AdmissionFeeStep applicationId="app-1" onSuccess={onSuccess} onFailure={onFailure} />,
      );
      fireEvent.click(screen.getByRole('button'));
      await waitFor(() =>
        expect(screen.getByText(/Application not in DRAFT/i)).toBeInTheDocument(),
      );
    });
  });
});
```

- [ ] **Step 2: Run the test and verify failures**

```bash
cd frontend && npx vitest run tests/payments/AdmissionFeeStep.test.tsx
```

Expected: FAIL — assertions on URLs and `openCheckout` will not match the existing Paytm-based component.

- [ ] **Step 3: Replace the component**

Overwrite `frontend/src/components/forms/AdmissionFeeStep.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { AdmissionFeeNotice } from './AdmissionFeeNotice';
import { openCheckout } from '@/lib/payments/razorpayClient';

interface Props {
  applicationId: string;
  onSuccess: () => void;
  onFailure: (reason: string) => void;
}

export function AdmissionFeeStep({ applicationId, onSuccess, onFailure }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bypass = process.env.NEXT_PUBLIC_PAYMENT_BYPASS === 'true';

  async function handlePay() {
    setBusy(true);
    setError(null);
    try {
      if (bypass) {
        const res = await fetch('/api/payments/razorpay/dev-bypass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Bypass failed');
        }
        onSuccess();
        setBusy(false);
        return;
      }

      const initRes = await fetch('/api/payments/razorpay/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      const initJson = await initRes.json();
      if (!initRes.ok || !initJson?.data?.orderId) {
        throw new Error(initJson?.error || 'Failed to start payment');
      }
      const d = initJson.data;

      const result = await openCheckout({
        keyId: d.keyId,
        orderId: d.orderId,
        amount: d.amount,
        currency: d.currency,
        name: d.name,
        description: d.description,
        prefill: d.prefill,
      });

      if (result.status === 'CANCELLED') {
        onFailure('Payment cancelled');
        setBusy(false);
        return;
      }
      if (result.status === 'FAILED') {
        onFailure(result.error || 'Payment failed');
        setBusy(false);
        return;
      }

      const verifyRes = await fetch('/api/payments/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: result.razorpay_order_id,
          razorpay_payment_id: result.razorpay_payment_id,
          razorpay_signature: result.razorpay_signature,
        }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok || verifyJson?.data?.status !== 'SUCCESS') {
        throw new Error(verifyJson?.error || 'Payment verification failed');
      }
      onSuccess();
      setBusy(false);
    } catch (e: any) {
      setError(e.message || 'Payment failed');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdmissionFeeNotice />
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? 'Processing…' : bypass ? 'Submit Application (Dev: skip ₹500)' : 'Pay ₹500 & Submit Application'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify pass**

```bash
cd frontend && npx vitest run tests/payments/AdmissionFeeStep.test.tsx
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/forms/AdmissionFeeStep.tsx frontend/tests/payments/AdmissionFeeStep.test.tsx
git commit -m "feat(payments): switch AdmissionFeeStep to Razorpay checkout"
```

---

## Task 10: Refresh Paytm-named comments in `applications/route.ts`

**Files:**
- Modify: `frontend/src/app/api/applications/route.ts`

- [ ] **Step 1: Update the two comments**

In `frontend/src/app/api/applications/route.ts`, replace:

```typescript
    // Hostel verticals: force DRAFT — only the Paytm callback flips to SUBMITTED.
```

with:

```typescript
    // Hostel verticals: force DRAFT — only the Razorpay verify route flips to SUBMITTED.
```

And replace:

```typescript
    // For hostel verticals, create the ADMISSION_FEE row that the Paytm flow will pay.
```

with:

```typescript
    // For hostel verticals, create the ADMISSION_FEE row that the Razorpay flow will pay.
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/api/applications/route.ts
git commit -m "docs(applications): update Paytm references in comments to Razorpay"
```

---

## Task 11: Delete Paytm code

**Files:**
- Delete: `frontend/src/lib/payments/paytm.ts`
- Delete: `frontend/src/lib/payments/paytm.test.ts`
- Delete: `frontend/src/lib/payments/paytmchecksum.d.ts`
- Delete: `frontend/src/app/api/payments/paytm/` (entire subtree)

- [ ] **Step 1: Confirm no remaining imports of `@/lib/payments/paytm`**

```bash
cd frontend && rg -n "@/lib/payments/paytm|window\.Paytm" src tests
```

Expected: no matches.

- [ ] **Step 2: Delete the files**

```bash
rm frontend/src/lib/payments/paytm.ts \
   frontend/src/lib/payments/paytm.test.ts \
   frontend/src/lib/payments/paytmchecksum.d.ts
rm -r frontend/src/app/api/payments/paytm
```

- [ ] **Step 3: Type-check + run tests**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/lib/payments frontend/src/app/api/payments
git commit -m "chore(payments): remove Paytm integration"
```

---

## Task 12: Drop the `paytmchecksum` dependency

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] **Step 1: Remove the dependency**

```bash
cd frontend && npm uninstall paytmchecksum
```

- [ ] **Step 2: Verify no remaining references**

```bash
cd frontend && rg -n "paytmchecksum" .
```

Expected: no matches.

- [ ] **Step 3: Run tests + build**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): drop paytmchecksum"
```

---

## Task 13: Update `.env.local` (manual step, no commit)

**Files:**
- Modify: `frontend/.env.local` (gitignored — do NOT commit)

- [ ] **Step 1: Replace Paytm env vars with Razorpay**

Open `frontend/.env.local` and:

- Remove all `PAYTM_*` and `NEXT_PUBLIC_PAYTM_*` variables.
- Add:

```
RAZORPAY_KEY_ID=rzp_test_Sjc9aIlyj4y9bg
RAZORPAY_KEY_SECRET=i8BegnffUqIwEnwLODbQGOqj
RAZORPAY_WEBHOOK_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_Sjc9aIlyj4y9bg
```

`RAZORPAY_WEBHOOK_SECRET` stays blank until a webhook is configured in the Razorpay dashboard pointing to `/api/payments/razorpay/webhook`. Until set, the webhook route will reject all calls (it returns 400 on missing/invalid signature).

- [ ] **Step 2: Restart `npm run dev`** so Next.js picks up the new env.

- [ ] **Step 3: Smoke-test the flow manually**

1. Submit a hostel application end-to-end → click Pay.
2. Razorpay test card `4111 1111 1111 1111` / any future expiry / any CVV / OTP `1234`.
3. Verify: application flips to SUBMITTED, fee row to PAID, transaction row to SUCCESS.
4. Try the cancel path (close modal) → application stays DRAFT, transaction stays PENDING.
5. With `PAYMENT_BYPASS=true`, click the dev-bypass button → application becomes SUBMITTED.

No commit (env file is gitignored).

---

## Task 14: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
cd frontend && npx vitest run
```

Expected: PASS, including the new Razorpay tests.

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run the build**

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 4: Final grep — confirm no stray Paytm code**

```bash
cd frontend && rg -n "paytm|Paytm|PAYTM" src tests --glob '!*.test.tsx' --glob '!fees/PaymentFlowModal.tsx' --glob '!renewal/FeeTopupStep.tsx'
```

Expected: no matches. (PaymentFlowModal and FeeTopupStep mention Paytm only as a UPI app name in user-facing copy — intentionally retained.)
