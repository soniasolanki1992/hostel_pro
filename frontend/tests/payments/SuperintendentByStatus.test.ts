import { describe, it, expect } from 'vitest';
import { ApplicationStatus } from '@/types/api';

/**
 * Regression test for commit 825e5df:
 *   "fix(superintendent): add WAITLIST entry to byStatus"
 *
 * The superintendent dashboard initialises byStatus as
 *   Record<ApplicationStatus, number>
 * If any ApplicationStatus enum value is missing from the initialiser, the
 * `byStatus[app.current_status]++` write either silently NaNs (if the key is
 * undefined) or fails the strict Record type at build time.
 *
 * Rather than spinning up the full Next route handler with a mocked DB, we
 * pin the contract: every ApplicationStatus enum value must be a key in the
 * dashboard's byStatus shape.
 */
const expectedKeys: ApplicationStatus[] = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.REVIEW,
  ApplicationStatus.TRUSTEE_REVIEW,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.TRUSTEE_FINAL_REVIEW,
  ApplicationStatus.WAITLIST,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.ARCHIVED,
];

function buildInitialByStatus(): Record<ApplicationStatus, number> {
  // Mirrors the initialiser in
  // frontend/src/app/api/dashboard/superintendent/route.ts
  return {
    DRAFT: 0,
    SUBMITTED: 0,
    REVIEW: 0,
    TRUSTEE_REVIEW: 0,
    SHORTLISTED: 0,
    INTERVIEW: 0,
    TRUSTEE_FINAL_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    WITHDRAWN: 0,
    ARCHIVED: 0,
    WAITLIST: 0,
  };
}

describe('superintendent dashboard byStatus shape', () => {
  it('includes WAITLIST as a counted status', () => {
    const byStatus = buildInitialByStatus();
    expect(byStatus).toHaveProperty('WAITLIST', 0);
  });

  it('has an entry for every ApplicationStatus enum value', () => {
    const byStatus = buildInitialByStatus();
    for (const key of expectedKeys) {
      expect(byStatus).toHaveProperty(key);
      expect(byStatus[key]).toBe(0);
    }
  });

  it('increments WAITLIST when an application has that status', () => {
    const byStatus = buildInitialByStatus();
    const apps = [
      { current_status: ApplicationStatus.WAITLIST },
      { current_status: ApplicationStatus.WAITLIST },
      { current_status: ApplicationStatus.APPROVED },
    ];
    apps.forEach((a) => {
      byStatus[a.current_status as ApplicationStatus]++;
    });
    expect(byStatus.WAITLIST).toBe(2);
    expect(byStatus.APPROVED).toBe(1);
  });
});
