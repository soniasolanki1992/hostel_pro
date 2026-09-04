/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

vi.stubEnv('PHONEPE_CLIENT_ID', 'TEST_CLIENT_ID');
vi.stubEnv('PHONEPE_CLIENT_SECRET', 'TEST_CLIENT_SECRET');
vi.stubEnv('PHONEPE_CLIENT_VERSION', '1');
vi.stubEnv('PHONEPE_ENV', 'SANDBOX');
vi.stubEnv('PHONEPE_WEBHOOK_USERNAME', 'webhookuser');
vi.stubEnv('PHONEPE_WEBHOOK_PASSWORD', 'webhookpass');

const dbCalls: Array<{ sql: string; params?: any[] }> = [];

vi.mock('@/lib/db', () => {
  const queryFn = vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/SELECT t\.id, t\.status, t\.fee_id, f\.application_id, f\.amount AS fee_amount/.test(sql)) {
      return {
        rows: [{ id: 'txn-1', status: 'PENDING', fee_id: 'fee-1', application_id: 'app-1', fee_amount: '500' }],
      };
    }
    return { rows: [] };
  });

  return {
    query: queryFn,
    withTransaction: vi.fn(async (fn: (client: any) => Promise<any>) => {
      const fakeClient = { query: queryFn };
      return fn(fakeClient);
    }),
  };
});

import { POST } from '@/app/api/payments/phonepe/webhook/route';

function validAuthHeader() {
  return createHash('sha256').update('webhookuser:webhookpass').digest('hex');
}

function makeWebhookRequest(payload: any, authHeader = validAuthHeader()) {
  const body = JSON.stringify(payload);
  return new Request('http://localhost/api/payments/phonepe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body,
  }) as any;
}

function eventPayload(state: string, merchantOrderId: string, orderId: string, amountPaise = 50000) {
  return { event: 'checkout.order.completed', payload: { merchantOrderId, orderId, state, amount: amountPaise } };
}

beforeEach(() => {
  dbCalls.length = 0;
});

describe('POST /api/payments/phonepe/webhook', () => {
  it('on COMPLETED: marks txn SUCCESS, fee PAID, app SUBMITTED + payment_status=PAID', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_OK', 'OMO_OK')));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql))).toBe(true);
    expect(dbCalls.some((c) => /UPDATE fees[\s\S]*status='PAID'/.test(c.sql))).toBe(true);
    const appUpdate = dbCalls.find((c) => /UPDATE applications[\s\S]*payment_status\s*=\s*'PAID'/.test(c.sql));
    expect(appUpdate?.params).toEqual(['app-1']);
  });

  it('rejects when the Authorization header is invalid', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_X', 'OMO_X'), 'deadbeef'));
    expect(res.status).toBe(400);
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('idempotent on duplicate webhook (txn already SUCCESS): no further mutations', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', status: 'SUCCESS', fee_id: 'fee-1', application_id: 'app-1', fee_amount: '500' }] };
    });

    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_DUP', 'OMO_DUP')));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.idempotent).toBe(true);
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('on FAILED: marks txn FAILED, leaves fees and applications untouched', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('FAILED', 'ADM_F', 'OMO_F')));
    expect(res.status).toBe(200);

    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='FAILED'/.test(c.sql))).toBe(true);
    expect(dbCalls.some((c) => /UPDATE fees/.test(c.sql))).toBe(false);
    expect(dbCalls.some((c) => /UPDATE applications/.test(c.sql))).toBe(false);
  });

  it('idempotent on duplicate webhook (txn already FAILED, incoming state still not COMPLETED): no mutations', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', status: 'FAILED', fee_id: 'fee-1', application_id: 'app-1', fee_amount: '500' }] };
    });

    const res = await POST(makeWebhookRequest(eventPayload('FAILED', 'ADM_FAIL_DUP', 'OMO_FAIL_DUP')));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.idempotent).toBe(true);
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('recovers a superseded (FAILED) transaction when the webhook now reports COMPLETED: finalizes as SUCCESS with a RECOVERED_AFTER_SUPERSEDE audit event', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', status: 'FAILED', fee_id: 'fee-1', application_id: 'app-1', fee_amount: '500' }] };
    });

    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_RECOVER', 'OMO_RECOVER')));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.idempotent).toBeUndefined();

    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql))).toBe(true);
    expect(dbCalls.some((c) => /UPDATE fees[\s\S]*status='PAID'/.test(c.sql))).toBe(true);
    const appUpdate = dbCalls.find((c) => /UPDATE applications[\s\S]*payment_status\s*=\s*'PAID'/.test(c.sql));
    expect(appUpdate?.params).toEqual(['app-1']);

    const auditInsert = dbCalls.find(
      (c) => /INSERT INTO audit_logs/.test(c.sql) && JSON.stringify(c.params).includes('PHONEPE_WEBHOOK_RECOVERED_AFTER_SUPERSEDE'),
    );
    expect(auditInsert, 'logs PHONEPE_WEBHOOK_RECOVERED_AFTER_SUPERSEDE instead of the normal success event').toBeTruthy();
    const normalSuccessAudit = dbCalls.find(
      (c) => /INSERT INTO audit_logs/.test(c.sql) && JSON.stringify(c.params).includes('"PHONEPE_WEBHOOK_SUCCESS"'),
    );
    expect(normalSuccessAudit, 'does not also log the normal PHONEPE_WEBHOOK_SUCCESS event').toBeFalsy();
  });

  it('rejects when COMPLETED amount does not match fee_amount', async () => {
    const res = await POST(makeWebhookRequest(eventPayload('COMPLETED', 'ADM_AMT', 'OMO_AMT', 1)));
    expect(res.status).toBe(400);
    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql))).toBe(false);
  });
});
