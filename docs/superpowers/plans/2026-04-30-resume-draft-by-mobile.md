# Resume DRAFT by Mobile + OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an applicant return to `/apply`, enter mobile + OTP, and resume an existing DRAFT application directly at the payment screen. DRAFTs older than 1 year are auto-archived during lookup.

**Architecture:** New API route `POST /api/applications/drafts-by-mobile` that requires the signed session token returned by the existing `/api/otp/verify`. Frontend adds a Resume panel on `/apply` and the two `apply/<vertical>/form` pages accept `?appId=&tracking=` query params to skip the form into the existing `pendingApplicationId` payment view.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL via `@/lib/db`, existing MSG91-backed OTP routes, signed-session token from `@/lib/auth`.

**Spec:** `docs/superpowers/specs/2026-04-30-resume-draft-by-mobile-design.md`

**Notes from spec recon:**
- `applications.applicant_mobile` is already indexed (`idx_applications_mobile`) — skipping the composite index from the spec.
- `application_status` enum has no `EXPIRED` value; the spec's fallback applies — use `ARCHIVED` for the lazy 1-year cleanup.

---

## File Structure

**Create:**
- `frontend/src/app/api/applications/drafts-by-mobile/route.ts` — POST endpoint with token verification + lazy cleanup + draft list.
- `frontend/src/components/apply/ResumeApplicationPanel.tsx` — self-contained panel (mobile → OTP → result list).

**Modify:**
- `frontend/src/app/apply/page.tsx` — render `<ResumeApplicationPanel />` below the vertical-selection grid.
- `frontend/src/app/apply/boys-hostel/form/page.tsx` — read `?appId=&tracking=` on mount; if valid DRAFT for `BOYS_HOSTEL`, jump straight to the payment view.
- `frontend/src/app/apply/girls-ashram/form/page.tsx` — same as above for `GIRLS_ASHRAM`.

---

## Task 1: New `drafts-by-mobile` API route

**Files:**
- Create: `frontend/src/app/api/applications/drafts-by-mobile/route.ts`

- [ ] **Step 1: Read the existing session-token helper to confirm the API**

```bash
rg -n "createSignedSessionToken|verifySignedSessionToken|verifySessionToken" frontend/src/lib/auth.ts
```

Expected: a function that verifies the signed token and returns its payload (or null/throws on invalid). Use whichever export exists; if only `createSignedSessionToken` exists and there is no verifier, abort and report — the spec assumes a verifier already exists. Common names: `verifySignedSessionToken`, `verifySessionToken`, `decodeSessionToken`. Use the one that returns `{ contact, vertical, verified }` from a token previously made by `createSignedSessionToken`.

- [ ] **Step 2: Implement the route**

Create `frontend/src/app/api/applications/drafts-by-mobile/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifySignedSessionToken } from '@/lib/auth'; // ⚠ rename to whatever Step 1 confirmed

function normalizeMobile(input: string): string {
  return (input || '').replace(/\D/g, '').slice(-10);
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`drafts-by-mobile:${ip}`, { maxRequests: 10, windowSeconds: 900 });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: `Too many requests. Try again in ${rl.retryAfterSeconds}s.` }),
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Content-Type': 'application/json' } },
      );
    }

    const body = await request.json();
    const mobile = normalizeMobile(body.mobile);
    const sessionToken: string = body.sessionToken;

    if (!mobile || mobile.length !== 10) return badRequestResponse('Valid 10-digit mobile is required');
    if (!sessionToken) return badRequestResponse('sessionToken is required');

    const payload = verifySignedSessionToken(sessionToken);
    if (!payload || payload.verified !== true) return unauthorizedResponse('Invalid session');
    if (normalizeMobile(payload.contact) !== mobile) return unauthorizedResponse('Session does not match mobile');

    // Lazy cleanup: archive DRAFTs older than 1 year for this mobile.
    await query(
      `UPDATE applications
          SET current_status = 'ARCHIVED'
        WHERE applicant_mobile = $1
          AND current_status = 'DRAFT'
          AND created_at < NOW() - INTERVAL '1 year'`,
      [mobile],
    );

    const { rows } = await query(
      `SELECT id, tracking_number, vertical, created_at
         FROM applications
        WHERE applicant_mobile = $1
          AND current_status = 'DRAFT'
        ORDER BY created_at DESC`,
      [mobile],
    );

    return successResponse(
      rows.map((r) => ({
        id: r.id,
        trackingNumber: r.tracking_number,
        vertical: r.vertical,
        createdAt: r.created_at,
      })),
    );
  } catch (error: any) {
    console.error('Error in POST /api/applications/drafts-by-mobile:', error);
    return serverErrorResponse('Failed to look up drafts', error);
  }
}
```

- [ ] **Step 3: Confirm `unauthorizedResponse` exists**

```bash
rg -n "unauthorizedResponse" frontend/src/lib/api/responses.ts
```

