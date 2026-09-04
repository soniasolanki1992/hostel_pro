# Resume DRAFT Application by Mobile + OTP — Design

**Date:** 2026-04-30
**Status:** Approved (pending user spec review)

## Goal

Let an applicant who already created a DRAFT application (form submitted, payment not completed) come back, identify themselves with mobile + OTP on `/apply`, and resume directly at the payment step. Drafts older than one year are marked `EXPIRED` and excluded from resume.

## Flow

1. On `/apply`, below the vertical cards, render a **"Resume your application"** panel.
2. User enters 10-digit mobile → "Send OTP" → existing `POST /api/otp/send` (MSG91, rate-limited).
3. User enters OTP → "Verify" → existing `POST /api/otp/verify` returns a signed session token.
4. Frontend calls new `POST /api/applications/drafts-by-mobile` with mobile + signed session token. Server:
   - Verifies the session token (must be `verified: true` and `contact` matches the mobile).
   - Marks any DRAFTs for this mobile older than 1 year as `EXPIRED` (lazy cleanup).
   - Returns the remaining DRAFTs ordered by `created_at DESC`.
5. Frontend behaviour by result count:
   - **0 drafts** → friendly "No saved application found. Start a new one above."
   - **1 draft** → auto-redirect to `/apply/<vertical>/form?appId=<uuid>&tracking=<number>`.
   - **2+ drafts** → render a list ("Boys Hostel — BH-2026-00042, started 5 days ago"); user picks → redirect to the same form URL.
6. The form page reads `?appId` + `?tracking` on mount; if present and the application is DRAFT for the matching vertical, it sets `pendingApplicationId` / `pendingTrackingNumber` and renders the existing payment view directly.

## Files

### New
- `frontend/src/app/api/applications/drafts-by-mobile/route.ts` — POST. Body: `{ mobile, sessionToken }`. Returns `{ data: [{ id, tracking_number, vertical, created_at }] }` or 401 if token invalid / mobile mismatch. Lazy-marks expired drafts in the same handler.

### Modified
- `frontend/src/app/apply/page.tsx` — add the **Resume** panel component (mobile input → OTP step → result handling). Reuses `/api/otp/send` and `/api/otp/verify`. Visually consistent with the existing vertical cards (same `card` class, same theme tokens).
- `frontend/src/app/apply/boys-hostel/form/page.tsx` — on mount, read `?appId` + `?tracking` from URL. If both present, fetch `GET /api/applications/<id>` to confirm it is DRAFT and `vertical = BOYS_HOSTEL`; if so, set `pendingApplicationId` / `pendingTrackingNumber` to skip the form and render the payment view. If not DRAFT or vertical mismatch, ignore params and show full form.
- `frontend/src/app/apply/girls-ashram/form/page.tsx` — same as above for `GIRLS_ASHRAM`.

## Database

No schema change. The `applications` table already has `applicant_mobile`, `current_status`, `vertical`, `tracking_number`, `created_at`. Add a single index for the new lookup hot path:

```sql
CREATE INDEX IF NOT EXISTS idx_applications_mobile_status
  ON applications(applicant_mobile, current_status);
```

This goes in `sql/001_create_schema.sql` (or a new migration if migrations are tracked separately — confirm during implementation).

## Lazy Cleanup of Stale DRAFTs

Inside `drafts-by-mobile`, before the SELECT, run:

```sql
UPDATE applications
   SET current_status = 'EXPIRED'
 WHERE applicant_mobile = $1
   AND current_status = 'DRAFT'
   AND created_at < NOW() - INTERVAL '1 year';
```

Then SELECT only `current_status = 'DRAFT'`. This keeps the rule colocated with the only place it matters (resume) without needing a scheduled job. Drafts that nobody tries to resume sit untouched, which is acceptable — they cause no harm.

The `EXPIRED` enum value must already exist in `transaction_status`/`current_status` enums; if `current_status` doesn't have `EXPIRED`, fall back to `ARCHIVED` (which the spec for the project lists). Confirm during implementation; pick whichever value the existing `application_status` enum supports.

## Security / Authorisation

- The new route requires a signed session token from `/api/otp/verify`. The route MUST verify `verified === true` and `contact` (10-digit) equals the submitted mobile. Reject otherwise with 401.
- `applicant_mobile` may have been stored with country prefix or whitespace — normalise both sides (strip non-digits, take last 10) before comparison.
- Rate limit the new route per IP (e.g. 10 req / 15 min) using the existing `checkRateLimit` helper to deter enumeration after a leaked token.

## UI

- Resume panel uses the same `card` class + padding as the vertical-selection cards.
- Inputs use the project's `Input` component; primary button uses `<Button variant="primary">`.
- Two-step state machine inside the panel: `'mobile'` → `'otp'` → `'result'`. Mirrors the pattern in `/track/page.tsx`.
- Multi-draft list: each row shows vertical (translated label), tracking number, and a relative timestamp ("3 days ago"). Click → navigate.
- Show validation errors inline (invalid mobile, wrong OTP, expired token, no drafts found).

## Out of Scope

- Resuming pre-submit (in-progress form fields). DRAFTs in this design always have a fully filled form server-side; we only resume to the payment step.
- Editing a resumed DRAFT before paying.
- Scheduled cron-driven cleanup (lazy cleanup is sufficient).
- Dharamshala — that vertical does not gate on payment, so it has no payment-resume use case.
