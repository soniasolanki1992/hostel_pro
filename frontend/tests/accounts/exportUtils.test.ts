/**
 * Tests for the Accounts export/period helpers.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { rowsToCsv, periodToRange, isWithinPeriod } from '@/lib/accounts/exportUtils';

describe('rowsToCsv', () => {
  it('builds CSV header + body in column order', () => {
    const csv = rowsToCsv(
      [
        { a: 1, b: 'two' },
        { a: 3, b: 'four' },
      ],
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
      ]
    );
    expect(csv).toBe('A,B\r\n1,two\r\n3,four');
  });

  it('escapes quotes, commas, and newlines', () => {
    const csv = rowsToCsv(
      [{ name: 'Doe, Jane', note: 'has "quotes"\nand newline' }],
      [
        { key: 'name', header: 'Name' },
        { key: 'note', header: 'Note' },
      ]
    );
    expect(csv).toBe(
      'Name,Note\r\n"Doe, Jane","has ""quotes""\nand newline"'
    );
  });

  it('renders null/undefined as empty cells', () => {
    const csv = rowsToCsv(
      [{ a: null, b: undefined, c: 0 }],
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
        { key: 'c', header: 'C' },
      ]
    );
    expect(csv).toBe('A,B,C\r\n,,0');
  });
});

describe('periodToRange', () => {
  const NOW = new Date(2026, 4, 15, 12, 0, 0); // 2026-05-15 local

  // The helper builds local-time boundaries; compare in local time too.
  const localYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  it('THIS_MONTH spans the current month', () => {
    const { from, to } = periodToRange('THIS_MONTH', NOW);
    expect(localYMD(from!)).toBe('2026-05-01');
    expect(localYMD(to!)).toBe('2026-05-31');
  });

  it('LAST_MONTH spans the previous month', () => {
    const { from, to } = periodToRange('LAST_MONTH', NOW);
    expect(localYMD(from!)).toBe('2026-04-01');
    expect(localYMD(to!)).toBe('2026-04-30');
  });

  it('LAST_3_MONTHS covers ~3 months back through current month', () => {
    const { from, to } = periodToRange('LAST_3_MONTHS', NOW);
    expect(localYMD(from!)).toBe('2026-03-01');
    expect(localYMD(to!)).toBe('2026-05-31');
  });

  it('THIS_YEAR spans the calendar year', () => {
    const { from, to } = periodToRange('THIS_YEAR', NOW);
    expect(localYMD(from!)).toBe('2026-01-01');
    expect(localYMD(to!)).toBe('2026-12-31');
  });

  it('ALL_TIME has no bounds', () => {
    const { from, to } = periodToRange('ALL_TIME', NOW);
    expect(from).toBeNull();
    expect(to).toBeNull();
  });
});

describe('isWithinPeriod', () => {
  it('ALL_TIME accepts everything, including missing dates', () => {
    expect(isWithinPeriod('2020-01-01', 'ALL_TIME')).toBe(true);
    expect(isWithinPeriod(null, 'ALL_TIME')).toBe(true);
    expect(isWithinPeriod(undefined, 'ALL_TIME')).toBe(true);
  });

  it('rejects empty / invalid dates for non-ALL_TIME periods', () => {
    expect(isWithinPeriod(null, 'THIS_MONTH')).toBe(false);
    expect(isWithinPeriod('not-a-date', 'THIS_MONTH')).toBe(false);
  });

  it('matches dates inside the THIS_YEAR window only', () => {
    // We can't pass `now` to isWithinPeriod; just assert logic against today's actual year
    const thisYear = new Date().getFullYear();
    expect(isWithinPeriod(`${thisYear}-06-15`, 'THIS_YEAR')).toBe(true);
    expect(isWithinPeriod(`${thisYear - 2}-06-15`, 'THIS_YEAR')).toBe(false);
  });
});
