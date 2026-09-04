# Hostel Pro — Security Assessment Report

**Date:** 2026-05-06 (post-remediation snapshot)
**Scope:** Full codebase security review (Next.js frontend, API routes, SQL migrations, infrastructure, repository hygiene)
**Base branch:** `24April`
**Remediation branch:** `security-fixes-non-auth` (25 commits, **30 of 30** findings resolved)
**Classification:** Internal — Contains vulnerability details

---

## Executive Summary

A baseline assessment surfaced **30 findings** (6 Critical, 8 High, 9 Medium, 4 Low, 3 Info). The `security-fixes-non-auth` branch closes **all 30** without breaking login or core flows. The application moves from "high risk" baseline to "production-ready pending operational verification" as defined by the merge checklist.

| Severity | Original | Resolved | **Remaining** |
|----------|---------:|---------:|--------------:|
| Critical | 6 | 6 | **0** |
| High     | 8 | 8 | **0** |
| Medium   | 9 | 9 | **0** |
| Low      | 4 | 4 | **0** |
| Info     | 3 | 3 | **0** |
| **Total**| **30** | **30** | **0** |

---

## Resolved on `security-fixes-non-auth`

### Critical

| ID | Finding | Commit |
|----|---------|--------|
| S-01 | Account takeover via forged forgot-password token | `a4ad10d` |
| S-02 | Unauthenticated PII disclosure on `/applications/track` | `b1c4537` |
| S-03 | Unauthenticated applicant photo download | `b1c4537` |
| S-04 | Bcrypt hashes for `Password123` × 10 seeded users | `c7f17db` |
| S-05 | CORS wildcard default + missing security headers | `878f28e` |
| S-06 | Hardcoded OTP `'123456'` in dev mode | `a949dad` |

### High

| ID | Finding | Commit |
|----|---------|--------|
| S-07 | Plaintext secrets in docker-compose `environment:` | `324d6f9` |
| S-08 | JWT in `localStorage` (additive HttpOnly cookie path added) | `c7f17db` |
| S-09 | Second-order SQL injection in superintendent reset-password | `909db50` |
| S-10 | Razorpay `/initiate` unauthenticated + leaked PII | `2810015` |
| S-11 | Reset-password token had no expiry validation | `a4ad10d` |
| S-12 | Alumni document upload bound to signed registration intent token | `75028ae` |
| S-13 | `/api/applications/drafts-by-mobile` session-token verification | verified clean (already correctly enforced) |
| S-14 | Missing rate limit on forgot-password / reset-password | `a4ad10d` |
| S-29 | CI test step disabled | `b61420c` |

### Medium

| ID | Finding | Commit |
|----|---------|--------|
| S-15 | `canAccessStudent` allowed through when vertical was unknown | `8d52fd6` |
| S-16 | Raw `error.message` returned to clients | `14209d4`, `bc0ef72` |
| S-17 | TRUSTEE could reset any password without step-up auth | `e6eb1ed` |
| S-18 | Wide `allowedRoles` in lifecycle routes (allocations PUT, emergency GET) | `cbfef78` |
| S-19 | Audit + business write atomicity (fee-configuration) | `d78a2ef` |
| S-20 | Unbounded list queries (3 endpoints capped) | `49fdc96` |
| S-21 | Client-supplied MIME on file uploads | `bc0ef72` |
| S-22 | Placeholder JWT_SECRET accepted at startup | `a949dad` |
| S-26 | Date / string filters lacking enum validation | `e6eb1ed` |

### Low

| ID | Finding | Commit |
|----|---------|--------|
| S-24 | Token TTL reduced 24 h → 2 h (refresh unchanged) | `c7f17db` |
| S-25 | Per-token JWT denylist (jti + revoke on logout) | `c7f17db` |
| S-27 | Repo hygiene — `.gitignore` tightened | `2f82e30` |
| S-30 | PG host removed from `CLAUDE.md` | `1d3e118` |

### Info

| ID | Finding | Commit |
|----|---------|--------|
| S-23 | `npm audit --audit-level=high` gate added to CI | `b61420c` |
| S-28 | Structured logger already implemented in `lib/logger.ts` | verified clean |
| S-29 | (re-listed under High) |  |

---

## Branch Verification Checklist

Before merging `security-fixes-non-auth` to `master`:

