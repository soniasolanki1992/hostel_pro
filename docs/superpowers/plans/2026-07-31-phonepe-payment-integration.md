# PhonePe Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Razorpay admission-fee payment integration with PhonePe PG Checkout v2 (Standard Checkout, OAuth-based), preserving the same reliability guarantees (idempotency, webhook backstop, audit logging) and removing all Razorpay code.

**Architecture:** Server creates a PhonePe order via OAuth-authenticated REST calls and returns a `checkoutUrl`; the browser does a full-page redirect to PhonePe's hosted page; PhonePe redirects back to a new `/apply/payment-callback` page which calls a server-side verify route (PhonePe Order Status API) to finalize payment; a webhook route provides an S2S backstop. All work happens inside `frontend/`.

**Tech Stack:** Next.js API routes, PostgreSQL (`pg` via `frontend/src/lib/db.ts`), Vitest + Testing Library, no PhonePe SDK dependency (plain `fetch`, matching the existing Razorpay REST-only approach).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-phonepe-payment-integration-design.md` — every task below implements one part of it.
- Admission fee amount stays hardcoded at **₹500** (`ADMISSION_AMOUNT = 500`), hostel verticals only (`BOYS_HOSTEL`, `GIRLS_ASHRAM`).
- No DB schema changes — `transactions.transaction_ref` stores PhonePe's `merchantOrderId` (we generate it), `gateway_response` stores the raw PhonePe order/status JSON, exactly as it stored Razorpay's `order` object today.
- Env vars (fail-fast if missing, matching `getRazorpayConfig()`'s pattern): `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV` (`SANDBOX` | `PRODUCTION`), `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD`. Two optional overrides, `PHONEPE_AUTH_URL` and `PHONEPE_API_BASE_URL`, let ops correct the OAuth/PG base URLs without a code change if PhonePe's published endpoints differ from the defaults below.
- **PhonePe endpoint defaults used in code are best-effort from PhonePe's public PG Checkout v2 docs as of early 2026 and MUST be re-verified against the live PhonePe integration guide (or a support ticket) before the first real sandbox transaction** — this is exactly what the two override env vars exist for. Do not treat the hardcoded defaults as guaranteed-correct without that check.
- Test runner: `npm test` (vitest) from `frontend/`. Route tests use `@vitest-environment node` and mock `@/lib/db`, matching the existing `tests/payments/razorpay*.test.ts` files.
- All new/changed files live under `frontend/` (paths below are relative to `frontend/` unless stated otherwise).

---

### Task 1: PhonePe core library (`lib/payments/phonepe.ts`)

**Files:**
- Create: `src/lib/payments/phonepe.ts`
- Test: `src/lib/payments/phonepe.test.ts`

**Interfaces:**
- Produces (used by Tasks 2, 3, 4):
  - `getPhonePeConfig(): PhonePeConfig` where `PhonePeConfig = { clientId: string; clientSecret: string; clientVersion: string; env: 'SANDBOX' | 'PRODUCTION'; webhookUsername: string; webhookPassword: string }`
  - `generateMerchantOrderId(applicationId: string): string`
  - `createOrder(opts: { amount: number; merchantOrderId: string; redirectUrl: string }): Promise<{ orderId: string; checkoutUrl: string; state: string }>`
  - `checkOrderStatus(merchantOrderId: string): Promise<{ orderId: string; state: 'COMPLETED' | 'FAILED' | 'PENDING' | string; amount: number }>`
  - `verifyWebhookAuth(authorizationHeader: string | null): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/payments/phonepe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

vi.stubEnv('PHONEPE_CLIENT_ID', 'TEST_CLIENT_ID');
vi.stubEnv('PHONEPE_CLIENT_SECRET', 'TEST_CLIENT_SECRET');
vi.stubEnv('PHONEPE_CLIENT_VERSION', '1');
vi.stubEnv('PHONEPE_ENV', 'SANDBOX');
vi.stubEnv('PHONEPE_WEBHOOK_USERNAME', 'webhookuser');
vi.stubEnv('PHONEPE_WEBHOOK_PASSWORD', 'webhookpass');

import {
  getPhonePeConfig,
  generateMerchantOrderId,
  createOrder,
  checkOrderStatus,
  verifyWebhookAuth,
} from './phonepe';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('getPhonePeConfig', () => {
  it('reads config from env', () => {
    const cfg = getPhonePeConfig();
    expect(cfg.clientId).toBe('TEST_CLIENT_ID');
    expect(cfg.clientSecret).toBe('TEST_CLIENT_SECRET');
    expect(cfg.clientVersion).toBe('1');
    expect(cfg.env).toBe('SANDBOX');
  });

  it('throws when required vars are missing', () => {
    vi.stubEnv('PHONEPE_CLIENT_ID', '');
    expect(() => getPhonePeConfig()).toThrow(/PHONEPE_CLIENT_ID/);
    vi.stubEnv('PHONEPE_CLIENT_ID', 'TEST_CLIENT_ID');
  });
});

describe('generateMerchantOrderId', () => {
  it('produces a stable-prefixed, unique-looking id under 64 chars', () => {
    const id1 = generateMerchantOrderId('11111111-2222-3333-4444-555555555555');
    const id2 = generateMerchantOrderId('11111111-2222-3333-4444-555555555555');
    expect(id1).toMatch(/^ADM_/);
    expect(id1.length).toBeLessThanOrEqual(63);
    expect(id1).not.toBe(id2);
  });
});

