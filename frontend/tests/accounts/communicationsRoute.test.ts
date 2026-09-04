/**
 * Tests for /api/communications — POST records reminders;
 * GET supports related_entity_id/related_entity_type/purpose filters.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbCalls: Array<{ sql: string; params?: any[] }> = [];

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/INSERT INTO communications/.test(sql)) {
      return {
        rows: [
          {
            id: `comm-${dbCalls.length}`,
            recipient_contact: params?.[1],
            channel: params?.[2],
            purpose: params?.[3],
            status: 'PENDING',
          },
        ],
      };
    }
    // GET path
    return { rows: [{ id: 'log-1', status: 'PENDING' }] };
  }),
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

import { GET, POST } from '@/app/api/communications/route';

function jsonRequest(body: any) {
  return new Request('http://localhost/api/communications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

function urlRequest(url: string) {
  return new Request(url, { method: 'GET' }) as any;
}

beforeEach(() => {
  dbCalls.length = 0;
});

describe('POST /api/communications', () => {
  it('rejects when recipients are missing or empty', async () => {
    const res = await POST(jsonRequest({ channel: 'SMS', purpose: 'FEE_REMINDER', message_body: 'hi' }));
    expect(res.status).toBe(400);
  });

  it('rejects an unknown channel', async () => {
    const res = await POST(
      jsonRequest({
        recipients: [{ contact: '9999999999' }],
        channel: 'CARRIER_PIGEON',
        purpose: 'FEE_REMINDER',
        message_body: 'hi',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error || body.message).toMatch(/channel/i);
  });

  it('rejects an unknown purpose', async () => {
    const res = await POST(
      jsonRequest({
        recipients: [{ contact: '9999999999' }],
        channel: 'SMS',
        purpose: 'BOGUS',
        message_body: 'hi',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty message_body', async () => {
    const res = await POST(
      jsonRequest({
        recipients: [{ contact: '9999999999' }],
        channel: 'SMS',
        purpose: 'FEE_REMINDER',
        message_body: '   ',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects when no recipient has a contact', async () => {
    const res = await POST(
      jsonRequest({
        recipients: [{ contact: '' }, { contact: '   ' }],
        channel: 'SMS',
        purpose: 'FEE_REMINDER',
        message_body: 'hi',
      })
    );
    expect(res.status).toBe(400);
  });

  it('inserts one row per recipient with PENDING status and returns 201', async () => {
    const res = await POST(
      jsonRequest({
        recipients: [
          { contact: '9999999999', user_id: 'u-1' },
          { contact: 'parent@example.com' },
        ],
        channel: 'sms', // case-insensitive
        purpose: 'fee_reminder',
        subject: 'Fee due',
        message_body: 'Please pay',
        related_entity_type: 'FEE',
        related_entity_id: 'fee-42',
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);

    const inserts = dbCalls.filter(c => /INSERT INTO communications/.test(c.sql));
    expect(inserts).toHaveLength(2);
    // Channel + purpose normalised to uppercase
    expect(inserts[0].params?.[2]).toBe('SMS');
    expect(inserts[0].params?.[3]).toBe('FEE_REMINDER');
    // related_entity wired through
    expect(inserts[0].params?.[6]).toBe('FEE');
    expect(inserts[0].params?.[7]).toBe('fee-42');
    // sent_by = authenticated user id
    expect(inserts[0].params?.[8]).toBe('user-acc-1');
  });
});

describe('GET /api/communications', () => {
  it('forwards related_entity_id + related_entity_type + purpose into the WHERE clause', async () => {
    const res = await GET(urlRequest('http://localhost/api/communications?related_entity_id=fee-42&related_entity_type=FEE&purpose=fee_reminder&limit=50'));
    expect(res.status).toBe(200);
    const selectCall = dbCalls.find(c => /SELECT \* FROM communications/.test(c.sql));
    expect(selectCall).toBeTruthy();
    expect(selectCall!.sql).toMatch(/purpose = \$\d+/);
    expect(selectCall!.sql).toMatch(/related_entity_id = \$\d+/);
    expect(selectCall!.sql).toMatch(/related_entity_type = \$\d+/);
    // Purpose is uppercased
    expect(selectCall!.params).toContain('FEE_REMINDER');
    expect(selectCall!.params).toContain('fee-42');
    expect(selectCall!.params).toContain('FEE');
  });
});
