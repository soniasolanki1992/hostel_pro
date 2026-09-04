# Paytm Admission Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect a non-refundable ₹500 admission fee via Paytm Checkout JS at the point of submitting a Boys Hostel or Girls Ashram application; adjust the paid amount against the resident's hostel fees on approval. Dharamshala flow is unchanged.

**Architecture:** Server-side Paytm utility creates `txnToken` after persisting a DRAFT application + `fees`/`transactions` rows. Frontend opens Paytm Checkout JS overlay; a server-to-server callback verifies checksum and flips the application to `SUBMITTED`. A polling status endpoint reconciles delayed callbacks. Approval flow auto-credits the ₹500 toward the resident's hostel fees.

**Tech Stack:** Next.js 16 App Router (TypeScript), `pg` (PostgreSQL), `paytmchecksum` (official Paytm npm package), Vitest for tests, existing `query` helper from `@/lib/db`, existing `responses.ts` helpers.

**Spec:** `docs/superpowers/specs/2026-04-28-paytm-admission-fee-design.md`

---

## File Structure

**New:**
- `frontend/src/lib/payments/paytm.ts` — server util (checksum, env config, status query)
- `frontend/src/lib/payments/paytm.test.ts` — unit tests
- `frontend/src/app/api/payments/paytm/initiate/route.ts` — POST endpoint
- `frontend/src/app/api/payments/paytm/callback/route.ts` — POST callback endpoint
- `frontend/src/app/api/payments/paytm/status/[orderId]/route.ts` — GET status endpoint
- `frontend/src/components/forms/AdmissionFeeNotice.tsx` — disclaimer
- `frontend/src/components/forms/AdmissionFeeStep.tsx` — final wizard step with Pay button
- `frontend/src/lib/payments/admission-credit.ts` — `adjustAdmissionFeeCredit` helper

**Modified:**
- `frontend/.env.local` and `frontend/.env.example` — add Paytm env vars
- `frontend/package.json` — add `paytmchecksum` dependency
- `frontend/src/app/api/applications/route.ts` — POST creates DRAFT + fees row when vertical is hostel; Dharamshala unchanged
- `frontend/src/app/apply/boys-hostel/form/page.tsx` — wire AdmissionFeeStep, payment-gated submit
- `frontend/src/app/apply/girls-ashram/form/page.tsx` — same
- `frontend/src/app/api/applications/[id]/route.ts` — call `adjustAdmissionFeeCredit` on approval

---

## Task 1: Add Paytm dependency, env vars, and server utility

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/.env.example` (or modify existing)
- Modify: `frontend/.env.local`
- Create: `frontend/src/lib/payments/paytm.ts`
- Create: `frontend/src/lib/payments/paytm.test.ts`

- [ ] **Step 1: Install paytmchecksum**

```bash
cd /Applications/XAMPP/xamppfiles/htdocs/hostel_pro/frontend
npm install paytmchecksum
```

Expected: `paytmchecksum` added to `dependencies` in `package.json`.

- [ ] **Step 2: Add Paytm env vars**

Append to `frontend/.env.local` AND `frontend/.env.example` (create the example file if missing — just the keys with placeholder values, no real secrets):

```
# Paytm Payment Gateway
PAYTM_ENV=staging
PAYTM_MID=YOUR_STAGING_MID
PAYTM_MERCHANT_KEY=YOUR_STAGING_MERCHANT_KEY
PAYTM_WEBSITE=WEBSTAGING
PAYTM_CALLBACK_URL=http://localhost:3000/api/payments/paytm/callback
NEXT_PUBLIC_PAYTM_MID=YOUR_STAGING_MID
NEXT_PUBLIC_PAYTM_ENV=staging
```

- [ ] **Step 3: Write failing tests for paytm util**

Create `frontend/src/lib/payments/paytm.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env BEFORE importing the module
vi.stubEnv('PAYTM_ENV', 'staging');
vi.stubEnv('PAYTM_MID', 'TESTMID');
vi.stubEnv('PAYTM_MERCHANT_KEY', 'TESTKEY');
vi.stubEnv('PAYTM_WEBSITE', 'WEBSTAGING');
vi.stubEnv('PAYTM_CALLBACK_URL', 'http://localhost:3000/cb');

import {
  getPaytmConfig,
  getPaytmBaseUrl,
  generateOrderId,
  generateChecksum,
  verifyChecksum,
} from './paytm';

describe('paytm config', () => {
  it('returns staging base URL when PAYTM_ENV=staging', () => {
    expect(getPaytmBaseUrl()).toBe('https://securegw-stage.paytm.in');
  });

  it('reads MID and merchant key from env', () => {
    const cfg = getPaytmConfig();
    expect(cfg.mid).toBe('TESTMID');
    expect(cfg.merchantKey).toBe('TESTKEY');
    expect(cfg.website).toBe('WEBSTAGING');
  });
});

