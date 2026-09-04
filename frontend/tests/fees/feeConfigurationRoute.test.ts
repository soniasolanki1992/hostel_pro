/**
 * Tests for /api/fee-configuration — proves CRUD operations validate input,
 * write rows, and emit audit_logs entries.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbCalls: Array<{ sql: string; params?: any[] }> = [];

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/^SELECT \* FROM fee_configuration WHERE id = \$1/.test(sql)) {
      return {
        rows: [{
          id: params?.[0],
          vertical: 'BOYS_HOSTEL',
          academic_session: '2025-2026',
          fee_head: 'PROCESSING_FEE',
          amount: '500.00',
          frequency: 'ONE_TIME',
          is_refundable: false,
          valid_from: '2025-06-01',
          valid_until: null,
        }],
      };
    }
    if (/INSERT INTO fee_configuration/.test(sql)) {
      return {
        rows: [{
          id: 'new-config-id',
          vertical: params?.[0],
          academic_session: params?.[1],
          fee_head: params?.[2],
          amount: params?.[3],
          frequency: params?.[4],
          is_refundable: params?.[5],
          valid_from: params?.[6],
          valid_until: params?.[7],
        }],
      };
    }
    if (/^UPDATE fee_configuration SET/.test(sql)) {
      return {
        rows: [{
          id: params?.[params.length - 1],
          vertical: 'BOYS_HOSTEL',
          academic_session: '2025-2026',
          fee_head: 'PROCESSING_FEE',
          amount: params?.[0],
          frequency: 'ONE_TIME',
          is_refundable: false,
          valid_from: '2025-06-01',
          valid_until: null,
        }],
      };
    }
    if (/SELECT \* FROM fee_configuration/.test(sql)) {
      return {
        rows: [
          { id: 'a', vertical: 'BOYS_HOSTEL', fee_head: 'PROCESSING_FEE', amount: '500' },
          { id: 'b', vertical: 'GIRLS_ASHRAM', fee_head: 'MESS_MONTHLY_FEE', amount: '3500' },
        ],
      };
    }
    return { rows: [] };
  }),
}));

vi.mock('@/lib/authorize', () => ({
  requireAuth: vi.fn(async () => ({
    id: 'user-accounts-1',
    email: 'a@x.com',
    mobile: '9999999999',
    full_name: 'Test Accounts',
    role: 'ACCOUNTS',
    vertical: null,
    is_active: true,
  })),
}));

import { GET, POST, PUT, DELETE } from '@/app/api/fee-configuration/route';

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  }) as any;
}

beforeEach(() => {
  dbCalls.length = 0;
});

describe('GET /api/fee-configuration', () => {
  it('returns the list of fee configuration rows', async () => {
    const res = await GET(makeRequest('http://localhost/api/fee-configuration'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(2);
  });

  it('applies vertical and fee_head filters as parameterised SQL', async () => {
    await GET(makeRequest('http://localhost/api/fee-configuration?vertical=BOYS_HOSTEL&fee_head=PROCESSING_FEE'));
    const select = dbCalls.find((c) => /SELECT \* FROM fee_configuration/.test(c.sql));
    expect(select?.sql).toMatch(/vertical = \$1/);
    expect(select?.sql).toMatch(/fee_head = \$2/);
    expect(select?.params).toEqual(['BOYS_HOSTEL', 'PROCESSING_FEE']);
  });
});

describe('POST /api/fee-configuration', () => {
  const validBody = {
    vertical: 'BOYS_HOSTEL',
    academic_session: '2025-2026',
    fee_head: 'MESS_MONTHLY_FEE',
    amount: 3500,
    frequency: 'MONTHLY',
    is_refundable: false,
    valid_from: '2025-06-01',
  };

  it('creates a row, writes audit_logs, and returns 201', async () => {
    const res = await POST(makeRequest('http://localhost/api/fee-configuration', {
      method: 'POST',
      body: JSON.stringify(validBody),
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('new-config-id');

    const insert = dbCalls.find((c) => /INSERT INTO fee_configuration/.test(c.sql));
    expect(insert?.params).toEqual([
      'BOYS_HOSTEL', '2025-2026', 'MESS_MONTHLY_FEE', 3500, 'MONTHLY', false, '2025-06-01', null,
    ]);

    const audit = dbCalls.find((c) => /INSERT INTO audit_logs/.test(c.sql) && /'CREATE'/.test(c.sql));
    expect(audit, 'audit_logs CREATE row written').toBeTruthy();
    expect(audit?.params?.[0]).toBe('new-config-id');
    expect(audit?.params?.[2]).toBe('user-accounts-1');
  });

  it('rejects an invalid vertical', async () => {
    const res = await POST(makeRequest('http://localhost/api/fee-configuration', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, vertical: 'NOT_REAL' }),
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/vertical/i);
  });

  it('rejects an invalid frequency', async () => {
    const res = await POST(makeRequest('http://localhost/api/fee-configuration', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, frequency: 'WEEKLY' }),
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/frequency/i);
  });

  it('rejects a negative amount', async () => {
    const res = await POST(makeRequest('http://localhost/api/fee-configuration', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, amount: -1 }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/fee-configuration', () => {
  it('updates only the fields provided and emits an UPDATE audit row', async () => {
    const res = await PUT(makeRequest('http://localhost/api/fee-configuration', {
      method: 'PUT',
      body: JSON.stringify({ id: 'config-1', amount: 5000 }),
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const update = dbCalls.find((c) => /^UPDATE fee_configuration SET/.test(c.sql));
    expect(update?.sql).toMatch(/amount = \$1/);
    expect(update?.params).toEqual([5000, 'config-1']);

    const audit = dbCalls.find((c) => /INSERT INTO audit_logs/.test(c.sql) && /'UPDATE'/.test(c.sql));
    expect(audit, 'audit_logs UPDATE row written').toBeTruthy();
  });

  it('returns 400 when id is missing', async () => {
    const res = await PUT(makeRequest('http://localhost/api/fee-configuration', {
      method: 'PUT',
      body: JSON.stringify({ amount: 100 }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/fee-configuration', () => {
  it('deletes the row by id and emits a DELETE audit row', async () => {
    const res = await DELETE(makeRequest('http://localhost/api/fee-configuration?id=config-1', {
      method: 'DELETE',
    }));
    expect(res.status).toBe(200);

    const del = dbCalls.find((c) => /^DELETE FROM fee_configuration/.test(c.sql));
    expect(del?.params).toEqual(['config-1']);

    const audit = dbCalls.find((c) => /INSERT INTO audit_logs/.test(c.sql) && /'DELETE'/.test(c.sql));
    expect(audit, 'audit_logs DELETE row written').toBeTruthy();
  });

  it('returns 400 when id query parameter is missing', async () => {
    const res = await DELETE(makeRequest('http://localhost/api/fee-configuration', {
      method: 'DELETE',
    }));
    expect(res.status).toBe(400);
  });
});
