# Paytm Admission Fee (₹500) at Application Submission — Design

**Date:** 2026-04-28
**Status:** Approved (pending implementation plan)
**Scope:** Boys Hostel and Girls Ashram applications only. Dharamshala is excluded.

## 1. Goal

Collect a non-refundable ₹500 admission fee via Paytm Payment Gateway at the moment an applicant submits a hostel application. If the application is later approved, the ₹500 is adjusted as a credit against the resident's hostel fees.

## 2. User Flow

1. Applicant fills the multi-step admission form for Boys Hostel or Girls Ashram.
2. On the final review step, an `AdmissionFeeNotice` displays:
   > "A non-refundable admission fee of ₹500 will be collected to submit this application. If your admission is confirmed, this amount will be adjusted against your hostel fees."
3. User clicks **"Pay ₹500 & Submit"**.
4. Server creates:
   - `applications` row with `current_status = DRAFT`.
   - `fees` row: `fee_head = 'ADMISSION_FEE'`, `amount = 500`, `status = PENDING`, linked to the application.
   - `transactions` row: `status = PENDING`, `payment_method = ONLINE`, with a freshly issued Paytm `orderId` written to `transaction_ref`.
   - Returns Paytm `txnToken` to the client.
5. Frontend opens Paytm Checkout JS overlay (`MID`, `orderId`, `txnToken`, `amount`).
6. Paytm sends a server-to-server callback to our `/api/payments/paytm/callback`:
   - **Success:** `transactions.status = SUCCESS`, `fees.status = PAID`, `applications.current_status = SUBMITTED`. Receipt PDF generated and `transactions.receipt_path` set.
   - **Failure:** `transactions.status = FAILED`. Application stays DRAFT. User can retry from a tracking link delivered via OTP/SMS.
7. Client redirects to `/apply/<vertical>/success` (success) or back to the form with a retry banner (failure).
8. Dharamshala submission flow is unchanged: no payment step, application moves directly to SUBMITTED.

## 3. Architecture

### 3.1 New Files

| Path | Purpose |
|------|---------|
| `frontend/src/lib/payments/paytm.ts` | Server util: checksum generation/verification (paytmchecksum), env-driven base URL (`securegw-stage` vs `securegw`), order ID generator, status-query helper. |
| `frontend/src/app/api/payments/paytm/initiate/route.ts` | POST. Input: `applicationId`. Creates/reuses pending transaction, returns `{ orderId, txnToken, amount, mid }`. |
| `frontend/src/app/api/payments/paytm/callback/route.ts` | POST. Receives Paytm S2S callback, verifies checksum, updates `transactions`/`fees`/`applications`, generates receipt. Idempotent. |
| `frontend/src/app/api/payments/paytm/status/[orderId]/route.ts` | GET. Client poll fallback. Reconciles a stuck PENDING by querying Paytm Transaction Status API. |
| `frontend/src/components/forms/AdmissionFeeStep.tsx` | Final wizard step: fee notice + Pay button; loads Checkout JS, opens overlay, polls status. |
| `frontend/src/components/forms/AdmissionFeeNotice.tsx` | Reusable disclaimer (₹500 non-refundable, adjusted on confirmation). |

### 3.2 Modified Files

| Path | Change |
|------|--------|
| `frontend/src/app/apply/boys-hostel/form/page.tsx` | Append `AdmissionFeeStep` as final step; submit handler is now payment-gated. |
| `frontend/src/app/apply/girls-ashram/form/page.tsx` | Same as above. |
| `frontend/src/app/apply/dharamshala/form/page.tsx` | **Unchanged.** No payment. |
| `frontend/src/app/api/applications/route.ts` | When vertical is `BOYS_HOSTEL` or `GIRLS_ASHRAM`, POST creates application as DRAFT + a `fees` row; transition to SUBMITTED happens only via the Paytm callback. Dharamshala continues to create as SUBMITTED directly. |
| Approval API (existing trustee approve handler) | Calls a new helper `adjustAdmissionFeeCredit(applicationId, studentId)` that pre-credits ₹500 against the first hostel-fee row created for the approved resident. |
| `.env.local` (and `.env.example`) | Add Paytm env vars (see §6). |