describe('generateOrderId', () => {
  it('produces a unique order id of length <= 50', () => {
    const a = generateOrderId('app-uuid-1');
    const b = generateOrderId('app-uuid-1');
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(50);
    expect(a.startsWith('ADM')).toBe(true);
  });
});

describe('checksum round-trip', () => {
  it('generates and verifies a checksum for the same payload', async () => {
    const params = { ORDERID: 'ADM_TEST_1', MID: 'TESTMID', AMOUNT: '500.00' };
    const checksum = await generateChecksum(params);
    expect(typeof checksum).toBe('string');
    expect(checksum.length).toBeGreaterThan(0);
    const ok = await verifyChecksum(params, checksum);
    expect(ok).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const params = { ORDERID: 'ADM_TEST_2', MID: 'TESTMID', AMOUNT: '500.00' };
    const checksum = await generateChecksum(params);
    const tampered = { ...params, AMOUNT: '1.00' };
    const ok = await verifyChecksum(tampered, checksum);
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 4: Run test, verify it fails**

```bash
cd frontend && npx vitest run src/lib/payments/paytm.test.ts
```

Expected: FAIL — module `./paytm` not found.

- [ ] **Step 5: Implement paytm util**

Create `frontend/src/lib/payments/paytm.ts`:

```ts
import PaytmChecksum from 'paytmchecksum';
import { randomBytes } from 'crypto';

export interface PaytmConfig {
  env: 'staging' | 'production';
  mid: string;
  merchantKey: string;
  website: string;
  callbackUrl: string;
}

export function getPaytmConfig(): PaytmConfig {
  const env = (process.env.PAYTM_ENV || 'staging') as 'staging' | 'production';
  const mid = process.env.PAYTM_MID || '';
  const merchantKey = process.env.PAYTM_MERCHANT_KEY || '';
  const website = process.env.PAYTM_WEBSITE || (env === 'production' ? 'DEFAULT' : 'WEBSTAGING');
  const callbackUrl = process.env.PAYTM_CALLBACK_URL || '';
  if (!mid || !merchantKey) {
    throw new Error('Paytm env vars not configured: PAYTM_MID and PAYTM_MERCHANT_KEY required');
  }
  return { env, mid, merchantKey, website, callbackUrl };
}

export function getPaytmBaseUrl(): string {
  const env = process.env.PAYTM_ENV || 'staging';
  return env === 'production'
    ? 'https://securegw.paytm.in'
    : 'https://securegw-stage.paytm.in';
}

export function generateOrderId(applicationId: string): string {
  // ADM_<short-app>_<timestamp>_<rand4>
  const short = applicationId.replace(/-/g, '').slice(0, 12);
  const ts = Date.now().toString(36);
  const rand = randomBytes(2).toString('hex');
  return `ADM_${short}_${ts}_${rand}`.slice(0, 50);
}

export async function generateChecksum(params: Record<string, string>): Promise<string> {
  const { merchantKey } = getPaytmConfig();
  return PaytmChecksum.generateSignature(params, merchantKey);
}

export async function verifyChecksum(
  params: Record<string, string>,
  checksum: string,
): Promise<boolean> {
  const { merchantKey } = getPaytmConfig();
  return PaytmChecksum.verifySignature(params, merchantKey, checksum);
}

export interface InitiateTxnResponse {
  txnToken: string;
  orderId: string;
}

export async function initiateTransaction(opts: {
  orderId: string;
  amount: number;
  customerId: string;
  callbackUrl?: string;
}): Promise<InitiateTxnResponse> {
  const cfg = getPaytmConfig();
  const body = {
    requestType: 'Payment',
    mid: cfg.mid,
    websiteName: cfg.website,
    orderId: opts.orderId,
    callbackUrl: opts.callbackUrl || cfg.callbackUrl,
    txnAmount: { value: opts.amount.toFixed(2), currency: 'INR' },
    userInfo: { custId: opts.customerId },
  };
  const checksum = await PaytmChecksum.generateSignature(JSON.stringify(body), cfg.merchantKey);
  const url = `${getPaytmBaseUrl()}/theia/api/v1/initiateTransaction?mid=${cfg.mid}&orderId=${opts.orderId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, head: { signature: checksum } }),
  });
  const json = await res.json();
  if (json?.body?.resultInfo?.resultStatus !== 'S') {
    throw new Error(`Paytm initiate failed: ${json?.body?.resultInfo?.resultMsg || 'unknown'}`);
  }
  return { txnToken: json.body.txnToken, orderId: opts.orderId };
}

