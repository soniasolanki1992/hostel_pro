# WhatsApp OTP — forgot-password follow-up

WhatsApp OTP (via Twilio) was added to the guest-facing flows that share the
unified `/api/otp/*` endpoints: the three apply contact pages (boys / girls /
dharamshala), parent login, and application tracking. Users pick the delivery
channel (SMS / WhatsApp / Email) explicitly.

The **forgot-password / reset-password** flow was intentionally left out of that
change because it uses a *different* OTP mechanism and has two pre-existing
defects that must be fixed before WhatsApp can be wired in safely.

## Pre-existing defects (unrelated to WhatsApp)

1. **Field-name mismatch.** The UI
   (`frontend/src/app/login/forgot-password/page.tsx`) POSTs `{ identifier }`,
   but the route (`frontend/src/app/api/auth/forgot-password/route.ts`) reads
   `body.contact`. With `contact` undefined, validation fails — the flow cannot
   succeed as written.

2. **Generation/verification split.** `forgot-password` delivers the OTP via
   MSG91 (`sendOtp`), where MSG91 generates its own code. But
   `reset-password` (`frontend/src/app/api/auth/reset-password/route.ts`)
   verifies with the **DB-backed** `verifyOtp(contact, otp, 'password_reset')`
   from `lib/auth.ts`, reading the `otp_verifications` table — which
   `forgot-password` never writes to (it never calls `createOtp`). So the
   delivered code can never match what `reset-password` checks.

## How to add WhatsApp here later

The clean fix makes `forgot-password` self-consistent with `reset-password`:

1. Fix the UI to send `{ contact: identifier, channel }` and add an
   SMS / WhatsApp / Email channel picker.
2. In `forgot-password`, generate + persist the code via
   `createOtp(userContact, 'password_reset')` (already in `lib/auth.ts`), then
   deliver it:
   - `channel === 'whatsapp'` → `sendWhatsappOtp(userContact, otp, 'reset')`
     (`lib/twilio-whatsapp.ts`)
   - `channel === 'sms'`/`'email'` → MSG91 / SMTP
   Because `reset-password` already verifies against the DB via `verifyOtp`,
   routing all channels through `createOtp` makes the whole flow correct.

No new infrastructure is needed — `lib/twilio-whatsapp.ts` and the Twilio env
vars (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`,
`TWILIO_WHATSAPP_OTP_CONTENT_SID`) are already in place.