### 3.3 Database

No schema changes. Reuse existing tables:

- `fees`: `fee_head = 'ADMISSION_FEE'`, `application_id` set, `student_id` null until approval.
- `transactions`: `transaction_ref` = Paytm `ORDERID` (UNIQUE, drives idempotency); `gateway_response` (JSONB) stores the full Paytm payload; `payment_method = ONLINE`.

## 4. Adjustment-on-Confirmation

When a Trustee approves an application that has a paid `ADMISSION_FEE`:

1. On creation of the first hostel-fee row for the new resident, insert a credit referencing the original `fees.id` (either as `paid_amount = 500` pre-fill or as a separate negative-amount adjustment line, whichever fits the existing accounts ledger pattern — to be confirmed during plan-writing).
2. The approval handler invokes `adjustAdmissionFeeCredit(applicationId, studentId)` once, idempotently (no double-credit on re-approval).

## 5. Error Handling & Edge Cases

- **Checksum mismatch on callback:** return 400, write `audit_logs` entry, no DB mutation.
- **Callback never arrives:** client polls `/status/[orderId]` every 3s for up to 60s; if still pending, shows "We're confirming your payment" page with a tracking link.
- **Duplicate callback:** `transactions.transaction_ref` UNIQUE constraint + early-return when status already `SUCCESS`.
- **User closes overlay:** `onDismiss` marks transaction `CANCELLED`; application stays DRAFT; banner offers retry.
- **Network failure mid-payment:** status endpoint reconciles by calling Paytm's Transaction Status API.
- **Concurrent retries:** if a `PENDING` transaction exists for an application less than 15 minutes old, reuse its `txnToken`; otherwise create a new transaction and mark the old one `EXPIRED`.
- **Receipt generation failure:** does not block payment success; job retries; success page shows "Receipt will be available shortly".

## 6. Security

- `PAYTM_MERCHANT_KEY` is server-only; never exposed to the client.
- Public env vars: `NEXT_PUBLIC_PAYTM_MID`, `NEXT_PUBLIC_PAYTM_ENV` (only used to point the Checkout JS bundle at staging vs production).
- Server env vars: `PAYTM_ENV` (`staging` | `production`), `PAYTM_MID`, `PAYTM_MERCHANT_KEY`, `PAYTM_WEBSITE`, `PAYTM_CALLBACK_URL`.
- All Paytm requests/responses signed and verified with the official `paytmchecksum` package.
- Callback route verifies checksum **before** any DB write.
- Amount and order ID always re-validated server-side against the `fees`/`transactions` rows. Client-submitted amounts are ignored.
- Rate limit `/initiate`: 5 requests per 10 minutes per IP and per `applicant_mobile`.
- Audit-log entries written for: initiate, success, failure, checksum mismatch, status reconciliation.

## 7. Testing

- **Unit:** checksum generate/verify; amount validation; idempotency on duplicate callbacks; reuse-vs-new transaction logic.
- **Integration:** `/initiate` returns a valid token; `/callback` with valid signature flips state; invalid signature returns 400; status endpoint reconciles a stuck PENDING.
- **E2E (manual, staging):** Boys + Girls flows — successful payment, failed payment (Paytm test failure card), abandoned payment (close overlay), duplicate callback. Verify Dharamshala flow remains unchanged (no payment step).
- **Approval adjustment:** create a paid application → approve → assert that the first hostel-fee row reflects the ₹500 credit and that re-approving does not double-credit.

## 8. Out of Scope

- Refunds (admission fee is non-refundable per business decision).
- Mobile-app (All-in-One SDK) integration.
- Payment for Dharamshala admissions.
- Migration of any existing fee/payment data.