If absent, replace those calls with `errorResponse('...', 401)` (and import `errorResponse` instead).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/applications/drafts-by-mobile/route.ts
git commit -m "feat(applications): add drafts-by-mobile lookup with lazy 1yr cleanup"
```

---

## Task 2: Form pages accept `?appId=&tracking=` to skip into payment

**Files:**
- Modify: `frontend/src/app/apply/boys-hostel/form/page.tsx`
- Modify: `frontend/src/app/apply/girls-ashram/form/page.tsx`

- [ ] **Step 1: Boys hostel — read query params and pre-fill payment state**

In `frontend/src/app/apply/boys-hostel/form/page.tsx`, find the existing `useEffect` that calls `loadDraft` (around line 23). Add a separate `useEffect` directly **after** that one:

```tsx
import { useSearchParams } from 'next/navigation';
// ... inside the component:
const searchParams = useSearchParams();

useEffect(() => {
  const appId = searchParams.get('appId');
  const tracking = searchParams.get('tracking');
  if (!appId || !tracking) return;
  let cancelled = false;
  (async () => {
    try {
      const res = await fetch(`/api/applications/${appId}`);
      const json = await res.json();
      const app = json?.data;
      if (!cancelled && app && app.current_status === 'DRAFT' && app.vertical === 'BOYS_HOSTEL') {
        setPendingApplicationId(appId);
        setPendingTrackingNumber(tracking);
      }
    } catch {
      // ignore — show full form
    }
  })();
  return () => {
    cancelled = true;
  };
}, [searchParams]);
```

If `useSearchParams` is already imported, skip that import line.

- [ ] **Step 2: Girls ashram — same change with `GIRLS_ASHRAM` check**

In `frontend/src/app/apply/girls-ashram/form/page.tsx`, repeat the change but with `app.vertical === 'GIRLS_ASHRAM'`.

- [ ] **Step 3: Manual smoke test (no automation here — UI behaviour)**

Pick any DRAFT application from your DB:

```sql
SELECT id, tracking_number, vertical FROM applications
 WHERE current_status='DRAFT' AND vertical='BOYS_HOSTEL'
 ORDER BY created_at DESC LIMIT 1;
```

Open `http://localhost:3000/apply/boys-hostel/form?appId=<id>&tracking=<tracking>`. The form should NOT render — the payment screen should render directly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/apply/boys-hostel/form/page.tsx frontend/src/app/apply/girls-ashram/form/page.tsx
git commit -m "feat(apply): jump to payment when ?appId=&tracking= query params point to a DRAFT"
```

---

## Task 3: `ResumeApplicationPanel` component

**Files:**
- Create: `frontend/src/components/apply/ResumeApplicationPanel.tsx`

- [ ] **Step 1: Implement the panel**

Create `frontend/src/components/apply/ResumeApplicationPanel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/forms/Input';
import { Button } from '@/components/shadcn/button-extended';
import { useLanguage } from '@/contexts/LanguageContext';

interface DraftSummary {
  id: string;
  trackingNumber: string;
  vertical: 'BOYS_HOSTEL' | 'GIRLS_ASHRAM' | 'DHARAMSHALA';
  createdAt: string;
}

