/**
 * Tests for GET /api/clearance-items — lists exit-clearance requests with
 * outstanding-dues join and per-request progress aggregation.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbCalls: Array<{ sql: string; params?: any[] }> = [];
let exitRequestRows: any[] = [];
let clearanceItemRows: Record<string, any[]> = {};
let mockUser: any = {
  id: 'u-acc',
  role: 'ACCOUNTS',
  vertical: null,
  is_active: true,
};

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/FROM exit_requests er/.test(sql)) {
      return { rows: exitRequestRows };
    }
    if (/FROM exit_clearance_items WHERE exit_request_id/.test(sql)) {
      const id = params?.[0] as string;
      return { rows: clearanceItemRows[id] || [] };
    }
    return { rows: [] };
  }),
}));

vi.mock('@/lib/authorize', () => ({
  requireAuth: vi.fn(async () => mockUser),
}));

import { GET } from '@/app/api/clearance-items/route';

function makeRequest(query = '') {
  return new Request(`http://localhost/api/clearance-items${query ? `?${query}` : ''}`, {
    method: 'GET',
  }) as any;
}

beforeEach(() => {
  dbCalls.length = 0;
  exitRequestRows = [];
  clearanceItemRows = {};
  mockUser = { id: 'u-acc', role: 'ACCOUNTS', vertical: null, is_active: true };
});

describe('GET /api/clearance-items', () => {
  it('returns an empty list when there are no exit requests', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('aggregates clearance progress and outstanding dues per request', async () => {
    exitRequestRows = [
      {
        id: 'er-1',
        student_id: 'stu-1',
        student_name: 'Alice',
        vertical: 'BOYS',
        room_number: 'B-101',
        requested_date: '2026-06-01',
        actual_exit_date: null,
        status: 'PENDING',
        clearance_status: 'PENDING',
        created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
        outstanding_amount: '1500',
        outstanding_count: '2',
      },
    ];
    clearanceItemRows['er-1'] = [
      { id: 'i-1', item_type: 'ROOM_HANDOVER', status: 'COMPLETED' },
      { id: 'i-2', item_type: 'FEE_CLEARANCE', status: 'PENDING' },
      { id: 'i-3', item_type: 'KEY_RETURN', status: 'PENDING' },
    ];

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const row = body.data[0];
    expect(row.studentName).toBe('Alice');
    expect(row.outstandingAmount).toBe(1500);
    expect(row.outstandingCount).toBe(2);
    expect(row.progress).toEqual({ total: 3, completed: 1, pending: 2 });
    expect(row.agingDays).toBeGreaterThanOrEqual(9);
  });

  it('forwards vertical filter into the SQL params', async () => {
    await GET(makeRequest('vertical=GIRLS'));
    const main = dbCalls.find(c => /FROM exit_requests er/.test(c.sql));
    expect(main!.sql).toMatch(/u\.vertical = \$\d+/);
    expect(main!.params).toContain('GIRLS');
  });

  it('skips vertical filter when ALL is passed', async () => {
    await GET(makeRequest('vertical=ALL'));
    const main = dbCalls.find(c => /FROM exit_requests er/.test(c.sql));
    expect(main!.sql).not.toMatch(/u\.vertical = \$/);
  });

  it('scopes SUPERINTENDENT to their own vertical even without query param', async () => {
    mockUser = { id: 'u-sup', role: 'SUPERINTENDENT', vertical: 'BOYS', is_active: true };
    await GET(makeRequest());
    const main = dbCalls.find(c => /FROM exit_requests er/.test(c.sql));
    expect(main!.params).toContain('BOYS');
  });
});