describe('createOrder', () => {
  it('fetches an OAuth token then POSTs order creation with amount in paise', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'TOKEN123', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: 'OMO_TEST',
          state: 'PENDING',
          redirectUrl: 'https://mercury-t2.phonepe.com/transact/TEST',
        }),
      } as Response);

    const order = await createOrder({
      amount: 500,
      merchantOrderId: 'ADM_TEST_1',
      redirectUrl: 'http://localhost:3000/apply/payment-callback',
    });

    expect(order.orderId).toBe('OMO_TEST');
    expect(order.checkoutUrl).toBe('https://mercury-t2.phonepe.com/transact/TEST');

    const [authUrl, authInit] = fetchSpy.mock.calls[0];
    expect(String(authUrl)).toMatch(/oauth\/token/);
    expect((authInit?.headers as Record<string, string>)['Content-Type']).toMatch(/x-www-form-urlencoded/);

    const [orderUrl, orderInit] = fetchSpy.mock.calls[1];
    expect(String(orderUrl)).toMatch(/\/pay$/);
    expect((orderInit?.headers as Record<string, string>).Authorization).toBe('O-Bearer TOKEN123');
    const body = JSON.parse(orderInit?.body as string);
    expect(body.merchantOrderId).toBe('ADM_TEST_1');
    expect(body.amount).toBe(50000);
    expect(body.paymentFlow.merchantUrls.redirectUrl).toBe('http://localhost:3000/apply/payment-callback');
  });

  it('caches the OAuth token across two createOrder calls within its expiry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'CACHED_TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderId: 'O1', state: 'PENDING', redirectUrl: 'https://x/1' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderId: 'O2', state: 'PENDING', redirectUrl: 'https://x/2' }),
      } as Response);

    await createOrder({ amount: 500, merchantOrderId: 'A', redirectUrl: 'http://x' });
    await createOrder({ amount: 500, merchantOrderId: 'B', redirectUrl: 'http://x' });

    // 1 auth call + 2 order calls = 3 total (auth NOT repeated)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('throws when PhonePe returns an error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'invalid amount' }),
      } as Response);

    await expect(
      createOrder({ amount: 0, merchantOrderId: 'X', redirectUrl: 'http://x' }),
    ).rejects.toThrow(/invalid amount/);
  });
});

describe('checkOrderStatus', () => {
  it('fetches order status keyed by merchantOrderId', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderId: 'OMO_1', state: 'COMPLETED', amount: 50000 }),
      } as Response);

    const status = await checkOrderStatus('ADM_TEST_1');
    expect(status.state).toBe('COMPLETED');
    expect(status.amount).toBe(50000);
  });
});

