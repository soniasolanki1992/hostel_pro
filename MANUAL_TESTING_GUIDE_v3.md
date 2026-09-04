# Manual Testing Guide v3 - Hostel Pro

**Last Updated:** 2026-04-30
**Purpose:** Production readiness verification for all workflows, roles, and features.

**Changes from v2:**

- **PhonePe payment integration** replaces Paytm (initiate / verify / webhook routes) and is the gating mechanism for application submit on Boys Hostel and Girls Ashram.
- **Payment-gated submit:** new applications are created as `DRAFT` with `payment_status='PENDING'`; submission is only allowed after PhonePe verify or webhook flips `payment_status='PAID'`.
- **Resume-draft flow:** `/apply/resume` panel and `?appId=&tracking=` deep-link jump straight to the payment screen for existing DRAFT applications. Drafts are looked up by mobile with lazy 1-year cleanup.
- **Admission fee credit on approval:** the admission fee paid at submit is credited against the student's first hostel fee at application approval time.
- **Alumni module:** new `/alumni/*` routes (landing, register, login, dashboard, directory, events, jobs, profile, admin, pending) and `/api/alumni/*` endpoints.
- **Application sub-routes:** new `[id]/submit`, `[id]/photo`, `[id]/emergency`, `documents/upload`, `drafts-by-mobile`, `waitlist`, public `track` endpoints.
- **Superintendent dashboard fix:** reads `payment_status` in snake_case from the API; `WAITLIST` status is included in `byStatus` counts.
- **Stale pending transactions** are reconciled to `FAILED` (the `transaction_status` enum has no `EXPIRED`).
- **Razorpay/Paytm dev-bypass routes removed** — PhonePe sandbox credentials cover dev testing.
- New sections: §20 PhonePe Payment Testing, §21 Resume-Draft Flow Testing, §22 Alumni Portal Testing.

> v2 sections (Application Flow, Auth, Dashboards, Allocation, Leaves, Interviews, Exit, Renewal, Documents, Security) remain valid except where superseded below. The new sections are additive — run them in addition to the v2 sweep.