export async function queryTransactionStatus(orderId: string): Promise<any> {
  const cfg = getPaytmConfig();
  const body = { mid: cfg.mid, orderId };
  const checksum = await PaytmChecksum.generateSignature(JSON.stringify(body), cfg.merchantKey);
  const url = `${getPaytmBaseUrl()}/v3/order/status`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, head: { signature: checksum } }),
  });
  return res.json();
}
```

- [ ] **Step 6: Run tests, verify pass**

```bash
cd frontend && npx vitest run src/lib/payments/paytm.test.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env.local frontend/.env.example frontend/src/lib/payments/paytm.ts frontend/src/lib/payments/paytm.test.ts
git commit -m "feat(payments): add Paytm server utility and env config"
```

---

## Task 2: Modify POST /api/applications to create DRAFT + fees row for hostel verticals

**Files:**
- Modify: `frontend/src/app/api/applications/route.ts`

- [ ] **Step 1: Update POST handler to force DRAFT and create fees row for hostel verticals**

In `frontend/src/app/api/applications/route.ts`, replace the section after the `INSERT INTO applications` block (around lines 229–253). Specifically:

1. Override `currentStatus` to `'DRAFT'` for `BOYS_HOSTEL` and `GIRLS_ASHRAM` regardless of `body.status`. Dharamshala continues to honor `body.status`.
2. After the application insert, when vertical is hostel, insert a `fees` row.

Replace lines 229–253 with:

```ts
    const isHostelVertical = vertical === 'BOYS_HOSTEL' || vertical === 'GIRLS_ASHRAM';

    // Hostel verticals: force DRAFT — only the Paytm callback flips to SUBMITTED.
    // Dharamshala: honor whatever status the client sent (typically SUBMITTED).
    const currentStatus = isHostelVertical ? 'DRAFT' : (body.status || 'DRAFT');
    const submittedAt = currentStatus === 'SUBMITTED' ? new Date().toISOString() : null;

    const { rows } = await query(
      `INSERT INTO applications (
        tracking_number, type, applicant_name, applicant_mobile, applicant_email,
        date_of_birth, gender, vertical, current_status, data, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        trackingNumber,
        body.type || 'NEW',
        applicantName,
        applicantMobile,
        applicantEmail,
        dateOfBirth,
        gender,
        vertical,
        currentStatus,
        JSON.stringify(data),
        submittedAt,
      ]
    );

    const application = rows[0];

    // For hostel verticals, create the ADMISSION_FEE row that the Paytm flow will pay.
    if (isHostelVertical) {
      await query(
        `INSERT INTO fees (application_id, fee_head, description, amount, status, due_date)
         VALUES ($1, 'ADMISSION_FEE', 'Non-refundable admission fee', 500, 'PENDING', NOW() + INTERVAL '7 days')`,
        [application.id],
      );
    }
```

- [ ] **Step 2: Manual smoke test — POST a hostel application via curl**

```bash
curl -s -X POST http://localhost:3000/api/applications \
  -H 'Content-Type: application/json' \
  -d '{"vertical":"boys-hostel","firstName":"Test","lastName":"User","applicantMobile":"9999999999","dateOfBirth":"2000-01-01","gender":"male","fatherName":"X","fatherMobile":"9999999999","status":"SUBMITTED"}' | jq
```

Expected: response shows `current_status: "DRAFT"` (NOT SUBMITTED), and `submitted_at: null`.

Then verify a fee row was created:

```bash
psql "postgresql://USER:PASS@51.68.196.242:5432/hostel_pro" -c "SELECT id, application_id, fee_head, amount, status FROM fees WHERE application_id='<id-from-above>';"
```

Expected: one row with `fee_head=ADMISSION_FEE`, `amount=500.00`, `status=PENDING`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/applications/route.ts
git commit -m "feat(applications): create hostel applications as DRAFT with pending admission fee"
```

---

## Task 3: Build POST /api/payments/paytm/initiate

**Files:**
- Create: `frontend/src/app/api/payments/paytm/initiate/route.ts`

- [ ] **Step 1: Create the initiate route**

```ts
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { getPaytmConfig, generateOrderId, initiateTransaction } from '@/lib/payments/paytm';

const ADMISSION_AMOUNT = 500;
const REUSE_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const applicationId = body.applicationId || body.application_id;
    if (!applicationId) {
      return badRequestResponse('applicationId is required');
    }

    const { rows: appRows } = await query(
      `SELECT id, vertical, current_status, applicant_mobile FROM applications WHERE id = $1`,
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
      `SELECT id, status FROM fees WHERE application_id = $1 AND fee_head = 'ADMISSION_FEE' ORDER BY created_at DESC LIMIT 1`,
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

    let orderId: string;
    let txnToken: string | null = null;
    if (pendingTxn[0] && Date.now() - new Date(pendingTxn[0].created_at).getTime() < REUSE_WINDOW_MS) {
      orderId = pendingTxn[0].transaction_ref;
      txnToken = pendingTxn[0].gateway_response?.txnToken || null;
    }

    if (!txnToken) {
      // Mark older PENDING as EXPIRED
      if (pendingTxn[0]) {
        await query(`UPDATE transactions SET status='EXPIRED' WHERE id=$1`, [pendingTxn[0].id]);
      }
      orderId = generateOrderId(applicationId);
      const result = await initiateTransaction({
        orderId,
        amount: ADMISSION_AMOUNT,
        customerId: app.applicant_mobile || applicationId,
      });
      txnToken = result.txnToken;

      await query(
        `INSERT INTO transactions (fee_id, amount, payment_method, transaction_ref, gateway_response, status)
         VALUES ($1, $2, 'ONLINE', $3, $4, 'PENDING')`,
        [fee.id, ADMISSION_AMOUNT, orderId, JSON.stringify({ txnToken, initiatedAt: new Date().toISOString() })],
      );
    }

    const cfg = getPaytmConfig();
    return successResponse({
      orderId,
      txnToken,
      amount: ADMISSION_AMOUNT,
      mid: cfg.mid,
      env: cfg.env,
    });
  } catch (error: any) {
    console.error('Error in POST /api/payments/paytm/initiate:', error);
    return serverErrorResponse('Failed to initiate payment', error);
  }
}
```

- [ ] **Step 2: Manual smoke test**

Start dev server, then with a DRAFT application id from Task 2:

```bash
curl -s -X POST http://localhost:3000/api/payments/paytm/initiate \
  -H 'Content-Type: application/json' \
  -d '{"applicationId":"<draft-app-id>"}' | jq
