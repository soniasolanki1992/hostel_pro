# Hostel Pro — Code Review Report

**Date:** 2026-05-05
**Scope:** Full codebase (`frontend/src/app`, `frontend/src/components`, `frontend/src/lib`, `frontend/src/contexts`, infrastructure, CI/CD, SQL)
**Branch reviewed:** `24April`
**Stack:** Next.js 16 App Router (TypeScript) + custom JWT/bcrypt/OTP auth + raw PostgreSQL via `pg` + local `uploads/` storage + nodemailer
**Architecture:** Single-tier Next.js (the legacy NestJS `backend/` and `supabase/` directories have been removed; `sql/` is now the sole migration source).

---

## Executive Summary

Hostel Pro is a multi-role hostel-management platform (applicants, residents, parents, superintendents, trustees, accounts) implemented as a single-tier Next.js application. The auth/authz primitives (`lib/auth.ts`, `lib/authorize.ts`) are well-designed (bcrypt rounds 12, HMAC-signed session tokens, `is_active` JWT revocation, role-based gates). Role-to-UI mapping is consistent. However, the project carries significant structural debt: extreme code duplication (141+ instances of the same `requireAuth`/try-catch boilerplate), six pages exceeding 1,200 lines, 14 reimplementations of `formatDate`, mock JSON imported by production alumni pages, 775 raw `useState`/`useEffect` calls with zero React-Query usage, inconsistent API response shapes, 11+ unbounded list endpoints, and 81 routes lacking transactions for multi-statement writes. CI has tests disabled. A targeted refactor program covering ~40 pages and ~10 lib modules would lift the codebase from "functional prototype" to "production-grade."

**Overall Quality Rating: 5/10** — Functional with significant structural debt; recent cleanup (NestJS backend + Supabase scaffolds removed, dead deps trimmed, single migration history) has materially improved the baseline.

---

## 1. Architecture

### Backend (Next.js API routes)

| Aspect | Assessment |
|--------|-----------|
| Layering | Routes → `lib/db.ts` (raw `pg` pool) + `lib/authorize.ts`. No service/repository layer — each route inlines its SQL. |
| Auth | Custom JWT (HS256) + bcrypt + OTP. Tokens carried in `Authorization: Bearer …` header. `is_active` flag invalidates JWTs at next verification. |
| Database access | Single shared pool (size 20) in `lib/db.ts`. Helpers: `query(sql, params)`, `withTransaction(fn)`. |
| Audit | Audit log inserts inlined in each route (15+ near-duplicate INSERTs). No service abstraction. |
| Rate limiting | In-memory sliding window in `lib/rate-limit.ts`. Used on login + OTP routes only. |
| File storage | Local `uploads/` directory via `lib/storage.ts` (UUID-prefixed names + `realpath` traversal guard). |
| Payments | Razorpay client + server libs (`lib/payments/razorpay.ts`) with HMAC signature verification. |

**Strengths:**
- Clean separation between auth helpers and route handlers.
- `withTransaction` pattern in `lib/db.ts:26-41` is correct.
- Correct use of `crypto.timingSafeEqual` for Razorpay signature verification.
- Single migration history under `sql/` (legacy `backend/migrations/` and `supabase/migrations/` removed).

**Weaknesses:**
- **No service/repository layer** — every route hand-rolls SQL. ~88 routes × ~5 SQL statements each = ~440 raw queries scattered across the codebase.
- **No centralized error handler** — each route implements identical try/catch boilerplate (83 instances of `if (error instanceof NextResponse) return error;` re-throws).
- **No request tracing** — no X-Request-ID, no correlation IDs in logs.
- **No request validation library** (zod, yup) — 40+ routes accept input with no validation at all (see §6).

### Frontend (Next.js App Router + TypeScript)

| Aspect | Assessment |
|--------|-----------|
| State | 775 raw `useState`/`useEffect` instances across `app/` and `components/`. |
| Data fetching | Native `fetch` with manual loading/error state. No React Query (not installed). |
| Routing | App Router with role-based dashboard pages under `app/dashboard/{role}/`. |
| Component library | shadcn under `components/shadcn/`, custom feature components under `components/{audit,documents,exit,fees,forms,renewal,...}/`. |
| Auth state | JWT in `localStorage`. 86 instances of `Bearer ${localStorage.getItem('authToken')}`. |
| i18n | `LanguageContext` supplies EN/HI translations. |
| Error boundaries | 3 total: `app/error.tsx`, `app/global-error.tsx`, `app/dashboard/error.tsx`. No nested boundaries. |
| Code splitting | Zero `next/dynamic` usage. All routes eagerly bundled. |