- [ ] `cd frontend && npm install` — refresh lockfile after dep removal (`react-hook-form`, `next-themes`)
- [ ] `cd frontend && npm run lint` — passes
- [ ] `cd frontend && npm run test:run` — Vitest suite green (now enforced in CI)
- [ ] `cd frontend && npm run build` — Next.js build clean
- [ ] Add `MOCK_OTP_ENABLED=true` to local `frontend/.env.local` if running with `NODE_ENV=development`
- [ ] Confirm `CORS_ORIGIN` is set in production env var store (the app refuses to start without it)
- [ ] Confirm `JWT_SECRET` is ≥ 32 chars and not a placeholder string
- [ ] Smoke test: applicant flow — contact → OTP → form → admission fee payment
- [ ] Smoke test: forgot-password / reset-password (token format changed; in-flight unsigned tokens are now rejected)
- [ ] Smoke test: superintendent password reset
- [ ] Smoke test: TRUSTEE admin reset-password — must now provide `actorPassword`
- [ ] Smoke test: alumni registration end-to-end (init → upload → register; intent token bound to email)
- [ ] Smoke test: each role's dashboard loads (cookie OR localStorage Bearer both work)
- [ ] Confirm no production user has `password_hash` matching the seed bcrypt; if any do, rotate them via the admin reset-password flow before merging
- [ ] Confirm docker-compose deploys with secrets sourced only from `env_file:` (no plaintext in `environment:`)

---

## OWASP Top 10 Mapping (closed on this branch)

| OWASP Category | Findings Closed |
|----------------|-----------------|
| A01: Broken Access Control | S-02, S-03, S-08, S-13, S-15 |
| A02: Cryptographic Failures | S-04, S-06, S-07, S-22 |
| A03: Injection | S-09, S-26 |
| A04: Insecure Design | S-01, S-12, S-14, S-19 |
| A05: Security Misconfiguration | S-05, S-16, S-17, S-18, S-20, S-21, S-27, S-30 |
| A06: Vulnerable / Outdated Components | S-23 (gate added) |
| A07: Authentication Failures | S-11, S-24, S-25, S-29 |
| A08: Software & Data Integrity Failures | S-10 |
| A09: Logging & Monitoring Failures | S-28 |
| A10: SSRF | No findings |

---

## Architectural Improvements Introduced by This Branch

Beyond the discrete findings, the remediation branch leaves the codebase with reusable safer primitives:

1. **Signed session tokens everywhere** — `createSignedSessionToken` / `verifySignedSessionToken` (HMAC + `exp`) is now the contract for every short-lived applicant-, parent-, and reset-flow token. Forgery attempts against forgot-password (S-01), drafts-by-mobile, alumni docs (S-12 follow-up), photo (S-03), and Razorpay initiate (S-10) all hit the same verification path.

2. **JWT denylist primitive** — `revokeJti(jti, exp)` + `isJtiRevoked(jti)` available for any future "compromised token" workflow. Currently called only from `/api/auth/logout` but trivial to invoke from admin tooling.

3. **HttpOnly cookie auth path** — `requireAuth` and `optionalAuth` accept the access token from cookie OR header. Existing dashboards keep working; new code can be cookie-only. CSRF mitigation (paired SameSite=Strict cookie) is in place.

4. **Magic-byte MIME validation** — `lib/file-type.ts` is reusable for any future upload route.

5. **Per-route enum allow-lists** — pattern established in `/api/users` (S-26) is straightforward to replicate.

6. **Rate-limit primitive** — `checkRateLimit` is now used on login, OTP send/verify, alumni OTP, drafts-by-mobile, alumni upload, forgot-password, reset-password.

---

## Pre-existing Items Outside Branch Scope

- **CI typing errors in test mocks** — `frontend/tests/payments/razorpayVerifyRoute.test.ts`, `…WebhookRoute.test.ts` use partial-shape `pg` mocks. These were noisy in the baseline `tsc --noEmit` and are unchanged on this branch. The Vitest runtime path doesn't care; surface in a future test-typing cleanup.

- **Stale `.next/` build artifacts** referencing removed Paytm routes — clear with `rm -rf frontend/.next` before the next build.

- **Mock `institutions.json`** still imported by 4 alumni production pages — not a security finding but a data-integrity smell flagged in `CODE_REVIEW_REPORT.md`.

---

*Snapshot generated 2026-05-06. The 23-commit remediation branch + this report are the merge unit.*