describe('verifyWebhookAuth', () => {
  it('accepts the correct SHA-256(username:password) hex digest', () => {
    const expected = createHash('sha256').update('webhookuser:webhookpass').digest('hex');
    expect(verifyWebhookAuth(expected)).toBe(true);
  });

  it('rejects a wrong digest', () => {
    expect(verifyWebhookAuth('deadbeef')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyWebhookAuth(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/payments/phonepe.test.ts`
Expected: FAIL — `Cannot find module './phonepe'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/payments/phonepe.ts
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export interface PhonePeConfig {
  clientId: string;
  clientSecret: string;
  clientVersion: string;
  env: 'SANDBOX' | 'PRODUCTION';
  webhookUsername: string;
  webhookPassword: string;
}

const DEFAULT_URLS = {
  SANDBOX: {
    auth: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    api: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  PRODUCTION: {
    auth: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    api: 'https://api.phonepe.com/apis/pg',
  },
} as const;

export function getPhonePeConfig(): PhonePeConfig {
  const clientId = process.env.PHONEPE_CLIENT_ID || '';
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET || '';
  const clientVersion = process.env.PHONEPE_CLIENT_VERSION || '';
  const env = (process.env.PHONEPE_ENV || 'SANDBOX') as 'SANDBOX' | 'PRODUCTION';
  const webhookUsername = process.env.PHONEPE_WEBHOOK_USERNAME || '';
  const webhookPassword = process.env.PHONEPE_WEBHOOK_PASSWORD || '';
  if (!clientId || !clientSecret || !clientVersion) {
    throw new Error(
      'PhonePe env vars not configured: PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION required',
    );
  }
  return { clientId, clientSecret, clientVersion, env, webhookUsername, webhookPassword };
}

function authUrl(cfg: PhonePeConfig): string {
  return process.env.PHONEPE_AUTH_URL || DEFAULT_URLS[cfg.env].auth;
}

function apiBaseUrl(cfg: PhonePeConfig): string {
  return process.env.PHONEPE_API_BASE_URL || DEFAULT_URLS[cfg.env].api;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function generateMerchantOrderId(applicationId: string): string {
  const short = applicationId.replace(/-/g, '').slice(0, 12);
  const ts = Date.now().toString(36);
  const rand = randomBytes(3).toString('hex');
  return `ADM_${short}_${ts}_${rand}`.slice(0, 63);
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}
let cachedToken: CachedToken | null = null;

async function getAuthToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now) {
    return cachedToken.accessToken;
  }
  const cfg = getPhonePeConfig();
  const res = await fetch(authUrl(cfg), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_version: cfg.clientVersion,
      client_secret: cfg.clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok || !json?.access_token) {
    throw new Error(`PhonePe auth failed: ${json?.message || res.status}`);
  }
  cachedToken = {
    accessToken: json.access_token,
    expiresAtMs: Number(json.expires_at) * 1000,
  };
  return cachedToken.accessToken;
}

export interface PhonePeOrder {
  orderId: string;
  checkoutUrl: string;
  state: string;
}

export async function createOrder(opts: {
  amount: number; // rupees
  merchantOrderId: string;
  redirectUrl: string;
}): Promise<PhonePeOrder> {
  const cfg = getPhonePeConfig();
  const token = await getAuthToken();
  const res = await fetch(`${apiBaseUrl(cfg)}/checkout/v2/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
    },
    body: JSON.stringify({
      merchantOrderId: opts.merchantOrderId,
      amount: Math.round(opts.amount * 100), // paise
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl: opts.redirectUrl },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok || !json?.orderId) {
    throw new Error(`PhonePe createOrder failed: ${json?.message || res.status}`);
  }
  return { orderId: json.orderId, checkoutUrl: json.redirectUrl, state: json.state || 'PENDING' };
}

export interface PhonePeOrderStatus {
  orderId: string;
  state: 'COMPLETED' | 'FAILED' | 'PENDING' | string;
  amount: number;
}

export async function checkOrderStatus(merchantOrderId: string): Promise<PhonePeOrderStatus> {
  const cfg = getPhonePeConfig();
  const token = await getAuthToken();
  const res = await fetch(`${apiBaseUrl(cfg)}/checkout/v2/order/${merchantOrderId}/status`, {
    headers: { Authorization: `O-Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`PhonePe checkOrderStatus failed: ${json?.message || res.status}`);
  }
  return { orderId: json.orderId, state: json.state, amount: json.amount };
}

export function verifyWebhookAuth(authorizationHeader: string | null): boolean {
  if (!authorizationHeader) return false;
  const cfg = getPhonePeConfig();
  if (!cfg.webhookUsername || !cfg.webhookPassword) return false;
  const expected = createHash('sha256')
    .update(`${cfg.webhookUsername}:${cfg.webhookPassword}`)
    .digest('hex');
  return constantTimeEqualHex(expected, authorizationHeader);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/payments/phonepe.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/payments/phonepe.ts frontend/src/lib/payments/phonepe.test.ts
git commit -m "feat(payments): add PhonePe PG Checkout v2 core library"
```

---

### Task 2: `POST /api/payments/phonepe/initiate`

**Files:**
- Create: `src/app/api/payments/phonepe/initiate/route.ts`

**Interfaces:**
- Consumes: `getPhonePeConfig`, `generateMerchantOrderId`, `createOrder` from `@/lib/payments/phonepe` (Task 1); `query` from `@/lib/db`; `verifySignedSessionToken` from `@/lib/auth`; `successResponse`/`badRequestResponse`/`notFoundResponse`/`serverErrorResponse`/`unauthorizedResponse` from `@/lib/api/responses`.
- Produces: `POST` handler returning `{ checkoutUrl: string; merchantOrderId: string; internalTxnId: string }` on success — consumed by Task 6 (`AdmissionFeeStep`).

**Note:** This route has no dedicated automated test in this plan, matching the pre-existing Razorpay `initiate` route's coverage gap (see spec's Testing section) — verify it manually against a mocked/sandbox PhonePe response in Task 10's manual QA pass.

- [ ] **Step 1: Write the implementation**

```typescript
// src/app/api/payments/phonepe/initiate/route.ts
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
    let checkoutUrl: string;

    if (pendingTxn[0] && Date.now() - new Date(pendingTxn[0].created_at).getTime() < REUSE_WINDOW_MS) {
      merchantOrderId = pendingTxn[0].transaction_ref;
      internalTxnId = pendingTxn[0].id;
      const stored = pendingTxn[0].gateway_response;
      checkoutUrl = (typeof stored === 'string' ? JSON.parse(stored) : stored)?.order?.checkoutUrl;
    } else {
      if (pendingTxn[0]) {
        await query(
          `UPDATE transactions SET status='FAILED', payment_notes='Superseded by new order' WHERE id=$1`,
          [pendingTxn[0].id],
        );
      }
      merchantOrderId = generateMerchantOrderId(applicationId);
      const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
```

- [ ] **Step 2: Manual sanity check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors introduced by this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/payments/phonepe/initiate/route.ts
git commit -m "feat(payments): add PhonePe payment initiate route"
```

---

### Task 3: `POST /api/payments/phonepe/verify`

**Files:**
- Create: `src/app/api/payments/phonepe/verify/route.ts`
- Test: `tests/payments/phonepeVerifyRoute.test.ts`

**Interfaces:**
- Consumes: `checkOrderStatus` from `@/lib/payments/phonepe` (Task 1); `query`, `sendEmail`, `renderPaymentReceipt`, `logger` (unchanged from Razorpay verify).
- Produces: `POST` handler accepting `{ merchantOrderId: string }`, returning `{ status: 'SUCCESS' | 'FAILED' | 'PENDING'; idempotent?: boolean }` — consumed by Task 7 (`payment-callback` page).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/payments/phonepeVerifyRoute.test.ts
/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('PHONEPE_CLIENT_ID', 'TEST_CLIENT_ID');
vi.stubEnv('PHONEPE_CLIENT_SECRET', 'TEST_CLIENT_SECRET');
vi.stubEnv('PHONEPE_CLIENT_VERSION', '1');
vi.stubEnv('PHONEPE_ENV', 'SANDBOX');

const dbCalls: Array<{ sql: string; params?: any[] }> = [];

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/SELECT t\.id, t\.fee_id, t\.status, f\.application_id, f\.amount AS fee_amount/.test(sql)) {
      return {
        rows: [
          { id: 'txn-1', fee_id: 'fee-1', status: 'PENDING', application_id: 'app-1', fee_amount: '500' },
        ],
      };
    }
    if (/SELECT a\.applicant_email, a\.applicant_name, f\.fee_head/.test(sql)) {
      return {
        rows: [{ applicant_email: 'sonia@example.com', applicant_name: 'Sonia', fee_head: 'ADMISSION_FEE' }],
      };
    }
    return { rows: [] };
  }),
}));

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/email-templates/payment-receipt', () => ({
  renderPaymentReceipt: vi.fn().mockReturnValue({ subject: 's', html: 'h', text: 't' }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const checkOrderStatusMock = vi.fn();
vi.mock('@/lib/payments/phonepe', () => ({
  checkOrderStatus: (...args: any[]) => checkOrderStatusMock(...args),
}));

import { POST } from '@/app/api/payments/phonepe/verify/route';

function makeRequest(body: any) {
  return new Request('http://localhost/api/payments/phonepe/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  dbCalls.length = 0;
  checkOrderStatusMock.mockReset();
});

describe('POST /api/payments/phonepe/verify', () => {
  it('marks payment as done on COMPLETED: transactions.SUCCESS, fees.PAID, applications.SUBMITTED + payment_status=PAID', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_1', state: 'COMPLETED', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_OK' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { status: 'SUCCESS' } });

    const txnUpdate = dbCalls.find((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql));
    expect(txnUpdate, 'transactions table updated to SUCCESS').toBeTruthy();

    const feeUpdate = dbCalls.find((c) => /UPDATE fees[\s\S]*status='PAID'/.test(c.sql));
    expect(feeUpdate, 'fees row marked PAID').toBeTruthy();

    const appUpdate = dbCalls.find((c) => /UPDATE applications[\s\S]*payment_status\s*=\s*'PAID'/.test(c.sql));
    expect(appUpdate, "applications.payment_status set to 'PAID'").toBeTruthy();
    expect(appUpdate?.sql, 'flips DRAFT to SUBMITTED on first verify').toMatch(/'SUBMITTED'::application_status/);
    expect(appUpdate?.params).toEqual(['app-1']);
  });

  it('marks the transaction FAILED on a FAILED gateway state, without touching fees/applications', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_2', state: 'FAILED', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_BAD' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'FAILED' });

    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='FAILED'/.test(c.sql))).toBe(true);
    expect(dbCalls.some((c) => /UPDATE fees/.test(c.sql))).toBe(false);
    expect(dbCalls.some((c) => /UPDATE applications/.test(c.sql))).toBe(false);
  });

  it('returns PENDING without mutating anything when the gateway state is still pending', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_3', state: 'PENDING', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_PENDING' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'PENDING' });
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('rejects when COMPLETED amount does not match fee_amount', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_4', state: 'COMPLETED', amount: 1 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_AMT' }));
    expect(res.status).toBe(400);
    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql))).toBe(false);
  });

  it('is idempotent: re-verifying a SUCCESS transaction returns idempotent without calling PhonePe again', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', fee_id: 'fee-1', status: 'SUCCESS', application_id: 'app-1', fee_amount: '500' }] };
    });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_DUP' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'SUCCESS', idempotent: true });
    expect(checkOrderStatusMock).not.toHaveBeenCalled();
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('rejects when transaction is not found', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [] };
    });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_404' }));
    expect(res.status).toBe(404);
  });

  it('rejects when merchantOrderId is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/required/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/payments/phonepeVerifyRoute.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/payments/phonepe/verify/route'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/api/payments/phonepe/verify/route.ts
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
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
    if (txn.status === 'FAILED') {
      return successResponse({ status: 'FAILED', idempotent: true });
    }

    const orderStatus = await checkOrderStatus(merchantOrderId);

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

    // orderStatus.state === 'COMPLETED'
    if (Number(orderStatus.amount) !== ADMISSION_AMOUNT * 100 || Number(txn.fee_amount) !== ADMISSION_AMOUNT) {
      await logAudit(applicationId, 'PHONEPE_VERIFY_AMOUNT_MISMATCH', {
        merchantOrderId,
        gotAmountPaise: orderStatus.amount,
        expected: txn.fee_amount,
      });
      return badRequestResponse('Amount mismatch');
    }

    await query('BEGIN');
    try {
      await query(
        `UPDATE transactions SET status='SUCCESS', gateway_response=$2, payment_notes=$3 WHERE id=$1`,
        [txn.id, JSON.stringify(orderStatus), `PhonePe order ${merchantOrderId}`],
      );
      await query(
        `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE' WHERE id=$1`,
        [txn.fee_id],
      );
      await query(
        `UPDATE applications
            SET current_status = CASE WHEN current_status = 'DRAFT' THEN 'SUBMITTED'::application_status ELSE current_status END,
                submitted_at = COALESCE(submitted_at, NOW()),
                payment_status = 'PAID'
          WHERE id = $1`,
        [applicationId],
      );
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }

    await logAudit(applicationId, 'PHONEPE_VERIFY_SUCCESS', { merchantOrderId });

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/payments/phonepeVerifyRoute.test.ts`
Expected: PASS (all 7 cases)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/payments/phonepe/verify/route.ts frontend/tests/payments/phonepeVerifyRoute.test.ts
git commit -m "feat(payments): add PhonePe payment verify route"
```

---

### Task 4: `POST /api/payments/phonepe/webhook`

**Files:**
- Create: `src/app/api/payments/phonepe/webhook/route.ts`
- Test: `tests/payments/phonepeWebhookRoute.test.ts`

**Interfaces:**
- Consumes: `verifyWebhookAuth` from `@/lib/payments/phonepe` (Task 1).
- Produces: `POST` handler for PhonePe's S2S callback — same finalize logic as Task 3's verify route, triggered independently.

**Note:** webhook payload field names (`event`, `payload.state`, `payload.merchantOrderId`, `payload.amount`) are this plan's best-effort mapping of PhonePe's PG Checkout v2 webhook shape — confirm against a captured real webhook delivery during Task 10's manual QA and adjust field paths if PhonePe's actual payload differs.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/payments/phonepeWebhookRoute.test.ts
/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

vi.stubEnv('PHONEPE_CLIENT_ID', 'TEST_CLIENT_ID');
vi.stubEnv('PHONEPE_CLIENT_SECRET', 'TEST_CLIENT_SECRET');
vi.stubEnv('PHONEPE_CLIENT_VERSION', '1');
vi.stubEnv('PHONEPE_ENV', 'SANDBOX');
vi.stubEnv('PHONEPE_WEBHOOK_USERNAME', 'webhookuser');
vi.stubEnv('PHONEPE_WEBHOOK_PASSWORD', 'webhookpass');

const dbCalls: Array<{ sql: string; params?: any[] }> = [];

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/SELECT t\.id, t\.status, t\.fee_id, f\.application_id, f\.amount AS fee_amount/.test(sql)) {
      return {
        rows: [{ id: 'txn-1', status: 'PENDING', fee_id: 'fee-1', application_id: 'app-1', fee_amount: '500' }],
      };
    }
    return { rows: [] };
  }),
}));

