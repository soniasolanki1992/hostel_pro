/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('PHONEPE_CLIENT_ID', 'TEST_CLIENT_ID');
vi.stubEnv('PHONEPE_CLIENT_SECRET', 'TEST_CLIENT_SECRET');
vi.stubEnv('PHONEPE_CLIENT_VERSION', '1');
vi.stubEnv('PHONEPE_ENV', 'SANDBOX');

const dbCalls: Array<{ sql: string; params?: any[] }> = [];

vi.mock('@/lib/db', () => {
  const queryFn = vi.fn(async (sql: string, params?: any[]) => {
    dbCalls.push({ sql, params });
    if (/SELECT t\.id, t\.fee_id, t\.status, f\.application_id, f\.amount AS fee_amount/.test(sql)) {
      return {
        rows: [
          { id: 'txn-1', fee_id: 'fee-1', status: 'PENDING', application_id: 'app-1', fee_amount: '500' },
        ],
      };
    }
    if (/SELECT a\.applicant_email, a\.applicant_name, f\.fee_head/.test(sql)) {
      return {
        rows: [{ applicant_email: 'sonia@example.com', applicant_name: 'Sonia', fee_head: 'ADMISSION_FEE' }],
      };
    }
    return { rows: [] };
  });

  return {
    query: queryFn,
    withTransaction: vi.fn(async (fn: (client: any) => Promise<void>) => {
      await fn({ query: queryFn });
    }),
  };
});

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/email-templates/payment-receipt', () => ({
  renderPaymentReceipt: vi.fn().mockReturnValue({ subject: 's', html: 'h', text: 't' }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const checkOrderStatusMock = vi.fn();
vi.mock('@/lib/payments/phonepe', () => ({
  checkOrderStatus: (...args: any[]) => checkOrderStatusMock(...args),
}));

import { POST } from '@/app/api/payments/phonepe/verify/route';

function makeRequest(body: any) {
  return new Request('http://localhost/api/payments/phonepe/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  dbCalls.length = 0;
  checkOrderStatusMock.mockReset();
});

describe('POST /api/payments/phonepe/verify', () => {
  it('marks payment as done on COMPLETED: transactions.SUCCESS, fees.PAID, applications.SUBMITTED + payment_status=PAID', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_1', state: 'COMPLETED', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_OK' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { status: 'SUCCESS' } });

    const txnUpdate = dbCalls.find((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql));
    expect(txnUpdate, 'transactions table updated to SUCCESS').toBeTruthy();

    const feeUpdate = dbCalls.find((c) => /UPDATE fees[\s\S]*status='PAID'/.test(c.sql));
    expect(feeUpdate, 'fees row marked PAID').toBeTruthy();

    const appUpdate = dbCalls.find((c) => /UPDATE applications[\s\S]*payment_status\s*=\s*'PAID'/.test(c.sql));
    expect(appUpdate, "applications.payment_status set to 'PAID'").toBeTruthy();
    expect(appUpdate?.sql, 'flips DRAFT to SUBMITTED on first verify').toMatch(/'SUBMITTED'::application_status/);
    expect(appUpdate?.params).toEqual(['app-1']);
  });

  it('marks the transaction FAILED on a FAILED gateway state, without touching fees/applications', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_2', state: 'FAILED', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_BAD' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'FAILED' });

    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='FAILED'/.test(c.sql))).toBe(true);
    expect(dbCalls.some((c) => /UPDATE fees/.test(c.sql))).toBe(false);
    expect(dbCalls.some((c) => /UPDATE applications/.test(c.sql))).toBe(false);
  });

  it('returns PENDING without mutating anything when the gateway state is still pending', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_3', state: 'PENDING', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_PENDING' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'PENDING' });
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('rejects when COMPLETED amount does not match fee_amount', async () => {
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_4', state: 'COMPLETED', amount: 1 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_AMT' }));
    expect(res.status).toBe(400);
    expect(dbCalls.some((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql))).toBe(false);
  });

  it('is idempotent: re-verifying a SUCCESS transaction returns idempotent without calling PhonePe again', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', fee_id: 'fee-1', status: 'SUCCESS', application_id: 'app-1', fee_amount: '500' }] };
    });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_DUP' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'SUCCESS', idempotent: true });
    expect(checkOrderStatusMock).not.toHaveBeenCalled();
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('re-verifying a FAILED transaction still checks the gateway, and short-circuits idempotently when it is still not COMPLETED', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', fee_id: 'fee-1', status: 'FAILED', application_id: 'app-1', fee_amount: '500' }] };
    });
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_FAIL_DUP', state: 'FAILED', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_FAIL_DUP' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'FAILED', idempotent: true });
    expect(checkOrderStatusMock).toHaveBeenCalledWith('ADM_FAIL_DUP');
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('re-verifying a FAILED transaction stays idempotent when the gateway now reports PENDING', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', fee_id: 'fee-1', status: 'FAILED', application_id: 'app-1', fee_amount: '500' }] };
    });
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_FAIL_PEND', state: 'PENDING', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_FAIL_PEND' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'FAILED', idempotent: true });
    expect(dbCalls.some((c) => /UPDATE/.test(c.sql))).toBe(false);
  });

  it('recovers a superseded (FAILED) transaction when the gateway now reports COMPLETED: finalizes as SUCCESS with a RECOVERED_AFTER_SUPERSEDE audit event', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [{ id: 'txn-1', fee_id: 'fee-1', status: 'FAILED', application_id: 'app-1', fee_amount: '500' }] };
    });
    checkOrderStatusMock.mockResolvedValueOnce({ orderId: 'OMO_RECOVER', state: 'COMPLETED', amount: 50000 });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_RECOVER' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'SUCCESS' });

    const txnUpdate = dbCalls.find((c) => /UPDATE transactions[\s\S]*status='SUCCESS'/.test(c.sql));
    expect(txnUpdate, 'transactions table updated to SUCCESS').toBeTruthy();

    const feeUpdate = dbCalls.find((c) => /UPDATE fees[\s\S]*status='PAID'/.test(c.sql));
    expect(feeUpdate, 'fees row marked PAID').toBeTruthy();

    const appUpdate = dbCalls.find((c) => /UPDATE applications[\s\S]*payment_status\s*=\s*'PAID'/.test(c.sql));
    expect(appUpdate, "applications.payment_status set to 'PAID'").toBeTruthy();

    const auditInsert = dbCalls.find(
      (c) => /INSERT INTO audit_logs/.test(c.sql) && JSON.stringify(c.params).includes('PHONEPE_VERIFY_RECOVERED_AFTER_SUPERSEDE'),
    );
    expect(auditInsert, 'logs PHONEPE_VERIFY_RECOVERED_AFTER_SUPERSEDE instead of the normal success event').toBeTruthy();
    const normalSuccessAudit = dbCalls.find(
      (c) => /INSERT INTO audit_logs/.test(c.sql) && JSON.stringify(c.params).includes('PHONEPE_VERIFY_SUCCESS'),
    );
    expect(normalSuccessAudit, 'does not also log the normal PHONEPE_VERIFY_SUCCESS event').toBeFalsy();
  });

  it('rejects when transaction is not found', async () => {
    const { query } = await import('@/lib/db');
    vi.mocked(query).mockImplementationOnce(async (sql: string, params?: any[]) => {
      dbCalls.push({ sql, params });
      return { rows: [] };
    });

    const res = await POST(makeRequest({ merchantOrderId: 'ADM_404' }));
    expect(res.status).toBe(404);
  });

  it('rejects when merchantOrderId is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/required/i);
  });
});