**Strengths:**
- Consistent dashboard layout via [app/dashboard/template.tsx](frontend/src/app/dashboard/template.tsx).
- Existing utility hub at [frontend/src/components/utils.ts](frontend/src/components/utils.ts) (`formatCurrency` at line 40, `formatDate` at line 48).

**Weaknesses:**
- The shared `formatDate`/`formatCurrency` helpers exist but are imported sparingly — most pages reimplement them locally (see §2).
- Service layer is plain JS in some areas; types are sometimes redeclared per page.
- No code splitting — initial bundle includes 1,200+ line form pages even on the landing page.

---

## 2. Code Duplication

### Backend

| Duplicated Logic | Locations | Impact |
|-----------------|-----------|--------|
| `requireAuth` + try/catch + `serverErrorResponse` | **141 instances** across ~88 route files. Examples: [api/fees/route.ts:87](frontend/src/app/api/fees/route.ts#L87), [api/users/route.ts:16](frontend/src/app/api/users/route.ts#L16), [api/fee-configuration/route.ts:59,107,161](frontend/src/app/api/fee-configuration/route.ts#L59) (3× in same file) | Boilerplate dwarfs business logic; refactor with a `withAuth(roles, handler)` wrapper would remove ~600 LOC. |
| Audit-log INSERT statement | **15+ near-identical INSERTs** at [api/fee-configuration/route.ts:87-90](frontend/src/app/api/fee-configuration/route.ts#L87-L90) (×3), [api/fees/route.ts:136-150](frontend/src/app/api/fees/route.ts#L136-L150), [api/clearance-items/bulk/route.ts:71-77](frontend/src/app/api/clearance-items/bulk/route.ts#L71-L77), [api/clearance-items/[id]/route.ts:49-58](frontend/src/app/api/clearance-items/[id]/route.ts#L49-L58), [api/payments/razorpay/webhook/route.ts:11-14](frontend/src/app/api/payments/razorpay/webhook/route.ts#L11-L14), [api/config/notification-rules/route.ts:90-98](frontend/src/app/api/config/notification-rules/route.ts#L90-L98) | Schema drift risk; one missed column = silent audit gap. Extract `recordAuditLog(entityType, entityId, action, …)` helper. |
| Vertical filter conditional | **8+ copies**: [api/users/route.ts:32-37](frontend/src/app/api/users/route.ts#L32-L37), [api/leaves/route.ts:35-39](frontend/src/app/api/leaves/route.ts#L35-L39), [api/applications/route.ts:29-33](frontend/src/app/api/applications/route.ts#L29-L33), [api/rooms/route.ts:30-36](frontend/src/app/api/rooms/route.ts#L30-L36), [api/allocations/route.ts:43-46](frontend/src/app/api/allocations/route.ts#L43-L46), [api/superintendent/reset-password/route.ts:32-38](frontend/src/app/api/superintendent/reset-password/route.ts#L32-L38) | One copy uses string interpolation (S-09 in security report); extract `applyVerticalFilter(conditions, params, user, override?)`. |
| Dynamic SQL builder (`setField` helper) | **12+ near-identical implementations**: [api/fee-configuration/route.ts:119-130](frontend/src/app/api/fee-configuration/route.ts#L119-L130), [api/config/leave-types/route.ts:140-165](frontend/src/app/api/config/leave-types/route.ts#L140-L165), [api/fees/route.ts:109-128](frontend/src/app/api/fees/route.ts#L109-L128), [api/rooms/route.ts:153-170](frontend/src/app/api/rooms/route.ts#L153-L170), [api/allocations/[id]/route.ts:85-115](frontend/src/app/api/allocations/[id]/route.ts#L85-L115), [api/interviews/[id]/route.ts:83-106](frontend/src/app/api/interviews/[id]/route.ts#L83-L106) | Extract a single `buildPartialUpdate(table, allowedColumns, body, idColumn, idValue)` utility. |
| `SELECT *` queries | **20+ instances**: [api/users/route.ts:23](frontend/src/app/api/users/route.ts#L23), [api/rooms/route.ts:48](frontend/src/app/api/rooms/route.ts#L48), [api/applications/route.ts:51](frontend/src/app/api/applications/route.ts#L51), [api/fee-configuration/route.ts:41](frontend/src/app/api/fee-configuration/route.ts#L41), [api/fees/route.ts:39](frontend/src/app/api/fees/route.ts#L39) | Returning ALL columns leaks new columns by default (e.g., a future `password_hash` reset_token). Project explicit columns. |

### Frontend

| Duplicated Logic | Locations | Impact |
|-----------------|-----------|--------|
| `formatCurrency()` | **Master:** [components/utils.ts:40](frontend/src/components/utils.ts#L40). **Local duplicate:** [components/exit/AlumniProfilePage.tsx:49](frontend/src/components/exit/AlumniProfilePage.tsx#L49). | Master exists but is imported sparingly. |
| `formatDate()` / `formatDateTime()` | **14 reimplementations:** [app/alumni/events/page.tsx:48](frontend/src/app/alumni/events/page.tsx#L48), [app/alumni/admin/page.tsx:109](frontend/src/app/alumni/admin/page.tsx#L109), [app/alumni/jobs/page.tsx:46](frontend/src/app/alumni/jobs/page.tsx#L46), [components/renewal/AdminRenewalDetail.tsx:111](frontend/src/components/renewal/AdminRenewalDetail.tsx#L111), [components/audit/CommunicationLogTable.tsx:103](frontend/src/components/audit/CommunicationLogTable.tsx#L103), [components/audit/ConsentLogsView.tsx:107](frontend/src/components/audit/ConsentLogsView.tsx#L107), [components/exit/ExitCertificateTemplate.tsx:39](frontend/src/components/exit/ExitCertificateTemplate.tsx#L39), [components/audit/ApprovalHistoryTable.tsx:83](frontend/src/components/audit/ApprovalHistoryTable.tsx#L83), [components/exit/AlumniStayHistory.tsx:17](frontend/src/components/exit/AlumniStayHistory.tsx#L17), [components/exit/AlumniContactEditor.tsx:52](frontend/src/components/exit/AlumniContactEditor.tsx#L52), [components/exit/AlumniProfilePage.tsx:41](frontend/src/components/exit/AlumniProfilePage.tsx#L41), [components/documents/DocumentPrintView.tsx:55](frontend/src/components/documents/DocumentPrintView.tsx#L55), [components/documents/UndertakingPrintView.tsx:53](frontend/src/components/documents/UndertakingPrintView.tsx#L53), [components/communication/MessageLog.tsx:101](frontend/src/components/communication/MessageLog.tsx#L101). Master at [components/utils.ts:48](frontend/src/components/utils.ts#L48). | Each copy formats slightly differently (locale, ordering, am/pm). UI inconsistency across screens. |
| `Authorization: Bearer ${token}` injection | **86 instances** across dashboard pages. Examples: [app/dashboard/template.tsx:71](frontend/src/app/dashboard/template.tsx#L71), [app/dashboard/trustee/page.tsx:52](frontend/src/app/dashboard/trustee/page.tsx#L52), [app/dashboard/trustee/residents/page.tsx:56](frontend/src/app/dashboard/trustee/residents/page.tsx#L56) | Centralize in an `apiClient.ts` (also enables future cookie-based auth without per-page rewrites — see security report S-08). |
| Large inline form pages with embedded validation | [app/apply/boys-hostel/form/page.tsx](frontend/src/app/apply/boys-hostel/form/page.tsx) (1,436 lines), [app/apply/dharamshala/form/page.tsx](frontend/src/app/apply/dharamshala/form/page.tsx) (1,357 lines), [app/apply/girls-ashram/form/page.tsx](frontend/src/app/apply/girls-ashram/form/page.tsx) (1,241 lines) — **near-identical structure** with only vertical-specific tweaks | Extract a single `<HostelApplicationForm vertical={…} />` component; ~3,000 LOC reducible to ~500. |
| Status config maps | Dashboard pages (superintendent, trustee, student) each define their own status → label/color maps inline | UI status meanings drift between roles. Extract to [components/constants.ts](frontend/src/components/constants.ts). |

---

## 3. Dead Code & Unused Dependencies

### Backend

| Item | Location | Notes |
|------|----------|-------|
| ~~Supabase residue~~ | Fully removed. ✅ | Clean. |
| ~~NestJS `backend/` tree~~ | Removed in cleanup. ✅ | Clean. |
| ~~Triple migration history~~ | Only `sql/` remains. ✅ | Clean. |
| `optionalAuth` | [lib/authorize.ts:56-62](frontend/src/lib/authorize.ts#L56-L62) | Exported but rarely called. Verify whether remaining call sites still need it. |
| `canAccessStudent` | [lib/authorize.ts:71-90](frontend/src/lib/authorize.ts#L71-L90) | Exported but used in only a few routes despite its broader applicability — and has a bug (security report S-15). |

### Frontend

| Item | Location | Notes |
|------|----------|-------|
| Unused shadcn components | Re-verification with `rg "from ['\"].*shadcn/<name>['\"]"` confirmed only **`shadcn/sonner.tsx` and `shadcn/form.tsx`** were truly unused. The other 12 (`tabs`, `card`, `label`, `accordion`, `tag`, `dialog`, `badge`, `checkbox`, `dropdown-menu`, `select`, `textarea`, `input`) are imported across 1–20 files each. | ✅ **Resolved 2026-05-05** — `sonner.tsx` and `form.tsx` deleted. |
| Unused mock JSON files | [src/data/events.json](frontend/src/data/events.json), [src/data/alumni.json](frontend/src/data/alumni.json), [src/data/applications.json](frontend/src/data/applications.json), [src/data/jobs.json](frontend/src/data/jobs.json) — zero importers. | ✅ **Resolved 2026-05-05** — all four deleted. |
| Mock JSON imported by production pages | [src/data/institutions.json](frontend/src/data/institutions.json) is imported by [alumni/admin/page.tsx:15](frontend/src/app/alumni/admin/page.tsx#L15), [alumni/page.tsx:10](frontend/src/app/alumni/page.tsx#L10), [alumni/profile/page.tsx:15](frontend/src/app/alumni/profile/page.tsx#L15), [alumni/directory/page.tsx:15](frontend/src/app/alumni/directory/page.tsx#L15). | ⚠️ Still present — alumni pages render hardcoded institution data instead of querying the DB. Replace with API-backed data before deleting. |
| Unused `react-hook-form` package | Was only consumer was the deleted `shadcn/form.tsx`. | ✅ **Resolved 2026-05-05** — removed from `frontend/package.json`. Run `npm install` to refresh lockfile. |
| Unused `next-themes` package | Zero imports. | ✅ **Resolved 2026-05-05** — removed from `frontend/package.json`. Run `npm install` to refresh lockfile. |

---

## 4. Error Handling

### Critical Gaps

1. **No global API error handler.** Each route implements identical try/catch (83 instances of `if (error instanceof NextResponse) return error;`). A dropped catch in any route silently leaks stack traces.

2. **10 routes return raw `error.message` to clients** (security report S-16):
   - [api/config/applications-status/route.ts:48,94](frontend/src/app/api/config/applications-status/route.ts#L48)
   - [api/health/route.ts:36](frontend/src/app/api/health/route.ts#L36)
   - [api/admin/seed-auth-users/route.ts:131](frontend/src/app/api/admin/seed-auth-users/route.ts#L131)
   - [api/alumni/otp/verify/route.ts:78](frontend/src/app/api/alumni/otp/verify/route.ts#L78)
   - [api/alumni/otp/send/route.ts:53](frontend/src/app/api/alumni/otp/send/route.ts#L53)
   - [api/alumni/admin/applications/route.ts:66](frontend/src/app/api/alumni/admin/applications/route.ts#L66)
   - [api/alumni/directory/route.ts:72](frontend/src/app/api/alumni/directory/route.ts#L72)
   - [api/student/documents/[id]/url/route.ts:46](frontend/src/app/api/student/documents/[id]/url/route.ts#L46)

3. **Only 3 React error boundaries**: [app/error.tsx](frontend/src/app/error.tsx), [app/global-error.tsx](frontend/src/app/global-error.tsx), [app/dashboard/error.tsx](frontend/src/app/dashboard/error.tsx). No nested boundaries on `dashboard/superintendent/*`, `dashboard/trustee/*`, `apply/**`, or `alumni/**` — a single render error in any of those subtrees unmounts the whole dashboard.

4. **localStorage parse without try/catch** — multiple pages call `JSON.parse(localStorage.getItem('user'))` directly. Corrupted storage → uncaught `SyntaxError` → blank screen.

5. **Silent error swallowing** — many `fetch().then(...).catch(console.error)` patterns in dashboard pages leave the user staring at empty cards with no feedback.

### Missing Null Guards

- 86 instances of `localStorage.getItem('authToken')` without explicit null check before string interpolation (`Bearer ${null}` produces a literal `"Bearer null"` header).
- Several `application.data?.personal_info?.full_name` chains assume the jsonb structure that the DB never enforces.

---

## 5. Configuration Issues

| Issue | Location | Severity |
|-------|----------|----------|
| ~~Three coexisting migration histories~~ — resolved; `sql/` is sole source | [sql/](sql/) | ✅ Resolved |
| `sql/002_seed_test_users.sql` ships bcrypt hash for `Password123` for 10 users | [sql/002_seed_test_users.sql:3-25](sql/002_seed_test_users.sql#L3-L25) | Critical (security S-04) |
| CORS wildcard default + missing CSP/HSTS/X-Frame-Options | [frontend/next.config.js:12](frontend/next.config.js#L12) | Critical (security S-05) |
| Dev-mode hardcoded OTP `'123456'` | [frontend/src/lib/auth.ts:150](frontend/src/lib/auth.ts#L150) | Critical (security S-06) |
| `JWT_SECRET` placeholder accepted at runtime — no length/format check | [frontend/src/lib/auth.ts:6-9](frontend/src/lib/auth.ts#L6-L9) | High (security S-22) |
| Plaintext secrets in docker-compose `environment:` blocks | [docker-compose.yml:9-13](docker-compose.yml#L9-L13), [docker-compose.prod.yml:9-13](docker-compose.prod.yml#L9-L13) | High (security S-07) |
| `.mcp.json` contains placeholder API keys | [.mcp.json:9-17](.mcp.json#L9-L17) | Medium |
| CI tests disabled (commented out) | [.github/workflows/ci.yml:30-32](.github/workflows/ci.yml#L30-L32) | High |
| No image-domain whitelist in `next.config.js` | [frontend/next.config.js](frontend/next.config.js) | Low |
| `Testing.xlsx` and three `MANUAL_TESTING_GUIDE*.md` at repo root | (root) | Low |

---

## 6. API Design Issues

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **3 distinct response shapes** mixed across ~88 routes | `successResponse(...)` returns `{ success: true, ... }` (60+ routes) vs. raw `Response.json(...)` ([api/health/route.ts:46](frontend/src/app/api/health/route.ts#L46)) vs. double-wrapped `successResponse({ data: ..., summary: ... })` ([api/fees/route.ts:69-72](frontend/src/app/api/fees/route.ts#L69-L72)) | Pick one shape; add a wrapper that enforces it. |
| **11+ unbounded list endpoints** (security S-20) | [api/users/route.ts:23](frontend/src/app/api/users/route.ts#L23), [api/applications/route.ts:51](frontend/src/app/api/applications/route.ts#L51), [api/auditLogs/route.ts](frontend/src/app/api/auditLogs/route.ts), [api/alumni/directory/route.ts](frontend/src/app/api/alumni/directory/route.ts), [api/dashboard/superintendent/route.ts:21-22](frontend/src/app/api/dashboard/superintendent/route.ts#L21-L22), + 6 more | Cap at LIMIT 100 default; require `?page=&limit=`. |
| **40+ routes lack input validation** | [api/users/route.ts](frontend/src/app/api/users/route.ts), [api/rooms/route.ts:65-77](frontend/src/app/api/rooms/route.ts#L65-L77), [api/allocations/route.ts:74-90](frontend/src/app/api/allocations/route.ts#L74-L90), [api/interviews/[id]/route.ts:87-106](frontend/src/app/api/interviews/[id]/route.ts#L87-L106), [api/communications/route.ts](frontend/src/app/api/communications/route.ts), [api/student/documents/upload/route.ts](frontend/src/app/api/student/documents/upload/route.ts) | Standardize on zod or a shared `validateFields` helper. |
| **81 of ~88 routes** lack multi-statement transactions where audit-log INSERT pairs with business write (security S-19) | [api/fee-configuration/route.ts:79-90](frontend/src/app/api/fee-configuration/route.ts#L79-L90), [api/fees/route.ts:131-150](frontend/src/app/api/fees/route.ts#L131-L150), [api/payments/route.ts:82-100](frontend/src/app/api/payments/route.ts#L82-L100) | Wrap any pair of writes in `withTransaction` from [lib/db.ts:26-41](frontend/src/lib/db.ts#L26-L41). |
| Snake_case vs camelCase inconsistency between API and frontend | Called out in commit `a41cfbb` ("read snake_case in superintendent dashboard") | Decide on one (DB columns suggest snake_case); add a single transform layer at the response boundary. |

---

## 7. Testing

### Coverage

Vitest suites exist under [frontend/tests/](frontend/tests/) but are **not run in CI** — the test step in [.github/workflows/ci.yml:30-32](.github/workflows/ci.yml#L30-L32) is commented out. Without CI enforcement, local-only test execution provides no regression guarantee.

| Suite | Files |
|-------|-------|
| `tests/payments/` | `razorpayVerifyRoute.test.ts`, `razorpayWebhookRoute.test.ts`, `AdmissionFeeStep.test.tsx`, `SuperintendentByStatus.test.ts`, `AdmissionFeeNotice.test.tsx` |
| `tests/fees/` | (new fee-structure module tests) |
| `tests/Task02–Task22/` | UI component tests — many disabled (`.backup` files present) |
| `tests/common/` | `FileUpload.test.tsx` |

**Not Covered:**
- File upload endpoints (`api/applications/documents/upload`, `api/alumni/documents/upload`, `api/student/documents/upload`) — zero tests.
- Auth flows (`forgot-password`, `reset-password`, `first-time-setup`) — zero tests.
- Admin endpoints (`seed-auth-users`, `superintendent/reset-password`) — zero tests.
- Application lifecycle transitions (submit → review → approve → allocate) — zero tests.
- Audit-log generation — zero tests.

**Concerns:**
- `frontend/tests/Task12/Task12-SuperintendentDashboard.test.tsx.backup` — disabled test indicates a regression that was not investigated.
- No E2E tests (Playwright/Cypress).

---

## 8. Performance Concerns

### Backend

| Issue | Location |
|-------|----------|
| Dashboard endpoints run 4–6 separate uncached queries per request | [api/dashboard/superintendent/route.ts](frontend/src/app/api/dashboard/superintendent/route.ts), [api/dashboard/trustee/route.ts](frontend/src/app/api/dashboard/trustee/route.ts), [api/dashboard/accounts/route.ts](frontend/src/app/api/dashboard/accounts/route.ts), [api/dashboard/student/route.ts](frontend/src/app/api/dashboard/student/route.ts) |
| Unbounded `SELECT * FROM applications` full scan | [api/dashboard/superintendent/route.ts:21-22](frontend/src/app/api/dashboard/superintendent/route.ts#L21-L22) |
| Audit log full-table dump | [api/auditLogs/route.ts](frontend/src/app/api/auditLogs/route.ts) |
| `pg` pool size = 20, idle = 30s | [frontend/src/lib/db.ts](frontend/src/lib/db.ts) — fine for current load; review under prod traffic |
| In-memory rate limit map grows unbounded for distinct identifiers | [frontend/src/lib/rate-limit.ts](frontend/src/lib/rate-limit.ts) — Redis recommended once horizontally scaled |

### Frontend

| Issue | Location |
|-------|----------|
| **Zero code splitting** — no `next/dynamic` usage | All pages eagerly bundled |
| Six pages > 1,200 lines | [app/apply/boys-hostel/form/page.tsx](frontend/src/app/apply/boys-hostel/form/page.tsx) (1,436), [app/apply/dharamshala/form/page.tsx](frontend/src/app/apply/dharamshala/form/page.tsx) (1,357), [app/dashboard/accounts/page.tsx](frontend/src/app/dashboard/accounts/page.tsx) (1,312), [app/dashboard/superintendent/config/page.tsx](frontend/src/app/dashboard/superintendent/config/page.tsx) (1,295), [app/dashboard/superintendent/page.tsx](frontend/src/app/dashboard/superintendent/page.tsx) (1,291), [app/apply/girls-ashram/form/page.tsx](frontend/src/app/apply/girls-ashram/form/page.tsx) (1,241) |
| 775 `useState`/`useEffect` calls — frequent re-renders, redundant fetches | App-wide |
| No `React.memo` on list-row components in dashboards | All dashboard pages |

---

## 9. UX Anti-Patterns

| Issue | Location | Impact |
|-------|----------|--------|
| Native `confirm()` for destructive actions (5 instances) | [app/dashboard/trustee/applications/page.tsx:179](frontend/src/app/dashboard/trustee/applications/page.tsx#L179), [app/dashboard/superintendent/residents/page.tsx:457](frontend/src/app/dashboard/superintendent/residents/page.tsx#L457), [app/dashboard/superintendent/config/page.tsx:332](frontend/src/app/dashboard/superintendent/config/page.tsx#L332), [components/AllocationModal.tsx:103](frontend/src/components/AllocationModal.tsx#L103), [components/accounts/FeeStructureTab.tsx:158](frontend/src/components/accounts/FeeStructureTab.tsx#L158) | Blocks main thread, unstyled, inaccessible. |
| Native `alert()` for errors (18+ instances) | [app/apply/dharamshala/form/page.tsx:1296](frontend/src/app/apply/dharamshala/form/page.tsx#L1296), [app/track/[id]/page.tsx:149,152,749,765](frontend/src/app/track/[id]/page.tsx#L149), [app/dashboard/superintendent/page.tsx:179,186,189,263,1000](frontend/src/app/dashboard/superintendent/page.tsx#L179) | Poor UX, blocks thread. |
| `<button>` for navigation instead of `<Link>` | [components/navigation/Navigation.tsx:164](frontend/src/components/navigation/Navigation.tsx#L164) | No right-click "open in new tab"; not announced as link by screen readers. |
| `tabIndex={-1}` on focusable element | [components/feedback/SidePanel.tsx:115](frontend/src/components/feedback/SidePanel.tsx#L115) | Removes from keyboard navigation. |
| Labels without `htmlFor` (15+ instances) | [app/apply/dharamshala/contact/page.tsx:230,264](frontend/src/app/apply/dharamshala/contact/page.tsx#L230), [app/apply/girls-ashram/form/page.tsx:1009](frontend/src/app/apply/girls-ashram/form/page.tsx#L1009), [app/dashboard/trustee/_components/InterviewScheduleModal.tsx:82,88,94,108,112](frontend/src/app/dashboard/trustee/_components/InterviewScheduleModal.tsx#L82) | Screen readers cannot identify the input. |
| Icon-only buttons missing `aria-label` | Multiple Sidebar/Header buttons | Announced as unlabelled buttons. |
| No live-sync across tabs | localStorage-based auth state | Two tabs disagree about login status. |

---

## 10. CI/CD Pipeline Issues

| Issue | Location | Severity |
|-------|----------|----------|
| **CI tests disabled** — `Run tests` step commented out | [.github/workflows/ci.yml:30-32](.github/workflows/ci.yml#L30-L32) | High |
| **Plaintext secrets in docker-compose `environment:`** (DATABASE_URL, JWT_SECRET, ADMIN_SEED_SECRET) | [docker-compose.yml:9-13](docker-compose.yml#L9-L13), [docker-compose.prod.yml:9-13](docker-compose.prod.yml#L9-L13) | High |
| No resource limits / healthchecks on services | [docker-compose.yml](docker-compose.yml) | Medium |
| `restart: unless-stopped` without retry cap | [docker-compose.yml](docker-compose.yml) | Low |
| No `npm audit` gate in CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) | Medium |
| Dockerfile correctly runs as non-root `nextjs` user (UID 1001) | [frontend/Dockerfile:18-30](frontend/Dockerfile#L18-L30) | ✅ Pass |
| CD workflow uses GitHub secrets for SSH | [.github/workflows/cd.yml:18-21](.github/workflows/cd.yml#L18-L21) | ✅ Pass |
| Missing image-tag pinning in compose (mutable `:latest`?) | [docker-compose.prod.yml](docker-compose.prod.yml) | Low |

---

## 11. Miscellaneous Issues

| Issue | Location |
|-------|----------|
| ~~Three coexisting database schema sources~~ | Resolved — only `sql/` remains. ✅ |
| ~~Legacy NestJS `backend/` tree~~ | Resolved — directory removed. ✅ |
| ~~Legacy `supabase/` config + migration scaffolds~~ | Resolved — directory removed. ✅ |
| ~~`TASK*_*.md` scratchpads at root~~ | Resolved — files removed. ✅ |
| ~~Test-output `.txt` files committed under `frontend/`~~ | Resolved — files removed. ✅ |
| `Testing.xlsx` (binary spreadsheet) committed at repo root | (root) — audit contents; relocate or `.gitignore` |
| 3 `MANUAL_TESTING_GUIDE*.md` (v1, v2, v3) + `TESTING_SUMMARY.md` + `ISSUE_LOG.md` at root | (root) — consolidate or relocate to `.docs/qa/` |
| `.taskmaster/` directory committed | [.taskmaster/](.taskmaster/) — may be intentional but is large |
| Mock JSON imported in production alumni pages (institutions list) | [src/data/institutions.json](frontend/src/data/institutions.json) |
| 6 application form pages > 1,200 lines each — should be one parameterized component | [app/apply/{boys-hostel,girls-ashram,dharamshala}/form/page.tsx](frontend/src/app/apply/) |

---

## Recommendations (Priority Order)

### Immediate (Before Any Production Deployment)

1. Address every Critical/High in the security report (S-01 through S-14 — see [SECURITY_ASSESSMENT_REPORT.md](SECURITY_ASSESSMENT_REPORT.md)).
2. Re-enable Vitest in CI ([.github/workflows/ci.yml:30-32](.github/workflows/ci.yml#L30-L32)).
3. Move docker-compose secrets to env-file references.
4. Replace native `alert()` / `confirm()` calls with the existing `Modal`/`Dialog` components.
5. Run `npm install` in `frontend/` to pick up the lockfile changes from the recent dep cleanup (`react-hook-form`, `next-themes` removed).

### Short-Term (Next Sprint)

6. Extract `withAuth(roles, handler)` middleware to eliminate the 141 boilerplate copies.
7. Extract `recordAuditLog()` helper and `applyVerticalFilter()` helper from the duplicated patterns.
8. Wrap audit-log + business writes in `withTransaction` everywhere a route makes >1 write.
9. Standardize on `successResponse`/`errorResponse` from `lib/api/responses.ts` — fix the 3 deviating routes.
10. Add pagination caps (LIMIT 100 default) to all list endpoints.
11. Migrate the 14 `formatDate`/`formatDateTime` duplicates to import from [components/utils.ts](frontend/src/components/utils.ts).
12. Replace mock JSON import in alumni pages ([institutions.json](frontend/src/data/institutions.json)) with API-backed data.
13. Add input validation to the 40+ routes currently accepting unvalidated input — adopt zod.

### Medium-Term (Within 1 Month)

14. Consolidate the three `apply/{vertical}/form/page.tsx` files into one `<HostelApplicationForm vertical={…} />` (~3,000 LOC reduction).
15. Centralize `apiClient.ts` so the 86 manual `Bearer ${token}` injections become one call.
16. Adopt React Query for all dashboard data fetching.
17. Add nested error boundaries under each role's dashboard root.
18. Add Sentry / external error monitoring.
19. Implement code splitting via `next/dynamic` for the heavy form pages and dashboard subtrees.
20. Migrate auth from `localStorage` to HttpOnly cookies (also resolves security S-08).
21. Add E2E tests (Playwright) covering the critical paths: applicant submit → trustee approve → student check-in → fee payment → exit clearance.
22. Audit and fix accessibility issues (missing `aria-label`, label/htmlFor pairings, button-as-link patterns, `tabIndex={-1}`).
23. Repository hygiene: audit/relocate `Testing.xlsx` and the three `MANUAL_TESTING_GUIDE*.md` files; consolidate the QA artefacts under `.docs/qa/`.

---

*Report generated by automated codebase analysis. All file paths and line numbers reference the codebase as of branch `24April`, 2026-05-05.*