import { POST } from '@/app/api/payments/phonepe/webhook/route';

function validAuthHeader() {
  return createHash('sha256').update('webhookuser:webhookpass').digest('hex');
}

function makeWebhookRequest(payload: any, authHeader = validAuthHeader()) {
  const body = JSON.stringify(payload);
  return new Request('http://localhost/api/payments/phonepe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body,
  }) as any;
}

function eventPayload(state: string, merchantOrderId: string, orderId: string, amountPaise = 50000) {
  return { event: 'checkout.order.completed', payload: { merchantOrderId, orderId, state, amount: amountPaise } };
}

beforeEach(() => {
  dbCalls.length = 0;
});

describe('POST /api/payments/phonepe/webhook', () => {
  it('on COMPLETED: marks txn SUCCESS, fee PAID, app SUBMITTED + payment_status=PAID', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_OK', 'OMO_OK')));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql))).toBe(true);
    expect(dbCalls.some((c) => /UPDATE fees[\s\S]*status='PAID'/.test(c.sql))).toBe(true);
    const appUpdate = dbCalls.find((c) => /UPDATE applications[\s\S]*payment_status\s*=\s*'PAID'/.test(c.sql));
    expect(appUpdate?.params).toEqual(['app-1']);
  });

  it('rejects when the Authorization header is invalid', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_X', 'OMO_X'), 'deadbeef'));
    expect(res.status).toBe(400);
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('idempotent on duplicate webhook (txn already SUCCESS): no further mutations', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', status: 'SUCCESS', fee_id: 'fee-1', application_id: 'app-1', fee_amount: '500' }] };
    });

    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_DUP', 'OMO_DUP')));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.idempotent).toBe(true);
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('on FAILED: marks txn FAILED, leaves fees and applications untouched', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('FAILED', 'ADM_F', 'OMO_F')));
    expect(res.status).toBe(200);

    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='FAILED'/.test(c.sql))).toBe(true);
    expect(dbCalls.some((c) => /UPDATE fees/.test(c.sql))).toBe(false);
    expect(dbCalls.some((c) => /UPDATE applications/.test(c.sql))).toBe(false);
  });

  it('rejects when COMPLETED amount does not match fee_amount', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_AMT', 'OMO_AMT', 1)));
    expect(res.status).toBe(400);
    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/payments/phonepeWebhookRoute.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/payments/phonepe/webhook/route'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/api/payments/phonepe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
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

    if (txn.status === 'SUCCESS' || txn.status === 'FAILED') {
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
      await query('BEGIN');
      try {
        await query(
          `UPDATE transactions SET status='SUCCESS', gateway_response=$2, payment_notes=$3 WHERE id=$1`,
          [txn.id, JSON.stringify(event), `PhonePe webhook ${orderId}`],
        );
        await query(
          `UPDATE fees SET status='PAID', paid_amount=amount, paid_at=NOW(), payment_method='ONLINE' WHERE id=$1`,
          [txn.fee_id],
        );
        await query(
          `UPDATE applications
              SET current_status = CASE WHEN current_status = 'DRAFT' THEN 'SUBMITTED'::application_status ELSE current_status END,
                  submitted_at = COALESCE(submitted_at, NOW()),
                  payment_status = 'PAID'
            WHERE id = $1`,
          [applicationId],
        );
        await query('COMMIT');
      } catch (e) {
        await query('ROLLBACK');
        throw e;
      }
      await logAudit(applicationId, 'PHONEPE_WEBHOOK_SUCCESS', { merchantOrderId, orderId });
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/payments/phonepeWebhookRoute.test.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/payments/phonepe/webhook/route.ts frontend/tests/payments/phonepeWebhookRoute.test.ts
git commit -m "feat(payments): add PhonePe webhook route"
```

---

### Task 5: `phonepeClient.ts` + simplify `AdmissionFeeStep`

**Files:**
- Create: `src/lib/payments/phonepeClient.ts`
- Modify: `src/components/forms/AdmissionFeeStep.tsx` (full rewrite)
- Modify: `tests/payments/AdmissionFeeStep.test.tsx` (full rewrite)

**Interfaces:**
- Produces: `redirectToCheckout(checkoutUrl: string): void` in `phonepeClient.ts`.
- `AdmissionFeeStep` new prop contract: `{ applicationId: string }` only — `onSuccess`/`onFailure` are removed (outcome is now only known after the PhonePe redirect round-trip, owned by Task 7's callback page).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/payments/AdmissionFeeStep.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/payments/phonepeClient', () => ({
  redirectToCheckout: vi.fn(),
}));

import { AdmissionFeeStep } from '@/components/forms/AdmissionFeeStep';
import * as phonepeClient from '@/lib/payments/phonepeClient';

describe('AdmissionFeeStep', () => {
  beforeEach(() => {
    vi.mocked(phonepeClient.redirectToCheckout).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders the AdmissionFeeNotice and a submit button', () => {
    render(<AdmissionFeeStep applicationId="app-1" />);
    expect(screen.getByText(/Admission Fee — ₹500 \(Non-Refundable\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay ₹500 & Submit Application/i })).toBeInTheDocument();
  });

  it('calls initiate then redirects the browser to the returned checkoutUrl', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { checkoutUrl: 'https://mercury-t2.phonepe.com/transact/TEST', merchantOrderId: 'ADM_TEST', internalTxnId: 'txn-1' },
      }),
    } as Response);

    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue('session-token-abc') },
      writable: true,
    });

    render(<AdmissionFeeStep applicationId="app-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(phonepeClient.redirectToCheckout).toHaveBeenCalledWith('https://mercury-t2.phonepe.com/transact/TEST'));
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/payments/phonepe/initiate');
    const initBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(initBody).toMatchObject({ applicationId: 'app-1', sessionToken: 'session-token-abc' });
  });

  it('shows an inline error when the initiate endpoint fails, without redirecting', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Application not in DRAFT' }),
    } as Response);
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue('session-token-abc') },
      writable: true,
    });

    render(<AdmissionFeeStep applicationId="app-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/Application not in DRAFT/i)).toBeInTheDocument());
    expect(phonepeClient.redirectToCheckout).not.toHaveBeenCalled();
  });

  it('shows a session-expired error when there is no stored session token', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue(null) },
      writable: true,
    });

    render(<AdmissionFeeStep applicationId="app-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/Session expired/i)).toBeInTheDocument());
    expect(phonepeClient.redirectToCheckout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/payments/AdmissionFeeStep.test.tsx`
Expected: FAIL — old test file still imports `razorpayClient`/old props; new assertions don't match current component.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/payments/phonepeClient.ts
export function redirectToCheckout(checkoutUrl: string): void {
  if (typeof window === 'undefined') return;
  window.location.href = checkoutUrl;
}
```

```typescript
// src/components/forms/AdmissionFeeStep.tsx
'use client';
import { useState } from 'react';
import { AdmissionFeeNotice } from './AdmissionFeeNotice';
import { Button } from '@/components/shadcn/button-extended';
import { redirectToCheckout } from '@/lib/payments/phonepeClient';

interface Props {
  applicationId: string;
}

export function AdmissionFeeStep({ applicationId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setBusy(true);
    setError(null);
    try {
      const sessionToken =
        typeof window !== 'undefined' ? localStorage.getItem('applicant_session_token') : null;
      if (!sessionToken) {
        throw new Error('Session expired. Please re-verify your mobile number.');
      }
      const initRes = await fetch('/api/payments/phonepe/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, sessionToken }),
      });
      const initJson = await initRes.json();
      if (!initRes.ok || !initJson?.data?.checkoutUrl) {
        throw new Error(initJson?.error || 'Failed to start payment');
      }
      redirectToCheckout(initJson.data.checkoutUrl);
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
      <Button
        type="button"
        variant="primary"
        onClick={handlePay}
        disabled={busy}
        loading={busy}
        className="w-full"
      >
        Pay ₹500 & Submit Application
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/payments/AdmissionFeeStep.test.tsx`
Expected: PASS (all 4 cases)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/payments/phonepeClient.ts frontend/src/components/forms/AdmissionFeeStep.tsx frontend/tests/payments/AdmissionFeeStep.test.tsx
git commit -m "feat(payments): switch AdmissionFeeStep to PhonePe redirect flow"
```

---

### Task 6: `/apply/payment-callback` resume page

**Files:**
- Create: `src/app/apply/payment-callback/page.tsx`
- Test: `tests/payments/PaymentCallbackPage.test.tsx`

**Interfaces:**
- Consumes: query params `applicationId`, `merchantOrderId`, `trackingNumber`, `vertical` (all set by Task 2's `initiate` route via the `redirectUrl` it hands to PhonePe); calls `POST /api/payments/phonepe/verify` (Task 3) with `{ merchantOrderId }`, expects `{ status: 'SUCCESS' | 'FAILED' | 'PENDING' }`.
- Produces: on `SUCCESS` navigates to `/track/{trackingNumber}?paid=1` (same URL `AdmissionFeeStep`'s old `onSuccess` used to hit); on `FAILED` shows a retry link to `/apply/{vertical}/form?appId={applicationId}&tracking={trackingNumber}` (the existing resume-draft mechanism, confirmed at `src/app/apply/boys-hostel/form/page.tsx:33-34`); on `PENDING` shows a "still processing" message with a plain link to `/track/{trackingNumber}` (no `?paid=1`, since payment isn't confirmed yet).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/payments/PaymentCallbackPage.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const searchParamsMap: Record<string, string> = {
  applicationId: 'app-1',
  merchantOrderId: 'ADM_TEST',
  trackingNumber: 'TRK123',
  vertical: 'boys-hostel',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: (key: string) => searchParamsMap[key] ?? null }),
}));

import PaymentCallbackPage from '@/app/apply/payment-callback/page';

beforeEach(() => {
  pushMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaymentCallbackPage', () => {
  it('on SUCCESS, redirects to /track/{trackingNumber}?paid=1', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'SUCCESS' } }),
    } as Response);

    render(<PaymentCallbackPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/track/TRK123?paid=1'));
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('/api/payments/phonepe/verify');
    expect(JSON.parse(init.body)).toEqual({ merchantOrderId: 'ADM_TEST' });
  });

  it('on FAILED, shows a retry link back to the draft resume URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'FAILED' } }),
    } as Response);

    render(<PaymentCallbackPage />);

    await waitFor(() => expect(screen.getByText(/payment (failed|was not completed)/i)).toBeInTheDocument());
    const retryLink = screen.getByRole('link', { name: /try again/i }) as HTMLAnchorElement;
    expect(retryLink.getAttribute('href')).toBe('/apply/boys-hostel/form?appId=app-1&tracking=TRK123');
  });

  it('on PENDING, shows a processing message with a plain track link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'PENDING' } }),
    } as Response);

    render(<PaymentCallbackPage />);

    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeInTheDocument());
    const trackLink = screen.getByRole('link', { name: /track/i }) as HTMLAnchorElement;
    expect(trackLink.getAttribute('href')).toBe('/track/TRK123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/payments/PaymentCallbackPage.test.tsx`
Expected: FAIL — `Cannot find module '@/app/apply/payment-callback/page'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/apply/payment-callback/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Outcome = 'CHECKING' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'ERROR';

export default function PaymentCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>('CHECKING');

  const applicationId = searchParams.get('applicationId') || '';
  const merchantOrderId = searchParams.get('merchantOrderId') || '';
  const trackingNumber = searchParams.get('trackingNumber') || '';
  const vertical = searchParams.get('vertical') || 'boys-hostel';

  useEffect(() => {
    if (!merchantOrderId) {
      setOutcome('ERROR');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payments/phonepe/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchantOrderId }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setOutcome('ERROR');
          return;
        }
        const status = json?.data?.status;
        if (status === 'SUCCESS') {
          router.push(`/track/${trackingNumber}?paid=1`);
        } else if (status === 'FAILED') {
          setOutcome('FAILED');
        } else {
          setOutcome('PENDING');
        }
      } catch {
        if (!cancelled) setOutcome('ERROR');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantOrderId]);

  if (outcome === 'CHECKING') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-gray-600">Confirming your payment…</p>
      </div>
    );
  }

  if (outcome === 'FAILED') {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 text-center">
        <p className="text-red-700">Your payment failed or was not completed.</p>
        <Link
          href={`/apply/${vertical}/form?appId=${applicationId}&tracking=${trackingNumber}`}
          className="text-blue-600 underline"
        >
          Try again
        </Link>
      </div>
    );
  }

  if (outcome === 'PENDING') {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 text-center">
        <p>Your payment is still processing. Please check back shortly.</p>
        <Link href={`/track/${trackingNumber}`} className="text-blue-600 underline">
          Track your application
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <p className="text-red-700">
        We could not confirm your payment status. Please check your application status on the tracking page.
      </p>
      <Link href={`/track/${trackingNumber}`} className="text-blue-600 underline">
        Track your application
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/payments/PaymentCallbackPage.test.tsx`
Expected: PASS (all 3 cases)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/apply/payment-callback/page.tsx frontend/tests/payments/PaymentCallbackPage.test.tsx
git commit -m "feat(payments): add PhonePe payment-callback resume page"
```

---

### Task 7: Wire form pages to the simplified `AdmissionFeeStep`

**Files:**
- Modify: `src/app/apply/boys-hostel/form/page.tsx` (around lines 1390-1394, and remove now-dead `paymentError` state/JSX)
- Modify: `src/app/apply/girls-ashram/form/page.tsx` (around lines 1363-1367, same change)

**Interfaces:**
- Consumes: `AdmissionFeeStep` new prop contract `{ applicationId: string }` from Task 5.

- [ ] **Step 1: Update `boys-hostel/form/page.tsx`**

Replace:
```tsx
                  <AdmissionFeeStep
                    applicationId={pendingApplicationId}
                    onSuccess={() => router.push(`/track/${pendingTrackingNumber}?paid=1`)}
                    onFailure={(reason) => setPaymentError(reason)}
                  />

                  {paymentError && (
                    <div
                      className="mt-4 p-4 rounded-lg border-l-4"
                      style={{
                        backgroundColor: 'var(--color-red-50, #fef2f2)',
                        borderLeftColor: 'var(--color-red-500, #ef4444)',
                      }}
                    >
                      <p className="text-sm font-medium" style={{ color: 'var(--color-red-700, #b91c1c)' }}>
                        {paymentError}
                      </p>
                    </div>
                  )}
```
with:
```tsx
                  <AdmissionFeeStep applicationId={pendingApplicationId} />
```

(No cast needed — this JSX sits inside the same `if (pendingApplicationId) { ... }` block already present in the file, so TypeScript already narrows `pendingApplicationId` to `string` here, exactly as it did for the original Razorpay-era prop.)

Also remove the now-unused `const [paymentError, setPaymentError] = useState<string | null>(null);` declaration (line 30) — check first whether `setPaymentError`/`paymentError` are referenced anywhere else in the file (e.g. the draft-submission catch block at the `e.message` reference near line 1327); if the submission-failure path also uses `paymentError` for its own error display, keep the state and only remove the `onFailure` wiring above, renaming nothing.

- [ ] **Step 2: Check for other `paymentError` usages before deleting state**

Run: `rg -n "paymentError" frontend/src/app/apply/boys-hostel/form/page.tsx`
If any usage remains outside the block just edited, keep the `paymentError` state declaration; only remove it if the block edited in Step 1 was its sole use.

- [ ] **Step 3: Repeat Steps 1-2 for `girls-ashram/form/page.tsx`**

Same replacement at the `<AdmissionFeeStep ... />` block found around line 1363.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — no test directly covers these two page files' JSX today (confirmed: no `AdmissionFeeStep` mock/import in any test file under `tests/` other than `AdmissionFeeStep.test.tsx`), so this is a manual/type-check verification, not a red-green cycle.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (confirms the narrowed `pendingApplicationId` and removed props compile cleanly).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/apply/boys-hostel/form/page.tsx frontend/src/app/apply/girls-ashram/form/page.tsx
git commit -m "refactor(apply): update form pages for simplified AdmissionFeeStep props"
```

---

### Task 8: Remove Razorpay — code, tests, comments, env

**Files:**
- Delete: `src/lib/payments/razorpay.ts`
- Delete: `src/lib/payments/razorpay.test.ts`
- Delete: `src/lib/payments/razorpayClient.ts`
- Delete: `src/app/api/payments/razorpay/initiate/route.ts`
- Delete: `src/app/api/payments/razorpay/verify/route.ts`
- Delete: `src/app/api/payments/razorpay/webhook/route.ts`
- Delete: `src/app/api/payments/razorpay/status/[orderId]/route.ts`
- Delete: `tests/payments/razorpayVerifyRoute.test.ts`
- Delete: `tests/payments/razorpayWebhookRoute.test.ts`
- Modify: `src/app/api/applications/route.ts` (comments only, lines ~237 and ~263)
- Modify: `.env.example`
- Modify: `.env.local` (remove real Razorpay test keys; do not commit this file — confirm it stays gitignored)

- [ ] **Step 1: Delete the Razorpay library, client, and route files**

```bash
cd frontend
git rm src/lib/payments/razorpay.ts src/lib/payments/razorpay.test.ts src/lib/payments/razorpayClient.ts
git rm -r src/app/api/payments/razorpay
git rm tests/payments/razorpayVerifyRoute.test.ts tests/payments/razorpayWebhookRoute.test.ts
```

- [ ] **Step 2: Update stray comments in `applications/route.ts`**

Replace:
```ts
    // Hostel verticals: force DRAFT — only the Razorpay verify route flips to SUBMITTED.
```
with:
```ts
    // Hostel verticals: force DRAFT — only the PhonePe verify route flips to SUBMITTED.
```

Replace:
```ts
    // For hostel verticals, create the ADMISSION_FEE row that the Razorpay flow will pay.
```
with:
```ts
    // For hostel verticals, create the ADMISSION_FEE row that the PhonePe flow will pay.
```

- [ ] **Step 3: Replace the stale Paytm block in `.env.example` with PhonePe vars**

Replace:
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
with:
```
# PhonePe Payment Gateway (PG Checkout v2 — Standard Checkout)
PHONEPE_CLIENT_ID=
PHONEPE_CLIENT_SECRET=
PHONEPE_CLIENT_VERSION=1
PHONEPE_ENV=SANDBOX
# Configure these same values as the webhook's Basic Auth in the PhonePe dashboard
PHONEPE_WEBHOOK_USERNAME=
PHONEPE_WEBHOOK_PASSWORD=
# Optional overrides if PhonePe's published endpoints differ from this codebase's defaults
PHONEPE_AUTH_URL=
PHONEPE_API_BASE_URL=
```

- [ ] **Step 4: Clean up `.env.local`**

Remove these three lines (real Razorpay sandbox keys — must not remain now that the code path is gone):
```
RAZORPAY_KEY_ID=rzp_test_Sjc9aIlyj4y9bg
RAZORPAY_KEY_SECRET=i8BegnffUqIwEnwLODbQGOqj
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_Sjc9aIlyj4y9bg
```
Add placeholder PhonePe entries in their place (blank — no real credentials exist yet):
```
PHONEPE_CLIENT_ID=
PHONEPE_CLIENT_SECRET=
PHONEPE_CLIENT_VERSION=1
PHONEPE_ENV=SANDBOX
PHONEPE_WEBHOOK_USERNAME=
PHONEPE_WEBHOOK_PASSWORD=
```
Confirm `.env.local` is listed in `.gitignore` before proceeding (run `git check-ignore frontend/.env.local`); if it is not ignored, stop and flag this to the user rather than committing it.

- [ ] **Step 5: Grep for any remaining Razorpay references**

Run: `rg -il razorpay frontend/src frontend/tests`
Expected: no output (empty).

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — no Razorpay test files remain, all PhonePe tests from Tasks 1, 3, 4, 5, 6 pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/applications/route.ts frontend/.env.example
git commit -m "chore(payments): remove Razorpay integration, replace with PhonePe"
```

(`.env.local` changes are local-only and gitignored — do not `git add` that file.)

---

### Task 9: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — all suites green, including `phonepe.test.ts`, `phonepeVerifyRoute.test.ts`, `phonepeWebhookRoute.test.ts`, `AdmissionFeeStep.test.tsx`, `PaymentCallbackPage.test.tsx`, plus every pre-existing suite unaffected by this change.

- [ ] **Step 2: Type-check the whole project**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds (this also catches any remaining `.next` cache issues or unresolved imports left over from the Razorpay deletion).

- [ ] **Step 4: Confirm no Razorpay references remain anywhere in source**

Run: `rg -il razorpay frontend/src frontend/tests frontend/.env.example`
Expected: no output.

- [ ] **Step 5: Manual QA checklist (requires real PhonePe sandbox credentials — perform once available, not blocking this plan's completion)**

- Fill in real `PHONEPE_CLIENT_ID` / `PHONEPE_CLIENT_SECRET` / `PHONEPE_CLIENT_VERSION` in `.env.local`.
- Submit a boys-hostel application through to the admission-fee step, click Pay, confirm redirect to a real PhonePe sandbox checkout page.
- Complete a test payment, confirm redirect back to `/apply/payment-callback`, confirm it lands on `/track/{tracking}?paid=1`.
- Verify `transactions`/`fees`/`applications` rows flipped correctly in the DB.
- Register the webhook URL in the PhonePe dashboard, replay/trigger a webhook delivery, confirm the payload field names in Task 4's code match the real delivery (adjust `payload.merchantOrderId`/`payload.state`/`payload.amount` paths if PhonePe's actual shape differs).
- Confirm the receipt email is sent on success.

- [ ] **Step 6: Final commit (if any fixups were needed in Steps 1-4)**

```bash
git add -A
git commit -m "fix(payments): address final verification findings for PhonePe integration"
```

(Skip this step if Steps 1-4 were already clean — do not create an empty commit.)
