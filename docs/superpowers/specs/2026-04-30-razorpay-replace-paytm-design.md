# Replace Paytm with Razorpay — Design

**Date:** 2026-04-30
**Status:** Approved (pending user spec review)
**Supersedes:** `docs/superpowers/specs/2026-04-28-paytm-admission-fee-design.md` (Paytm integration)

## Goal

Remove the existing Paytm payment integration and replace it with Razorpay Standard Checkout. Single active provider — no runtime switch. Test mode keys are provided up front; webhook safety net is included.

## Provider Mode

Razorpay **Standard Checkout** (hosted modal popup loaded via `https://checkout.razorpay.com/v1/checkout.js`). Razorpay renders the payment UI; we create the order server-side, verify the signature server-side, and use a webhook as an async safety net.

## Files to Delete

- `frontend/src/lib/payments/paytm.ts`
- `frontend/src/lib/payments/paytm.test.ts`
- `frontend/src/lib/payments/paytmchecksum.d.ts`
- `frontend/src/app/api/payments/paytm/initiate/route.ts`
- `frontend/src/app/api/payments/paytm/callback/route.ts`
- `frontend/src/app/api/payments/paytm/status/[orderId]/route.ts`
- `frontend/src/app/api/payments/paytm/dev-bypass/route.ts`
- (Also remove the now-empty `frontend/src/app/api/payments/paytm/` directory.)

Remove `paytmchecksum` from `frontend/package.json`.

## Files to Add

### Server-side library
- `frontend/src/lib/payments/razorpay.ts`
  - `getRazorpayConfig()` — reads env, throws if missing.
  - `createOrder({ amount, currency, receipt, notes })` — calls Razorpay Orders API (`POST /v1/orders`) using Basic auth (`key_id:key_secret`). Returns `{ id, amount, currency, status, receipt }`.
  - `verifyPaymentSignature({ orderId, paymentId, signature })` — HMAC-SHA256 of `${orderId}|${paymentId}` using `key_secret`; constant-time compare with provided signature.
  - `verifyWebhookSignature(rawBody, signatureHeader)` — HMAC-SHA256 of raw request body using `RAZORPAY_WEBHOOK_SECRET`.
  - `fetchPayment(paymentId)` — `GET /v1/payments/{id}` for server-side status checks.

### Client-side helper
- `frontend/src/lib/payments/razorpayClient.ts`
  - `loadCheckoutScript()` — idempotent `<script>` injection of `https://checkout.razorpay.com/v1/checkout.js`.
  - `openCheckout(options)` — instantiates `new window.Razorpay(options)`, attaches `handler` (success), `modal.ondismiss` (cancel), and `payment.failed` listener; returns a Promise that resolves on success/cancel/failure.

### API routes
- `frontend/src/app/api/payments/razorpay/initiate/route.ts` — POST. Accepts `{ feeId, amount, applicationId? }`. Server creates a `transactions` row with `status=PENDING`, then calls `razorpay.createOrder()`, stores `order.id` in `transaction_ref`, returns `{ orderId, keyId, amount, currency, name, description, prefill: { name, email, contact }, internalTxnId }`.
- `frontend/src/app/api/payments/razorpay/verify/route.ts` — POST. Accepts `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, internalTxnId }`. Verifies signature, updates the `transactions` row to `SUCCESS` (or `FAILED` if signature invalid), stores payment id + raw response in `gateway_response`, returns `{ ok, status }`. Idempotent — if already SUCCESS, returns existing state.
- `frontend/src/app/api/payments/razorpay/status/[orderId]/route.ts` — GET. Server-side lookup: read `transactions` row by `transaction_ref`, optionally cross-check with `razorpay.fetchPayment` if SUCCESS not yet recorded but a payment id exists. Returns same `{ status, ... }` shape `AdmissionFeeStep` currently consumes from the Paytm status endpoint.
- `frontend/src/app/api/payments/razorpay/webhook/route.ts` — POST. Reads raw body (NOT JSON-parsed first), verifies `x-razorpay-signature` header via `verifyWebhookSignature`, then handles `payment.captured` and `payment.failed` events idempotently (no-op if `transactions` row already in terminal state). Logs and returns 200 even on duplicate to avoid Razorpay retries.
- `frontend/src/app/api/payments/razorpay/dev-bypass/route.ts` — POST. Local-dev only (gated on `NODE_ENV !== 'production'`). Creates a synthetic SUCCESS transaction without contacting Razorpay. Mirrors the existing Paytm dev-bypass behavior used by `AdmissionFeeStep`.

## Files to Modify

- `frontend/src/components/forms/AdmissionFeeStep.tsx`
  - Replace the three `/api/payments/paytm/*` URLs with their `razorpay` equivalents.
  - Replace the `window.Paytm.CheckoutJS` invocation with `razorpayClient.openCheckout(...)`.
  - On checkout success, call `/api/payments/razorpay/verify` with the signature payload before advancing the form. Existing status-polling logic (used as a fallback) keeps working against the new status endpoint.