---

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Test Credentials](#2-test-credentials)
3. [Application Flow Testing](#3-application-flow-testing)
4. [Authentication Testing](#4-authentication-testing)
5. [Student Dashboard Testing](#5-student-dashboard-testing)
6. [Superintendent Dashboard Testing](#6-superintendent-dashboard-testing)
7. [Trustee Dashboard Testing](#7-trustee-dashboard-testing)
8. [Accounts Dashboard Testing](#8-accounts-dashboard-testing)
9. [Parent Portal Testing](#9-parent-portal-testing)
10. [Room Allocation Testing](#10-room-allocation-testing)
11. [Leave Management Testing](#11-leave-management-testing)
12. [Interview Workflow Testing](#12-interview-workflow-testing)
13. [Exit & Clearance Testing](#13-exit--clearance-testing)
14. [Fee & Payment Testing](#14-fee--payment-testing)
15. [Renewal Cycle Testing](#15-renewal-cycle-testing)
16. [Document Management Testing](#16-document-management-testing)
17. [Authorization & Security Testing](#17-authorization--security-testing)
18. [API Endpoint Reference](#18-api-endpoint-reference)
19. [Known Limitations](#19-known-limitations)
20. [PhonePe Payment Testing (NEW)](#20-phonepe-payment-testing-new)
21. [Resume-Draft Application Flow (NEW)](#21-resume-draft-application-flow-new)
22. [Alumni Portal Testing (NEW)](#22-alumni-portal-testing-new)

---

> Sections 1–17 retain the contents from v2. Only **deltas** are listed below; the full content is in `MANUAL_TESTING_GUIDE_v2.md`. New sections 20–22 are spelled out in full.

## Deltas to v2

### §1 Environment Setup — additional env vars

| Variable                    | Required                | Notes                                                                    |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `PHONEPE_CLIENT_ID`          | Yes                     | PhonePe PG Checkout v2 client id (sandbox or production)                 |
| `PHONEPE_CLIENT_SECRET`      | Yes                     | Server-only; used to obtain the OAuth token for order/status calls       |
| `PHONEPE_CLIENT_VERSION`     | Yes                     | Client version supplied to PhonePe's OAuth token endpoint                |
| `PHONEPE_ENV`                | Yes                     | `SANDBOX` or `PRODUCTION`; selects PhonePe's default API base/auth URLs  |
| `PHONEPE_WEBHOOK_USERNAME`   | Yes (prod recommended)  | Paired with `PHONEPE_WEBHOOK_PASSWORD` to validate the webhook's Basic Auth |
| `PHONEPE_WEBHOOK_PASSWORD`   | Yes (prod recommended)  | See above; configure the same values in the PhonePe dashboard            |
| `PHONEPE_AUTH_URL`           | No                      | Optional override if PhonePe's published OAuth endpoint differs          |
| `PHONEPE_API_BASE_URL`       | No                      | Optional override if PhonePe's published API base differs                |
| `NEXT_PUBLIC_APP_URL`        | Yes (prod recommended)  | Canonical app origin used to build the post-payment return URL (server-trusted, not the client `Origin` header) |

> Paytm env vars (`PAYTM_*`) are no longer used. The `paytmchecksum` package was removed. Razorpay env vars (`RAZORPAY_*`) are also no longer used — the integration was replaced by PhonePe.

### §3 Application Flow Testing — DRAFT + payment-gated submit

The Boys Hostel and Girls Ashram form now creates the application as `DRAFT` with `payment_status='PENDING'` after **Step 5 (review)** and only flips to `SUBMITTED` after PhonePe payment is verified.

Add the following test cases:

#### TC-APP-07: Payment-gated submit (Boys / Girls)

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Complete Steps 1–5 of the Boys Hostel form | API creates row with `current_status='DRAFT'`, `payment_status='PENDING'`, returns `application_id` and `tracking_number` | Done |
| 2 | Verify the wizard advances to the **AdmissionFeeStep** | "Pay Now" button rendered; amount matches the configured admission fee | Done |
| 3 | Try clicking "Submit" without paying | Submit is disabled / blocked with "Payment required" message | |
| 4 | Click "Pay Now" | `POST /api/payments/phonepe/initiate` returns `checkoutUrl`, `merchantOrderId`; browser redirects to the PhonePe-hosted checkout page | Done |
| 5 | Complete payment on PhonePe's page | PhonePe redirects back to `/apply/payment-callback`, which calls `POST /api/payments/phonepe/verify` with the `merchantOrderId` | Done |
| 6 | Verify the verify response | `payment_status='PAID'` on `applications`; `status='SUCCESS'` on `transactions`; submit unlocks | Done |
| 7 | Click "Submit" | `POST /api/applications/[id]/submit` flips `current_status` to `SUBMITTED`; redirects to success page | Done |
| 8 | Repeat for Girls Ashram | Same gating applies | Not tested |
| 9 | Repeat for Dharamshala | **No** payment gate (Dharamshala is not gated); submit goes through directly | Not tested |

#### TC-APP-08: Drafts-by-mobile lookup

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Submit OTP for a mobile that has an existing DRAFT | `GET /api/applications/drafts-by-mobile?mobile=...` returns DRAFTs less than 1 year old | Done |
| 2 | Verify drafts >1 year old | API performs lazy cleanup and they are excluded | Done |
| 3 | Verify response shape | `{ application_id, tracking_number, vertical, payment_status, updated_at }` per row | Done |

### §6 Superintendent Dashboard — payment_status fix

`TC-SUPT-01` updated: the dashboard now reads `payment_status` (snake_case) from the API. Verify:

- Applications with `payment_status='PAID'` show a green "Paid" badge; `PENDING` shows amber.
- `WAITLIST` applications appear in the `byStatus` counts (previously missing).

### §14 Fee & Payment Testing — admission fee credit

#### TC-FEE-05: Admission fee credit on approval

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Approve an application that paid the admission fee | Approval flow credits the admission-fee transaction against the student's first hostel fee | |
| 2 | Open the resulting student's `/dashboard/student/fees` | Hostel fee shows reduced outstanding by the admission fee amount; transaction is linked | |
| 3 | Verify audit log | `audit_logs` entry tagged `event='ADMISSION_FEE_CREDIT'` (or equivalent) on the fee row | |

### §19 Known Limitations — updated

| Feature | Status | Notes |
| ------- | ------ | ----- |
| **PhonePe Integration** | **Working** | Initiate / verify / webhook routes wired up; gates Boys & Girls submit |
| Paytm Integration | Removed | Replaced by Razorpay, then by PhonePe; `paytmchecksum` dependency dropped |
| Razorpay Integration | Removed | Replaced by PhonePe (PG Checkout v2) |
| WhatsApp Notifications | Config Only | Rules stored, delivery not implemented |
| Email Notifications | Config Only | Rules stored, delivery not implemented |
| SMS Notifications | Partial | MSG91 OTP works, async queue not deployed |
| BullMQ/Redis Queue | Not Deployed | Architecture planned |
| PDF Generation | Working | Application PDF via `/api/applications/{id}/pdf` |
| Razorpay/Paytm dev-bypass routes | Removed | Use PhonePe sandbox credentials instead |

---

## 20. PhonePe Payment Testing (NEW)

**Scope:** Admission-fee payment is collected at application time via PhonePe PG Checkout v2 (Standard Checkout, redirect-based). Webhook reconciliation finalises the transaction asynchronously and is idempotent; the client-side verify call covers the case where the applicant returns from PhonePe before the webhook lands.

**Endpoints under test:**

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| POST | `/api/payments/phonepe/initiate` | Create a PhonePe order (or reuse a still-fresh pending one); insert/reuse `transactions` row as `PENDING`; returns `checkoutUrl` |
| POST | `/api/payments/phonepe/verify` | Poll PhonePe's order-status API; on `COMPLETED` flip transaction → `SUCCESS`, application `payment_status='PAID'` |
| POST | `/api/payments/phonepe/webhook` | Idempotent finalisation; called by PhonePe's servers with Basic Auth (`PHONEPE_WEBHOOK_USERNAME` / `PHONEPE_WEBHOOK_PASSWORD`) |

> There is no separate `status/[orderId]` route — client-side status is obtained via the `verify` route, which itself calls PhonePe's order-status API.

**Redirect-based flow (not an in-page modal):**

1. Applicant clicks "Pay Now" on the AdmissionFeeStep.
2. `POST /api/payments/phonepe/initiate` returns a `checkoutUrl`; the browser is redirected (full navigation, not a modal) to PhonePe's hosted checkout page.
3. Applicant completes or cancels payment on PhonePe's page.
4. PhonePe redirects the browser back to `/apply/payment-callback` with `applicationId`, `merchantOrderId`, `trackingNumber`, and `vertical` query params.
5. `/apply/payment-callback` calls `POST /api/payments/phonepe/verify` with the `merchantOrderId` and shows a success or failure state based on the response.
6. On success, the applicant is redirected to `/track/{trackingNumber}?paid=1`.

### TC-PAY-01: Initiate order

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | `POST /api/payments/phonepe/initiate` with valid `applicationId` and `sessionToken` | 200 response with `checkoutUrl`, `merchantOrderId`, `internalTxnId` | |
| 2 | A row exists in `transactions` with `status='PENDING'`, `payment_method='ONLINE'`, `transaction_ref=merchantOrderId` | DB row matches | |
| 3 | Repeat call for same application within 15 minutes, before paying | Returns the same pending order's `checkoutUrl` (reused, idempotent), does not create a duplicate transaction | |
| 4 | Repeat call after the 15-minute reuse window | Old `PENDING` transaction is marked `FAILED` ("Superseded by new order"); a fresh order + transaction is created | |
| 5 | Call with bogus `applicationId` | 404 | |
| 6 | Call with a `sessionToken` whose verified contact doesn't match the application | 401 | |

### TC-PAY-02: Verify order status

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Pay via PhonePe sandbox test instrument | PhonePe redirects to `/apply/payment-callback?merchantOrderId=...` | |
| 2 | `POST /api/payments/phonepe/verify` with that `merchantOrderId` | Calls PhonePe's order-status API; on `COMPLETED` state: `transactions.status='SUCCESS'`; `applications.payment_status='PAID'`; `fees.status='PAID'` | |
| 3 | Amount returned by PhonePe does not match the expected admission fee (paise) | 400 "Amount mismatch"; no DB mutation | |
| 4 | Replay the same verify call after success | Idempotent — returns `{status:'SUCCESS', idempotent:true}` without duplicating side-effects | |
| 5 | Verify a transaction PhonePe marked `FAILED` (still `PENDING`/`FAILED` at the gateway) | Idempotent — returns `{status:'FAILED', idempotent:true}` | |
| 6 | Verify a transaction previously superseded (marked `FAILED` locally after a retry) whose original PhonePe order actually completed | Recovers: finalizes as `SUCCESS` (not swallowed as a duplicate); audit log records `PHONEPE_VERIFY_RECOVERED_AFTER_SUPERSEDE` | |

### TC-PAY-03: Webhook reconciliation

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Trigger a `checkout.order.completed` webhook from the PhonePe dashboard / curl | `POST /api/payments/phonepe/webhook` validates the `Authorization` header against SHA-256(`PHONEPE_WEBHOOK_USERNAME:PHONEPE_WEBHOOK_PASSWORD`) | |
| 2 | Verify side effects | Same as verify: `transactions.status='SUCCESS'`, `applications.payment_status='PAID'`, `fees.status='PAID'` | |
| 3 | Replay the same webhook payload | Idempotent — no duplicate audit log / no double-credit | |
| 4 | Send webhook with a bad/missing `Authorization` header | 400; no DB changes | |
| 5 | Webhook with `state='FAILED'` | `transactions.status='FAILED'`; `applications.payment_status` stays `PENDING` | |
| 6 | Webhook with `state='COMPLETED'` for a transaction previously superseded (marked `FAILED` locally after a retry) | Recovers: finalizes as `SUCCESS` (not swallowed as a duplicate); audit log records `PHONEPE_WEBHOOK_RECOVERED_AFTER_SUPERSEDE` | |

### TC-PAY-04: Frontend AdmissionFeeStep

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Open Step 6 (admission fee) on Boys / Girls form | AdmissionFeeStep renders amount, terms notice, "Pay Now" button | |
| 2 | Click "Pay Now" | Full-page redirect to PhonePe's hosted checkout (no in-page modal) | |
| 3 | Cancel checkout on PhonePe's page | Browser returns to `/apply/payment-callback`; failure state shown; wizard allows retry (existing PENDING transaction reused within 15 min) | |
| 4 | Successful payment | Callback page verifies, then redirects to `/track/{trackingNumber}?paid=1` | |
| 5 | Refresh `/apply/payment-callback` mid-flow | Re-calling verify is safe/idempotent regardless of prior outcome | |

### TC-PAY-05: PhonePe server lib unit tests

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Run `npx vitest run` for `src/lib/payments/phonepe.test.ts` | `createOrder`, `checkOrderStatus`, `verifyWebhookAuth` request/response-shape tests pass, including validation that `createOrder` rejects a response missing `redirectUrl` | |
| 2 | Verify-route DB side-effects test (`tests/payments/phonepeVerifyRoute.test.ts`) | Passes (covers `payment_status` flip, amount-mismatch rejection, idempotency, and superseded-then-completed recovery) | |
| 3 | Webhook-route DB side-effects test (`tests/payments/phonepeWebhookRoute.test.ts`) | Passes (idempotent + auth-header validation + superseded-then-completed recovery paths) | |

---

## 21. Resume-Draft Application Flow (NEW)

**Scope:** Applicants who left mid-flow can resume from `/apply/resume` (or via a deep link with `?appId=&tracking=`). Lookups are mobile-keyed with lazy 1-year cleanup of old drafts.

### TC-RESUME-01: Resume panel landing

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Navigate to `/apply` | Top of page shows the **Resume Application** panel beneath the vertical cards | |
| 2 | Enter a registered mobile, request OTP | OTP is sent (`POST /api/otp/send`); dev = `123456` | |
| 3 | Verify OTP | Panel calls `GET /api/applications/drafts-by-mobile?mobile=...`; lists any DRAFT < 1 yr old with vertical, tracking, payment status | |
| 4 | Mobile with no drafts | Panel shows empty state "No drafts found" | |
| 5 | Mobile with only >1yr-old drafts | Cleanup runs; empty state shown; old rows soft-deleted/archived | |

### TC-RESUME-02: Resume specific draft

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Click "Resume" on a DRAFT (`payment_status='PENDING'`) | Redirects to `/apply/[vertical]/form?appId=...&tracking=...` and jumps directly to **AdmissionFeeStep** | |
| 2 | Form chrome (header, stepper, footer) matches the multi-step form | Visual parity with regular form | |
| 3 | Click "Resume" on DRAFT that already paid (rare race) | Skips AdmissionFeeStep, lands on Submit step | |
| 4 | Manually craft `?appId=&tracking=` for an APPROVED application | Public track endpoint blocks access; user redirected to `/track/[id]` | |

### TC-RESUME-03: Public track endpoint for DRAFT

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Resume panel fetches the DRAFT via `GET /api/applications/track/[id]` (no auth) | 200 with limited DRAFT fields (no PII beyond what's needed to resume) | |
| 2 | Same endpoint hit from any other browser | Works (auth-free), but returns only public-safe fields | |
| 3 | Hit it for a non-DRAFT (SUBMITTED+) | Returns the standard tracking projection | |

### TC-RESUME-04: 1-year lazy cleanup

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Seed a DRAFT with `updated_at` 13 months ago | Row exists in DB | |
| 2 | Hit `drafts-by-mobile` for that mobile | Cleanup runs in the same request; row is purged / archived; not returned | |
| 3 | Audit log | Cleanup event recorded | |

---

## 22. Alumni Portal Testing (NEW)

**Scope:** New alumni vertical at `/alumni/*` with its own register/login, dashboard, directory, events, jobs board, profile, and admin moderation.

**Routes:**

| Route | Purpose |
| ----- | ------- |
| `/alumni` | Public landing page |
| `/alumni/register` | Alumni self-registration |
| `/alumni/login` | Email/OTP login |
| `/alumni/pending` | Holding page while admin approves |
| `/alumni/dashboard` | Authenticated alumni dashboard |
| `/alumni/profile` | Edit profile |
| `/alumni/directory` | Search other alumni |
| `/alumni/events` | View / RSVP events |
| `/alumni/jobs` | Browse / post job openings |
| `/alumni/admin` | Admin moderation (approve registrations, post events / jobs) |

**API:** `/api/alumni/{register, otp, me, directory, events, jobs, documents, admin}`

### TC-ALUM-01: Alumni registration

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Navigate to `/alumni/register` | Form with name, email, mobile, batch year, vertical, optional documents | |
| 2 | Submit with missing required fields | Validation errors | |
| 3 | Submit valid form | `POST /api/alumni/register` creates row with `status='PENDING'`; redirect to `/alumni/pending` | |
| 4 | Try registering same email/mobile twice | 409 / dedupe error | |

### TC-ALUM-02: Alumni admin approval

**Login as:** Trustee or designated alumni admin.

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Navigate to `/alumni/admin` | Pending registrations listed | |
| 2 | Approve a registration | Status `APPROVED`; alumni user account provisioned with temp password / OTP login | |
| 3 | Reject a registration | Status `REJECTED`; reason recorded | |
| 4 | Verify rejected applicant cannot log in | `/alumni/login` denies access | |

### TC-ALUM-03: Alumni login

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Approved alumni navigates to `/alumni/login` | Email + OTP login form | |
| 2 | Enter email → request OTP | `POST /api/alumni/otp` sends OTP | |
| 3 | Submit valid OTP | Session created; redirect to `/alumni/dashboard` | |
| 4 | Pending alumni tries to log in | Redirected to `/alumni/pending` (not dashboard) | |
| 5 | `GET /api/alumni/me` returns profile | 200 with profile data | |

### TC-ALUM-04: Directory

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Open `/alumni/directory` | List of approved alumni with name, batch, vertical, current city/role | |
| 2 | Search by name | Results filtered | |
| 3 | Filter by batch year / vertical | Filters apply | |
| 4 | Click an alumnus | Public profile shown (PII per privacy settings) | |
| 5 | Logged-out user tries to access | Redirect to `/alumni/login` | |

### TC-ALUM-05: Events

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Admin posts an event from `/alumni/admin` | Event visible on `/alumni/events` | |
| 2 | Alumni RSVPs | RSVP recorded; toggle works | |
| 3 | Past events filter | Past vs upcoming separated | |

### TC-ALUM-06: Jobs board

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Alumni posts a job | `POST /api/alumni/jobs` creates listing in `PENDING` (admin-moderated) | |
| 2 | Admin approves the job | Listing visible on `/alumni/jobs` | |
| 3 | Alumni applies / contacts | Lead recorded (or external link opened) | |
| 4 | Job poster edits / closes | Status flips to `CLOSED` | |

### TC-ALUM-07: Profile edit

| Step | Action | Expected Result | Status |
| ---- | ------ | --------------- | ------ |
| 1 | Navigate to `/alumni/profile` | Editable fields: name, contact, current role, company, city, bio, photo | |
| 2 | Update fields, save | `PUT /api/alumni/me` succeeds; directory updated | |
| 3 | Toggle privacy settings | Hidden fields not exposed in directory | |

### TC-ALUM-08: Authorization

| Test | Login As | Try Accessing | Expected | Status |
| ---- | -------- | ------------- | -------- | ------ |
| Student can't access alumni admin | Student | `/alumni/admin` | 403 / redirect | |
| Alumni can't access trustee dashboard | Alumni | `/dashboard/trustee` | Redirect to alumni dashboard | |
| Pending alumni can't access dashboard | Pending alumni | `/alumni/dashboard` | Redirect to `/alumni/pending` | |
| Logged-out user hitting `/api/alumni/me` | None | — | 401 | |

---

## 23. End-to-End Workflow Additions

### Application with PhonePe (Boys / Girls happy path)

- [ ] Applicant selects vertical → contact → OTP
- [ ] Fills Steps 1–5 — application created as `DRAFT`, `payment_status='PENDING'`
- [ ] Lands on AdmissionFeeStep → clicks Pay Now → redirected to PhonePe-hosted checkout
- [ ] Pays with sandbox test instrument → PhonePe redirects to `/apply/payment-callback` → verify route flips `payment_status='PAID'`
- [ ] Submit unlocks → `current_status='SUBMITTED'`
- [ ] Applicant lands on `/track/{trackingNumber}?paid=1`
- [ ] Webhook fires (idempotent reconciliation) → no duplicate side-effects
- [ ] Application approved → admission fee credited against first hostel fee
- [ ] Student logs in with temp password → first-time setup → dashboard

### Resume Draft happy path

- [ ] Applicant abandons mid-flow with `DRAFT` + `PENDING` payment
- [ ] Returns to `/apply` → enters mobile → OTP → sees their draft
- [ ] Clicks Resume → lands on AdmissionFeeStep
- [ ] Pays → submits → tracked as normal SUBMITTED application

### Alumni happy path

- [ ] Registers via `/alumni/register` → redirected to `/alumni/pending`
- [ ] Admin approves from `/alumni/admin`
- [ ] Logs in via OTP at `/alumni/login`
- [ ] Updates profile, browses directory, RSVPs to event, posts a job
- [ ] Admin moderates the posted job

---