const VERTICAL_PATH: Record<string, string> = {
  BOYS_HOSTEL: 'boys-hostel',
  GIRLS_ASHRAM: 'girls-ashram',
  DHARAMSHALA: 'dharamshala',
};

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function ResumeApplicationPanel() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState<'mobile' | 'otp' | 'list'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalizedMobile(): string {
    return mobile.replace(/\D/g, '').slice(-10);
  }

  async function handleSendOtp() {
    setError(null);
    const m = normalizedMobile();
    if (m.length !== 10 || !/^[6-9]/.test(m)) {
      setError(t('Enter a valid 10-digit mobile starting 6-9.', 'कृपया 6-9 से शुरू होने वाला 10 अंकों का मोबाइल दर्ज करें।'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: m, vertical: 'resume' }),
      });
      const json = await res.json();
      if (!res.ok || !json?.token) {
        throw new Error(json?.message || 'Failed to send OTP');
      }
      setOtpToken(json.token);
      setStep('otp');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    if (!/^\d{4,6}$/.test(otp)) {
      setError(t('Enter the OTP you received.', 'प्राप्त ओटीपी दर्ज करें।'));
      return;
    }
    setBusy(true);
    try {
      const verifyRes = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp, token: otpToken }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok || !verifyJson?.sessionToken) {
        throw new Error(verifyJson?.message || 'OTP verification failed');
      }
      const session: string = verifyJson.sessionToken;
      setSessionToken(session);

      const draftsRes = await fetch('/api/applications/drafts-by-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: normalizedMobile(), sessionToken: session }),
      });
      const draftsJson = await draftsRes.json();
      if (!draftsRes.ok) {
        throw new Error(draftsJson?.error || 'Could not look up your application');
      }
      const list: DraftSummary[] = draftsJson?.data || [];
      if (list.length === 0) {
        setStep('list');
        setDrafts([]);
        return;
      }
      if (list.length === 1) {
        const d = list[0];
        router.push(`/apply/${VERTICAL_PATH[d.vertical]}/form?appId=${d.id}&tracking=${d.trackingNumber}`);
        return;
      }
      setDrafts(list);
      setStep('list');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function gotoDraft(d: DraftSummary) {
    router.push(`/apply/${VERTICAL_PATH[d.vertical]}/form?appId=${d.id}&tracking=${d.trackingNumber}`);
  }

  return (
    <div className="card">
      <div className="p-6 md:p-8">
        <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('Resume your application', 'अपना आवेदन फिर से शुरू करें')}
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t(
            'Already submitted but did not pay? Verify your mobile to jump back to the payment step.',
            'पहले आवेदन कर चुके हैं पर भुगतान नहीं किया? भुगतान पर लौटने के लिए अपना मोबाइल सत्यापित करें।',
          )}
        </p>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg border-l-4"
            style={{ backgroundColor: 'var(--color-red-50, #fef2f2)', borderLeftColor: 'var(--color-red-500, #ef4444)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--color-red-700, #b91c1c)' }}>{error}</p>
          </div>
        )}

        {step === 'mobile' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label={t('Mobile number', 'मोबाइल नंबर')}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9876543210"
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <Button variant="primary" onClick={handleSendOtp} disabled={busy} loading={busy}>
              {t('Send OTP', 'ओटीपी भेजें')}
            </Button>
          </div>
        )}

        {step === 'otp' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label={t(`OTP sent to ${normalizedMobile()}`, `${normalizedMobile()} पर भेजा गया OTP`)}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <Button variant="primary" onClick={handleVerifyOtp} disabled={busy} loading={busy}>
              {t('Verify & resume', 'सत्यापित करें')}
            </Button>
          </div>
        )}

        {step === 'list' && drafts.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('No saved application found for this mobile. Start a new one above.', 'इस मोबाइल के लिए कोई सहेजा हुआ आवेदन नहीं मिला। ऊपर नया प्रारंभ करें।')}
          </p>
        )}

        {step === 'list' && drafts.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('Pick the application you want to pay for:', 'जिस आवेदन का भुगतान करना है उसे चुनें:')}
            </p>
            {drafts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => gotoDraft(d)}
                className="text-left p-3 rounded-lg border hover:bg-gray-50"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {d.vertical === 'BOYS_HOSTEL'
                    ? t('Boys Hostel', 'बालक छात्रावास')
                    : d.vertical === 'GIRLS_ASHRAM'
                    ? t('Girls Ashram', 'बालिका आश्रम')
                    : t('Dharamshala', 'धर्मशाला')}
                  {' — '}
                  <span className="font-mono">{d.trackingNumber}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t(`Started ${relativeDays(d.createdAt)}`, `${relativeDays(d.createdAt)} शुरू किया गया`)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/apply/ResumeApplicationPanel.tsx
git commit -m "feat(apply): add ResumeApplicationPanel component"
```

---

## Task 4: Mount the Resume panel on `/apply`

**Files:**
- Modify: `frontend/src/app/apply/page.tsx`

- [ ] **Step 1: Identify the right insertion point**

Read `frontend/src/app/apply/page.tsx`. Find the closing tag of the vertical-cards grid (search for "Vertical Selection Cards" comment, then locate the `</div>` that ends that grid). The Resume panel should render immediately AFTER that grid block, still inside the same `main` content area.

- [ ] **Step 2: Add the import + render**

Add at the top:

```tsx
import { ResumeApplicationPanel } from '@/components/apply/ResumeApplicationPanel';
```

Below the vertical grid's closing `</div>`, before the closing `</main>`, add a wrapper:

```tsx
<div className="mt-10 max-w-3xl mx-auto">
  <ResumeApplicationPanel />
</div>
```

If the page has its own max-width wrapper around the grid, match that width by adjusting `max-w-3xl` accordingly.

- [ ] **Step 3: Manual smoke test**

1. `npm run dev`, open `/apply`. The Resume panel should render below the vertical cards, styled like a card (white background, rounded, same padding).
2. Enter a real mobile that has at least one DRAFT application in the DB. Click "Send OTP". You should receive an SMS via MSG91 (test mode if configured).
3. Enter the OTP. With one DRAFT → automatic redirect to `/apply/<vertical>/form?appId=…&tracking=…` and the form is skipped, payment view shown.
4. With two+ DRAFTs (manually create another to test) → list rendered; click one → same behavior.
5. With zero DRAFTs → "No saved application found" message.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/apply/page.tsx
git commit -m "feat(apply): mount Resume panel on /apply landing"
```

---

## Task 5: Final build sanity

- [ ] **Step 1: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS. Common gotcha: if `verifySignedSessionToken` doesn't exist, Task 1 should have caught it; otherwise tsc will fail here and you should revisit Task 1.

- [ ] **Step 2: Run any existing tests still relevant**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && cd frontend && npx vitest run
```

Expected: previously-passing tests still pass. No new tests are required for this feature — UI flow is exercised manually in Task 4 Step 3.
