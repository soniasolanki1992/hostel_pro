/**
 * Tests for POST /api/fees/generate-monthly-mess — proves it bulk-inserts
 * MESS_MONTHLY_FEE rows for active residents, looks up amounts per vertical,
 * and is idempotent on repeated runs for the same month.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbCalls: Array<{ sql: string; params?: any[] }> = [];
const clientCalls: Array<{ sql: string; params?: any[] }> = [];

let residentRows: any[] = [];
let configRows: any[] = [];
let existingFeeFor = new Set<string>();

const fakeClient = {
  query: vi.fn(async (sql: string, params?: any[]) => {
    clientCalls.push({ sql, params });
    if (/SELECT 1 FROM fees/.test(sql)) {
      const studentId = params?.[0] as string;
      return { rows: existingFeeFor.has(studentId) ? [{ '?column?': 1 }] : [] };
    }
    return { rows: [] };
  }),
  release: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/FROM users u\s+JOIN room_allocations/.test(sql)) {
      return { rows: residentRows };
    }
    if (/FROM fee_configuration/.test(sql) && /MESS_MONTHLY_FEE/.test(sql)) {
      return { rows: configRows };
    }
    return { rows: [] };
  }),
  withTransaction: vi.fn(async (fn: any) => fn(fakeClient)),
}));

vi.mock('@/lib/authorize', () => ({
  requireAuth: vi.fn(async () => ({
    id: 'user-acc-1',
    email: 'a@x.com',
    mobile: '9999999999',
    full_name: 'Acc User',
    role: 'ACCOUNTS',
    vertical: null,
    is_active: true,
  })),
}));

import { POST } from '@/app/api/fees/generate-monthly-mess/route';

function makeRequest(body: any) {
  return new Request('http://localhost/api/fees/generate-monthly-mess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  dbCalls.length = 0;
  clientCalls.length = 0;
  residentRows = [];
  configRows = [];
  existingFeeFor = new Set();
  fakeClient.query.mockClear();
});

describe('POST /api/fees/generate-monthly-mess', () => {
  it('rejects missing or malformed month', async () => {
    let res = await POST(makeRequest({}));
    expect(res.status).toBe(400);

    res = await POST(makeRequest({ month: '2026/05' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/YYYY-MM/);
  });

  it('rejects an unknown vertical', async () => {
    const res = await POST(makeRequest({ month: '2026-05', vertical: 'MARS' }));
    expect(res.status).toBe(400);
  });

  it('returns generated=0 when there are no active residents', async () => {
    residentRows = [];
    const res = await POST(makeRequest({ month: '2026-05' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.generated).toBe(0);
  });

  it('400s when no MESS_MONTHLY_FEE configuration exists for the session', async () => {
    residentRows = [{ student_id: 's1', vertical: 'BOYS_HOSTEL' }];
    configRows = [];
    const res = await POST(makeRequest({ month: '2026-05' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/MESS_MONTHLY_FEE configuration/);
  });

  it('inserts one MESS_MONTHLY_FEE row per active resident on first run, due on day 10 by default', async () => {
    residentRows = [
      { student_id: 's-boys-1', vertical: 'BOYS_HOSTEL' },
      { student_id: 's-boys-2', vertical: 'BOYS_HOSTEL' },
      { student_id: 's-girls-1', vertical: 'GIRLS_ASHRAM' },
    ];
    configRows = [
      { vertical: 'BOYS_HOSTEL', amount: '3500.00' },
      { vertical: 'GIRLS_ASHRAM', amount: '3500.00' },
    ];

    const res = await POST(makeRequest({ month: '2026-05' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      generated: 3,
      skipped: 0,
      failed: 0,
      month: '2026-05',
      due_date: '2026-05-10',
    });

    const inserts = clientCalls.filter((c) => /INSERT INTO fees/.test(c.sql));
    expect(inserts).toHaveLength(3);
    // (student_id, description, academic_session, amount, due_date)
    expect(inserts[0].params?.[0]).toBe('s-boys-1');
    expect(inserts[0].params?.[1]).toBe('Mess Monthly Fees — 2026-05');
    expect(inserts[0].params?.[3]).toBe(3500);
    expect(inserts[0].params?.[4]).toBe('2026-05-10');
  });

  it('skips residents that already have a MESS_MONTHLY_FEE row for the month (idempotent)', async () => {
    residentRows = [
      { student_id: 's-1', vertical: 'BOYS_HOSTEL' },
      { student_id: 's-2', vertical: 'BOYS_HOSTEL' },
    ];
    configRows = [{ vertical: 'BOYS_HOSTEL', amount: '3500.00' }];
    existingFeeFor.add('s-1'); // s-1 already has a row this month

    const res = await POST(makeRequest({ month: '2026-05' }));
    const json = await res.json();

    expect(json.data).toMatchObject({ generated: 1, skipped: 1, failed: 0 });

    const inserts = clientCalls.filter((c) => /INSERT INTO fees/.test(c.sql));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params?.[0]).toBe('s-2');
  });

  it('marks residents with no matching vertical config as failed instead of inserting bad rows', async () => {
    residentRows = [
      { student_id: 's-boys', vertical: 'BOYS_HOSTEL' },
      { student_id: 's-dharm', vertical: 'DHARAMSHALA' },
    ];
    configRows = [{ vertical: 'BOYS_HOSTEL', amount: '3500.00' }];

    const res = await POST(makeRequest({ month: '2026-05' }));
    const json = await res.json();

    expect(json.data.generated).toBe(1);
    expect(json.data.failed).toBe(1);
    expect(json.data.failures?.[0]).toMatchObject({ student_id: 's-dharm' });
  });

  it('honours a custom due_day clamped to [1, 28]', async () => {
    residentRows = [{ student_id: 's-1', vertical: 'BOYS_HOSTEL' }];
    configRows = [{ vertical: 'BOYS_HOSTEL', amount: '3500.00' }];

    const res = await POST(makeRequest({ month: '2026-05', due_day: 5 }));
    const json = await res.json();
    expect(json.data.due_date).toBe('2026-05-05');
  });

  it('derives the academic session from the month (June rolls forward)', async () => {
    // Need at least one resident so the config-query branch runs.
    residentRows = [{ student_id: 's-1', vertical: 'BOYS_HOSTEL' }];
    configRows = [{ vertical: 'BOYS_HOSTEL', amount: '3500.00' }];

    await POST(makeRequest({ month: '2026-06' }));
    const cfgCall = dbCalls.find((c) => /FROM fee_configuration/.test(c.sql));
    expect(cfgCall?.params?.[0]).toBe('2026-2027');

    dbCalls.length = 0;
    await POST(makeRequest({ month: '2026-05' }));
    const cfgCall2 = dbCalls.find((c) => /FROM fee_configuration/.test(c.sql));
    expect(cfgCall2?.params?.[0]).toBe('2025-2026');
  });
});
