# PhonePe Payment Integration (replaces Razorpay) — Design

**Date:** 2026-07-31
**Branch:** `feature/phonepe-payment-integration`
**Status:** Approved

## Background

The admission-fee payment step (₹500, hostel verticals only: `BOYS_HOSTEL`, `GIRLS_ASHRAM`) currently uses Razorpay:

- `frontend/src/lib/payments/razorpay.ts` — order creation, payment/webhook signature verification (HMAC-SHA256 REST calls, no SDK dependency)
- `frontend/src/lib/payments/razorpayClient.ts` — loads Razorpay's checkout.js and opens an in-page modal
- `frontend/src/app/api/payments/razorpay/{initiate,verify,webhook,status/[orderId]}/route.ts`
- `frontend/src/components/forms/AdmissionFeeStep.tsx` — used from `apply/boys-hostel/form/page.tsx` and `apply/girls-ashram/form/page.tsx`
- DB: gateway-agnostic `transactions` table (`transaction_ref`, `gateway_response` jsonb, `status`), `fees`, `applications.payment_status` — no schema changes needed for this migration.

This design replaces Razorpay with PhonePe's current PG Checkout v2 (Standard Checkout, OAuth-based) and removes all Razorpay code.

## Why PhonePe's flow differs from Razorpay's

Razorpay opens an in-page JS modal and returns a payment signature to verify client-side. PhonePe PG Checkout v2 is **redirect-based**: the merchant server creates an order via OAuth-authenticated REST calls, the browser is fully redirected to a PhonePe-hosted page, and PhonePe redirects back to a merchant callback URL after payment. There is no client-side signature — verification is a server-side Order Status API call, plus an optional S2S webhook as a backstop.

## Architecture

1. `AdmissionFeeStep` calls `POST /api/payments/phonepe/initiate` → server obtains an OAuth token (cached in-memory until expiry), creates a PhonePe order, stores a `PENDING` transaction in `transactions` (`transaction_ref` = PhonePe's `merchantOrderId`), and returns PhonePe's `redirectUrl`.
2. Browser does a full-page redirect (`window.location.href`) to that URL. No script/SDK loading required.
3. PhonePe redirects back to `GET /apply/payment-callback?applicationId=&merchantOrderId=&vertical=`. This page calls `POST /api/payments/phonepe/verify`, which hits PhonePe's Order Status API server-side, finalizes the fee/application (`PAID` + `SUBMITTED`) idempotently, and renders success/failure UI directly (retry link back to `/apply/{vertical}/form?appId=&tracking=` on failure, confirmation view on success).
4. `POST /api/payments/phonepe/webhook` independently verifies PhonePe's webhook auth header (SHA-256 of a dashboard-configured `username:password`, compared against the `Authorization` header per PhonePe's spec) and applies the same finalization — a backstop if the applicant never returns to the tab. Mirrors the current Razorpay webhook's role.

## Components & files

**New:**
- `lib/payments/phonepe.ts` — `getPhonePeConfig()`, `getAuthToken()` (OAuth, cached), `createOrder()`, `checkOrderStatus()`, `verifyWebhookAuth()`.
- `lib/payments/phonepeClient.ts` — thin wrapper: `redirectToCheckout(redirectUrl)` → `window.location.href = redirectUrl`. Kept as a module (not inlined) so `AdmissionFeeStep` doesn't hardcode navigation.
- `app/api/payments/phonepe/initiate/route.ts` — same auth/ownership checks as today's Razorpay initiate: session token verification, contact-matches-application check, vertical + DRAFT-status check, fee lookup, 15-minute PENDING-txn reuse/supersede.
- `app/api/payments/phonepe/verify/route.ts` — authoritative status check + finalize; called from the callback page.
- `app/api/payments/phonepe/webhook/route.ts` — S2S backstop finalize.
- `app/apply/payment-callback/page.tsx` — reads query params, calls `verify`, shows spinner then success/failure state.

**Modified:**
- `components/forms/AdmissionFeeStep.tsx` — simplified: call `initiate`, then `redirectToCheckout`. Drops `onSuccess`/`onFailure` props (success/failure is now only known after the redirect round-trip, owned by the callback page); keeps only `applicationId` and `vertical`.
- `app/apply/boys-hostel/form/page.tsx`, `app/apply/girls-ashram/form/page.tsx` — update `AdmissionFeeStep` usage to drop the removed props.
- `app/api/applications/route.ts` — update two stray comments referencing "Razorpay verify route".
- `.env.example` — replace `RAZORPAY_*` with `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV`, `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD`.

**Removed:**
- `lib/payments/razorpay.ts`, `razorpayClient.ts`, `razorpay.test.ts`
- `app/api/payments/razorpay/**` (initiate, verify, webhook, status/[orderId])
- `tests/payments/razorpayVerifyRoute.test.ts`, `tests/payments/razorpayWebhookRoute.test.ts`

**Unchanged:** `app/api/payments/route.ts` and `app/api/payments/verify/route.ts` are gateway-agnostic and used elsewhere — not touched.

## Error handling & idempotency

Same guarantees as the current Razorpay flow:
- Reuse a `PENDING` transaction if created within the last 15 minutes; supersede (mark `FAILED`) older pending ones before creating a new order.
- `verify` and `webhook` both check existing transaction status first (`SUCCESS`/`FAILED` short-circuits as idempotent) before doing any work.
- Amount is validated against the expected ₹500 admission fee before marking paid.
- All DB state transitions (`transactions` → `fees` → `applications`) wrapped in `BEGIN`/`COMMIT`/`ROLLBACK`.
- Receipt email sent non-blocking on successful finalize (same as today).

## Credentials & environment

Not yet available — wired via env vars with the same fail-fast pattern Razorpay uses today (`getPhonePeConfig()` throws a clear error if required vars are missing):

- `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV` (`SANDBOX` | `PRODUCTION`)
- `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD` (values you configure in PhonePe's dashboard when registering the webhook URL)

Admission fee amount stays hardcoded at ₹500, matching today.

## Testing

Port the existing Razorpay test structure to PhonePe:
- `lib/payments/phonepe.test.ts` — OAuth token cache behavior, order creation request shape, webhook auth check.
- `tests/payments/phonepeVerifyRoute.test.ts` — signature/status failure, amount mismatch, idempotency, happy path.
- `tests/payments/phonepeWebhookRoute.test.ts` — same coverage for the webhook path.