```

Expected: `success: true`, response data has `orderId`, `txnToken`, `amount: 500`, `mid`, `env: "staging"`. Verify a `transactions` row was inserted with `status='PENDING'`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/paytm/initiate/route.ts
git commit -m "feat(payments): add Paytm initiate endpoint"
```

---

## Task 4: Build POST /api/payments/paytm/callback (idempotent verification)

**Files:**
- Create: `frontend/src/app/api/payments/paytm/callback/route.ts`

- [ ] **Step 1: Create the callback route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyChecksum } from '@/lib/payments/paytm';

const ADMISSION_AMOUNT = 500;

async function logAudit(event: string, payload: any) {
  try {
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
       VALUES ('TRANSACTION', $1, $2, $3)`,
      [payload?.ORDERID || null, event, JSON.stringify(payload || {})],
    );
  } catch (e) {
    console.error('audit log failed', e);
  }
}

export async function POST(request: NextRequest) {
  let payload: Record<string, string> = {};
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      form.forEach((v, k) => { payload[k] = String(v); });
    }

    const checksumHash = payload.CHECKSUMHASH;
    delete payload.CHECKSUMHASH;
    if (!checksumHash) {
      await logAudit('PAYTM_CALLBACK_NO_CHECKSUM', payload);
      return NextResponse.json({ success: false, error: 'Missing checksum' }, { status: 400 });
    }

    const ok = await verifyChecksum(payload, checksumHash);
    if (!ok) {
      await logAudit('PAYTM_CALLBACK_CHECKSUM_MISMATCH', payload);
      return NextResponse.json({ success: false, error: 'Invalid checksum' }, { status: 400 });
    }

    const orderId = payload.ORDERID;
    const status = payload.STATUS; // TXN_SUCCESS | TXN_FAILURE | PENDING
    const txnId = payload.TXNID || null;
    const amount = payload.TXNAMOUNT;

    const { rows: txnRows } = await query(
      `SELECT t.id, t.fee_id, t.status, f.application_id, f.amount AS fee_amount
       FROM transactions t JOIN fees f ON f.id = t.fee_id
       WHERE t.transaction_ref = $1`,
      [orderId],
    );
    if (!txnRows[0]) {
      await logAudit('PAYTM_CALLBACK_UNKNOWN_ORDER', payload);
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }
    const txn = txnRows[0];

    // Idempotency: already finalized
    if (txn.status === 'SUCCESS' || txn.status === 'FAILED') {
      await logAudit('PAYTM_CALLBACK_DUPLICATE', { orderId, currentStatus: txn.status });
      return NextResponse.json({ success: true, idempotent: true });
    }

    // Validate amount
    if (Number(amount) !== Number(txn.fee_amount) || Number(amount) !== ADMISSION_AMOUNT) {
      await logAudit('PAYTM_CALLBACK_AMOUNT_MISMATCH', { orderId, amount, expected: txn.fee_amount });
      return NextResponse.json({ success: false, error: 'Amount mismatch' }, { status: 400 });
    }

    if (status === 'TXN_SUCCESS') {
      await query('BEGIN');
      try {
        await query(
          `UPDATE transactions
           SET status='SUCCESS', gateway_response=$2, payment_notes=$3
           WHERE id=$1`,
          [txn.id, JSON.stringify(payload), `Paytm TXNID ${txnId}`],
        );
        await query(
          `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE' WHERE id=$1`,
          [txn.fee_id],
        );
        await query(
          `UPDATE applications SET current_status='SUBMITTED', submitted_at=NOW() WHERE id=$1 AND current_status='DRAFT'`,
          [txn.application_id],
        );
        await query('COMMIT');
        await logAudit('PAYTM_CALLBACK_SUCCESS', { orderId, txnId });
      } catch (e) {
        await query('ROLLBACK');
        throw e;
      }
    } else {
      await query(
        `UPDATE transactions SET status='FAILED', gateway_response=$2, payment_notes=$3 WHERE id=$1`,
        [txn.id, JSON.stringify(payload), `Paytm status: ${status}`],
      );
      await logAudit('PAYTM_CALLBACK_FAILED', { orderId, status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in /api/payments/paytm/callback:', error);
    await logAudit('PAYTM_CALLBACK_ERROR', { error: String(error), payload });
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test invalid checksum returns 400**

```bash
curl -s -X POST http://localhost:3000/api/payments/paytm/callback \
  -H 'Content-Type: application/json' \
  -d '{"ORDERID":"FAKE","STATUS":"TXN_SUCCESS","TXNAMOUNT":"500.00","CHECKSUMHASH":"bad"}' | jq
```

Expected: `{ success: false, error: "Invalid checksum" }`, status 400.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/paytm/callback/route.ts
git commit -m "feat(payments): add Paytm callback with checksum verification and idempotency"
```

---

## Task 5: Build GET /api/payments/paytm/status/[orderId] (poll & reconcile)

**Files:**
- Create: `frontend/src/app/api/payments/paytm/status/[orderId]/route.ts`

- [ ] **Step 1: Create the status route**

```ts
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { queryTransactionStatus } from '@/lib/payments/paytm';

const ADMISSION_AMOUNT = 500;

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
    let txn = rows[0];

    if (txn.status === 'PENDING') {
      // Reconcile via Paytm
      const result = await queryTransactionStatus(orderId);
      const remoteStatus = result?.body?.resultInfo?.resultStatus;
      const txnAmount = result?.body?.txnAmount;
      const txnId = result?.body?.txnId;
      if (remoteStatus === 'TXN_SUCCESS' && Number(txnAmount) === ADMISSION_AMOUNT) {
        await query('BEGIN');
        try {
          await query(
            `UPDATE transactions SET status='SUCCESS', gateway_response=$2, payment_notes=$3 WHERE id=$1`,
            [txn.id, JSON.stringify(result.body), `Reconciled TXNID ${txnId}`],
          );
          await query(
            `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE' WHERE id=$1`,
            [txn.fee_id],
          );
          await query(
            `UPDATE applications SET current_status='SUBMITTED', submitted_at=NOW() WHERE id=$1 AND current_status='DRAFT'`,
            [txn.application_id],
          );
          await query('COMMIT');
          txn = { ...txn, status: 'SUCCESS', app_status: 'SUBMITTED' };
        } catch (e) {
          await query('ROLLBACK');
          throw e;
        }
      } else if (remoteStatus === 'TXN_FAILURE') {
        await query(
          `UPDATE transactions SET status='FAILED', gateway_response=$2 WHERE id=$1`,
          [txn.id, JSON.stringify(result.body)],
        );
        txn = { ...txn, status: 'FAILED' };
      }
    }

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

- [ ] **Step 2: Smoke test for unknown order**

```bash
curl -s http://localhost:3000/api/payments/paytm/status/UNKNOWN | jq
```

Expected: `success: false, error` mentioning not found.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/paytm/status/
git commit -m "feat(payments): add Paytm status poll/reconcile endpoint"
```

---

## Task 6: Build AdmissionFeeNotice and AdmissionFeeStep components

**Files:**
- Create: `frontend/src/components/forms/AdmissionFeeNotice.tsx`
- Create: `frontend/src/components/forms/AdmissionFeeStep.tsx`

- [ ] **Step 1: Create AdmissionFeeNotice**

```tsx
export function AdmissionFeeNotice() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Admission Fee — ₹500 (Non-Refundable)</p>
      <p className="mt-1">
        A non-refundable admission fee of ₹500 is required to submit this application.
        If your admission is confirmed, this amount will be adjusted against your hostel fees.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create AdmissionFeeStep**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { AdmissionFeeNotice } from './AdmissionFeeNotice';

declare global {
  interface Window {
    Paytm?: any;
  }
}

interface Props {
  applicationId: string;
  onSuccess: () => void;
  onFailure: (reason: string) => void;
}

export function AdmissionFeeStep({ applicationId, onSuccess, onFailure }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Lazy-load Paytm Checkout JS based on env
    const env = process.env.NEXT_PUBLIC_PAYTM_ENV || 'staging';
    const mid = process.env.NEXT_PUBLIC_PAYTM_MID;
    if (!mid) return;
    const host = env === 'production' ? 'securegw.paytm.in' : 'securegw-stage.paytm.in';
    const src = `https://${host}/merchantpgpui/checkoutjs/merchants/${mid}.js`;
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    document.body.appendChild(s);
  }, []);

  async function pollStatus(orderId: string, attempts = 20): Promise<'SUCCESS' | 'FAILED' | 'PENDING'> {
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/payments/paytm/status/${orderId}`);
      const json = await res.json();
      const s = json?.data?.txnStatus;
      if (s === 'SUCCESS') return 'SUCCESS';
      if (s === 'FAILED') return 'FAILED';
    }
    return 'PENDING';
  }

  async function handlePay() {
    setBusy(true);
    setError(null);
    try {
      const initRes = await fetch('/api/payments/paytm/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      const initJson = await initRes.json();
      if (!initRes.ok || !initJson?.data?.txnToken) {
        throw new Error(initJson?.error || 'Failed to start payment');
      }
      const { orderId, txnToken, amount, mid } = initJson.data;

      if (!window.Paytm?.CheckoutJS) {
        throw new Error('Payment library still loading. Please retry in a moment.');
      }

      const config = {
        root: '',
        flow: 'DEFAULT',
        data: { orderId, token: txnToken, tokenType: 'TXN_TOKEN', amount: String(amount) },
        merchant: { mid, redirect: false },
        handler: {
          notifyMerchant: async (eventName: string) => {
            if (eventName === 'APP_CLOSED' || eventName === 'SESSION_EXPIRED') {
              const final = await pollStatus(orderId, 3);
              if (final === 'SUCCESS') onSuccess();
              else if (final === 'FAILED') onFailure('Payment was not completed');
              else onFailure('Payment cancelled');
              setBusy(false);
            }
          },
          transactionStatus: async () => {
            const final = await pollStatus(orderId, 20);
            if (final === 'SUCCESS') onSuccess();
            else if (final === 'FAILED') onFailure('Payment failed');
            else onFailure('Payment is still being processed. We will email you once confirmed.');
            setBusy(false);
          },
        },
      };

      window.Paytm.CheckoutJS.init(config).then(() => {
        window.Paytm.CheckoutJS.invoke();
      }).catch((e: any) => {
        throw new Error(e?.message || 'Checkout init failed');
      });
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
        {busy ? 'Processing…' : 'Pay ₹500 & Submit Application'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/forms/AdmissionFeeNotice.tsx frontend/src/components/forms/AdmissionFeeStep.tsx
git commit -m "feat(forms): add AdmissionFeeNotice and AdmissionFeeStep components"
```

---

## Task 7: Wire AdmissionFeeStep into Boys Hostel form (payment-gated submit)

**Files:**
- Modify: `frontend/src/app/apply/boys-hostel/form/page.tsx`

- [ ] **Step 1: Refactor handleSubmit so it returns the application id without redirecting**

In `frontend/src/app/apply/boys-hostel/form/page.tsx`, replace the body of `handleSubmit` with the version below. The key change: `status: 'SUBMITTED'` is removed (server will force DRAFT for hostel verticals); after document upload we render the payment step instead of the success page.

Locate the existing `handleSubmit` (starting around line 1193) and replace lines 1193 through the end of the function (look for the closing of the `try/catch` block and the final `};`). Replace with:

```ts
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null);
  const [pendingTrackingNumber, setPendingTrackingNumber] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleSubmit = async (data: any) => {
    try {
      const singleFileFields = [
        'photoFile', 'birthCertificate', 'casteCertificate',
        'photoWithParents', 'photoWithGuardian', 'recommendationLetter',
        'bonafideCertificate', 'caFirmLetter',
        'aadhaarOrVoterId', 'addressProof',
        'feeReceipt', 'registrationLetter', 'guardianAadhaar',
      ];
      const multiFileFields = ['marksheets'];
      const submissionData = { ...data };
      for (const fieldName of singleFileFields) {
        if (submissionData[fieldName] instanceof File) delete submissionData[fieldName];
      }
      for (const fieldName of multiFileFields) {
        if (Array.isArray(submissionData[fieldName])) delete submissionData[fieldName];
      }

      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...submissionData,
          applicant_mobile: data.applicantMobile || localStorage.getItem('otp_verified_mobile') || '',
          applicant_email: data.applicantEmail || localStorage.getItem('otp_verified_email') || '',
          vertical: 'boys-hostel',
          // status omitted: server forces DRAFT for hostel
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any));
        throw new Error(errorData.message || errorData.error || 'Failed to submit application');
      }
      const result = await response.json();
      const application = result.data || result;
      const applicationId = application.id;
      const trackingNumber = application.trackingNumber || application.tracking_number;

      // Upload docs (non-blocking failures)
      for (const fieldName of singleFileFields) {
        const file = data[fieldName];
        if (file instanceof File) {
          try { await uploadDocument(file, fieldName, applicationId); }
          catch (uploadError: any) { console.warn(`Upload ${fieldName} failed:`, uploadError); }
        }
      }
      for (const fieldName of multiFileFields) {
        const files = data[fieldName];
        if (Array.isArray(files)) {
          for (const file of files) {
            if (file instanceof File) {
              try { await uploadDocument(file, fieldName, applicationId); }
              catch (uploadError: any) { console.warn(`Upload ${fieldName} failed:`, uploadError); }
            }
          }
        }
      }

      localStorage.removeItem('application_draft_boys-hostel');
      setPendingApplicationId(applicationId);
      setPendingTrackingNumber(trackingNumber);
    } catch (e: any) {
      setPaymentError(e.message || 'Submission failed');
    }
  };
```

- [ ] **Step 2: Add the payment screen render**

At the top of the component file, add:

```tsx
import { AdmissionFeeStep } from '@/components/forms/AdmissionFeeStep';
import { useRouter } from 'next/navigation';
```

Inside the component, before the existing `return (...)`, add:

```tsx
  const router = useRouter();

  if (pendingApplicationId) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-2 text-2xl font-bold">Almost there</h1>
        <p className="mb-6 text-gray-700">
          Your application <span className="font-mono">{pendingTrackingNumber}</span> is saved.
          Complete the ₹500 admission fee payment to submit it for review.
        </p>
        <AdmissionFeeStep
          applicationId={pendingApplicationId}
          onSuccess={() => router.push(`/track/${pendingTrackingNumber}?paid=1`)}
          onFailure={(reason) => setPaymentError(reason)}
        />
        {paymentError && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {paymentError}
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 3: Manual smoke test (against Paytm staging)**

Set Paytm staging credentials in `.env.local`. Run `npm run dev`. Fill the Boys Hostel form, submit, observe:
- Application is created with `current_status='DRAFT'`.
- Payment screen appears.
- Pay ₹500 button opens Paytm staging overlay.
- Use Paytm test card → success → redirected to `/track/<trackingNumber>?paid=1`.
- DB shows `applications.current_status='SUBMITTED'`, `fees.status='PAID'`, `transactions.status='SUCCESS'`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/apply/boys-hostel/form/page.tsx
git commit -m "feat(apply): payment-gated submit for boys hostel"
```

---

## Task 8: Wire AdmissionFeeStep into Girls Ashram form

**Files:**
- Modify: `frontend/src/app/apply/girls-ashram/form/page.tsx`

- [ ] **Step 1: Apply the same changes as Task 7 to the Girls Ashram page**

Repeat the exact edits from Task 7 Steps 1 and 2, but in `frontend/src/app/apply/girls-ashram/form/page.tsx`. Replace `vertical: 'boys-hostel'` with `vertical: 'girls-ashram'` and `localStorage.removeItem('application_draft_boys-hostel')` with `localStorage.removeItem('application_draft_girls-ashram')`.

The full handleSubmit replacement (paste verbatim, only swapping the vertical and draft key):

```ts
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null);
  const [pendingTrackingNumber, setPendingTrackingNumber] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleSubmit = async (data: any) => {
    try {
      const singleFileFields = [
        'photoFile', 'birthCertificate', 'casteCertificate',
        'photoWithParents', 'photoWithGuardian', 'recommendationLetter',
        'bonafideCertificate', 'caFirmLetter',
        'aadhaarOrVoterId', 'addressProof',
        'feeReceipt', 'registrationLetter', 'guardianAadhaar',
      ];
      const multiFileFields = ['marksheets'];
      const submissionData = { ...data };
      for (const fieldName of singleFileFields) {
        if (submissionData[fieldName] instanceof File) delete submissionData[fieldName];
      }
      for (const fieldName of multiFileFields) {
        if (Array.isArray(submissionData[fieldName])) delete submissionData[fieldName];
      }
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...submissionData,
          applicant_mobile: data.applicantMobile || localStorage.getItem('otp_verified_mobile') || '',
          applicant_email: data.applicantEmail || localStorage.getItem('otp_verified_email') || '',
          vertical: 'girls-ashram',
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any));
        throw new Error(errorData.message || errorData.error || 'Failed to submit application');
      }
      const result = await response.json();
      const application = result.data || result;
      const applicationId = application.id;
      const trackingNumber = application.trackingNumber || application.tracking_number;
      for (const fieldName of singleFileFields) {
        const file = data[fieldName];
        if (file instanceof File) {
          try { await uploadDocument(file, fieldName, applicationId); }
          catch (e: any) { console.warn(`Upload ${fieldName} failed:`, e); }
        }
      }
      for (const fieldName of multiFileFields) {
        const files = data[fieldName];
        if (Array.isArray(files)) {
          for (const file of files) {
            if (file instanceof File) {
              try { await uploadDocument(file, fieldName, applicationId); }
              catch (e: any) { console.warn(`Upload ${fieldName} failed:`, e); }
            }
          }
        }
      }
      localStorage.removeItem('application_draft_girls-ashram');
      setPendingApplicationId(applicationId);
      setPendingTrackingNumber(trackingNumber);
    } catch (e: any) {
      setPaymentError(e.message || 'Submission failed');
    }
  };
```

And the payment screen render (paste verbatim above the existing `return`):

```tsx
import { AdmissionFeeStep } from '@/components/forms/AdmissionFeeStep';
import { useRouter } from 'next/navigation';

// ...inside component body, before the existing return:
  const router = useRouter();

  if (pendingApplicationId) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-2 text-2xl font-bold">Almost there</h1>
        <p className="mb-6 text-gray-700">
          Your application <span className="font-mono">{pendingTrackingNumber}</span> is saved.
          Complete the ₹500 admission fee payment to submit it for review.
        </p>
        <AdmissionFeeStep
          applicationId={pendingApplicationId}
          onSuccess={() => router.push(`/track/${pendingTrackingNumber}?paid=1`)}
          onFailure={(reason) => setPaymentError(reason)}
        />
        {paymentError && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {paymentError}
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 2: Manual smoke test girls-ashram flow**

Same procedure as Task 7 Step 3 against Paytm staging.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/apply/girls-ashram/form/page.tsx
git commit -m "feat(apply): payment-gated submit for girls ashram"
```

---

## Task 9: Adjust admission fee credit on approval

**Files:**
- Create: `frontend/src/lib/payments/admission-credit.ts`
- Modify: `frontend/src/app/api/applications/[id]/route.ts`

- [ ] **Step 1: Create helper**

```ts
import { query } from '@/lib/db';

/**
 * On approval, the paid ADMISSION_FEE for the application is converted into a
 * credit on the new resident's first hostel-fee row. Idempotent: if a credit
 * already exists for this application, do nothing.
 */
export async function adjustAdmissionFeeCredit(applicationId: string, studentId: string) {
  const { rows: feeRows } = await query(
    `SELECT id, amount FROM fees
     WHERE application_id = $1 AND fee_head = 'ADMISSION_FEE' AND status = 'PAID'
     LIMIT 1`,
    [applicationId],
  );
  if (!feeRows[0]) return;
  const admissionFee = feeRows[0];

  // Check idempotency: did we already attach this fee to the student?
  const existing = await query(
    `SELECT id FROM fees WHERE id = $1 AND student_id = $2`,
    [admissionFee.id, studentId],
  );
  if (existing.rows[0]) return;

  // Link the existing admission-fee row to the resident so it shows in their ledger.
  // The amount is already PAID; this row becomes their proof-of-credit.
  await query(
    `UPDATE fees SET student_id = $1, remarks = COALESCE(remarks, '') || ' [Adjusted on admission]'
     WHERE id = $2`,
    [studentId, admissionFee.id],
  );
}
```

- [ ] **Step 2: Hook into the approval handler**

Open `frontend/src/app/api/applications/[id]/route.ts`. Find the block where `current_status` transitions to `'APPROVED'` and `student_user_id` gets populated (look for the existing `if (updateData.<status> === 'APPROVED' && !application.student_user_id)` guard). Inside that block, after the user is created and `student_user_id` is set on the application, add:

```ts
import { adjustAdmissionFeeCredit } from '@/lib/payments/admission-credit';

// ...inside the APPROVED branch, after student user is created:
await adjustAdmissionFeeCredit(application.id, newStudentUserId);
```

(Replace `newStudentUserId` with the actual variable name used in that file for the newly created student user id. If multiple variable names are present, use the one that the existing code assigns to `applications.student_user_id`.)

- [ ] **Step 3: Manual verification**

1. Create a hostel application, pay through staging, get it to SUBMITTED.
2. Approve it as a Trustee in the dashboard.
3. Query: `SELECT id, student_id, application_id, fee_head, status FROM fees WHERE application_id='<id>';`
   Expected: the `ADMISSION_FEE` row now has `student_id` set to the newly created resident's user id.
4. Re-approve / re-trigger handler — should remain a single row (idempotent).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/payments/admission-credit.ts frontend/src/app/api/applications/[id]/route.ts
git commit -m "feat(payments): adjust admission fee credit on application approval"
```

---

## Task 10: Final type check and build

- [ ] **Step 1: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. If errors, fix inline.

- [ ] **Step 2: Run all tests**

```bash
cd frontend && npm run test:run
```

Expected: all tests pass (paytm util tests included).

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: post-build cleanup for paytm integration"
```

---

## Notes for the executor

- `audit_logs` table existence is assumed. If the schema does not have it, the `logAudit` helper in Task 4 will fail silently (wrapped in try/catch) — that is intentional.
- All staging tests require valid Paytm sandbox credentials. If the user has not provided them, stop and ask for `PAYTM_MID` and `PAYTM_MERCHANT_KEY` before Task 7's smoke test.
- The Dharamshala flow MUST remain unchanged. Do not touch `frontend/src/app/apply/dharamshala/form/page.tsx` or alter the Dharamshala branch in `/api/applications`.