- `frontend/src/app/api/applications/route.ts`
  - Update the two Paytm-naming comments at lines ~231 and ~257 to refer to Razorpay. No logic change.
- `frontend/tests/payments/AdmissionFeeStep.test.tsx`
  - Replace `paytm` URL assertions with `razorpay` ones.
  - Replace the `window.Paytm` mock with a mock for `razorpayClient.openCheckout` (jest mock the module).
  - Add a verify-call assertion: on successful checkout, the verify endpoint is hit with the signature payload.
- `frontend/package.json` / `frontend/package-lock.json`
  - Remove `paytmchecksum` dependency.
  - No new dependency required — Razorpay Standard Checkout uses the hosted JS; signature/webhook verification uses Node's built-in `crypto`. (We are intentionally not adding the `razorpay` npm SDK; calling the Orders REST API directly with `fetch` keeps the surface area small.)

User-facing copy in `frontend/src/components/fees/PaymentFlowModal.tsx` and `frontend/src/components/renewal/FeeTopupStep.tsx` mentions "Paytm" only as an example UPI app name alongside GPay/PhonePe — not a code dependency. Leave as-is.

## Database

The existing `transactions` table already uses generic columns (`transaction_ref`, `gateway_response JSONB`). **No migration required.** Razorpay's `order_id` goes into `transaction_ref`; the full payment object goes into `gateway_response`.

## Environment Variables

Add to `frontend/.env.local`:

```
RAZORPAY_KEY_ID=rzp_test_Sjc9aIlyj4y9bg
RAZORPAY_KEY_SECRET=i8BegnffUqIwEnwLODbQGOqj
RAZORPAY_WEBHOOK_SECRET=        # filled in after creating webhook in Razorpay dashboard
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_Sjc9aIlyj4y9bg
```

Remove all `PAYTM_*` env vars.

Note: the test secret was shared in chat; consider rotating it via the Razorpay dashboard before pointing production traffic at it. Test keys cannot move real money, so the immediate risk is low.

## Payment Flow

1. User clicks **Pay** → frontend `POST /api/payments/razorpay/initiate`.
2. Server creates a PENDING `transactions` row, calls Razorpay Orders API, stores `order_id` in `transaction_ref`, responds with order data + `internalTxnId`.
3. Frontend calls `razorpayClient.openCheckout({ key, order_id, amount, currency, prefill, handler, modal })`.
4. User completes payment in modal. Razorpay invokes `handler({ razorpay_order_id, razorpay_payment_id, razorpay_signature })`.
5. Frontend `POST /api/payments/razorpay/verify` with that payload + `internalTxnId`. Server verifies signature, marks transaction `SUCCESS`, returns ok.
6. Frontend advances the form / shows receipt.
7. Independently, Razorpay fires `payment.captured` webhook → `/api/payments/razorpay/webhook` verifies and ensures the row is `SUCCESS` even if the user closed the browser before step 5.
8. If `modal.ondismiss` fires (user cancelled), frontend may poll `/api/payments/razorpay/status/[orderId]` to recover state — webhook will eventually settle the row.

## Error Handling

- **Missing env vars:** server routes return 500 with a generic error; surfaced via existing error toast.
- **Razorpay Orders API failure:** server marks transaction `FAILED`, returns 502.
- **Signature mismatch on verify:** transaction marked `FAILED`, 400 returned, frontend shows error and offers retry (which creates a new order).
- **Webhook signature mismatch:** 400 returned, no DB write, logged.
- **Duplicate webhook delivery:** idempotent — if row is already `SUCCESS`, return 200 without re-writing.
- **User cancels modal:** transaction stays `PENDING`; webhook will not fire; a daily reaper or manual reconciliation can mark old PENDING rows as expired (out of scope here).

## Testing

- `frontend/src/lib/payments/razorpay.test.ts`
  - `verifyPaymentSignature`: valid signature → true; tampered payment id → false; tampered signature → false.
  - `verifyWebhookSignature`: valid raw body → true; mutated body → false.
  - `createOrder`: builds correct Basic auth header and request body (mock `fetch`).
- Updated `frontend/tests/payments/AdmissionFeeStep.test.tsx`
  - Dev bypass calls `/api/payments/razorpay/dev-bypass`.
  - Standard flow: `initiate` → `openCheckout` mocked → `handler` invoked → `verify` called with correct payload → form advances.
  - Failure: `openCheckout` rejects → error displayed, form does not advance.

## Out of Scope

Refunds UI, saved payment instruments, subscriptions, partial payments, multi-currency, multi-provider runtime switch, reaper for stale PENDING transactions.
