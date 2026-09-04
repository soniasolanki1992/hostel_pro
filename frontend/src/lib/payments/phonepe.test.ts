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

import {
  getPhonePeConfig,
  generateMerchantOrderId,
  createOrder,
  checkOrderStatus,
  verifyWebhookAuth,
  __resetTokenCache,
} from './phonepe';

beforeEach(() => {
  vi.restoreAllMocks();
  __resetTokenCache();
});

describe('getPhonePeConfig', () => {
  it('reads config from env', () => {
    const cfg = getPhonePeConfig();
    expect(cfg.clientId).toBe('TEST_CLIENT_ID');
    expect(cfg.clientSecret).toBe('TEST_CLIENT_SECRET');
    expect(cfg.clientVersion).toBe('1');
    expect(cfg.env).toBe('SANDBOX');
  });

  it('throws when required vars are missing', () => {
    vi.stubEnv('PHONEPE_CLIENT_ID', '');
    expect(() => getPhonePeConfig()).toThrow(/PHONEPE_CLIENT_ID/);
    vi.stubEnv('PHONEPE_CLIENT_ID', 'TEST_CLIENT_ID');
  });
});

describe('generateMerchantOrderId', () => {
  it('produces a stable-prefixed, unique-looking id under 64 chars', () => {
    const id1 = generateMerchantOrderId('11111111-2222-3333-4444-555555555555');
    const id2 = generateMerchantOrderId('11111111-2222-3333-4444-555555555555');
    expect(id1).toMatch(/^ADM_/);
    expect(id1.length).toBeLessThanOrEqual(63);
    expect(id1).not.toBe(id2);
  });
});

describe('createOrder', () => {
  it('fetches an OAuth token then POSTs order creation with amount in paise', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'TOKEN123', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: 'OMO_TEST',
          state: 'PENDING',
          redirectUrl: 'https://mercury-t2.phonepe.com/transact/TEST',
        }),
      } as Response);

    const order = await createOrder({
      amount: 500,
      merchantOrderId: 'ADM_TEST_1',
      redirectUrl: 'http://localhost:3000/apply/payment-callback',
    });

    expect(order.orderId).toBe('OMO_TEST');
    expect(order.checkoutUrl).toBe('https://mercury-t2.phonepe.com/transact/TEST');

    const [authUrl, authInit] = fetchSpy.mock.calls[0];
    expect(String(authUrl)).toMatch(/oauth\/token/);
    expect((authInit?.headers as Record<string, string>)['Content-Type']).toMatch(/x-www-form-urlencoded/);

    const [orderUrl, orderInit] = fetchSpy.mock.calls[1];
    expect(String(orderUrl)).toMatch(/\/pay$/);
    expect((orderInit?.headers as Record<string, string>).Authorization).toBe('O-Bearer TOKEN123');
    const body = JSON.parse(orderInit?.body as string);
    expect(body.merchantOrderId).toBe('ADM_TEST_1');
    expect(body.amount).toBe(50000);
    expect(body.paymentFlow.merchantUrls.redirectUrl).toBe('http://localhost:3000/apply/payment-callback');
  });

  it('caches the OAuth token across two createOrder calls within its expiry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'CACHED_TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderId: 'O1', state: 'PENDING', redirectUrl: 'https://x/1' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderId: 'O2', state: 'PENDING', redirectUrl: 'https://x/2' }),
      } as Response);

    await createOrder({ amount: 500, merchantOrderId: 'A', redirectUrl: 'http://x' });
    await createOrder({ amount: 500, merchantOrderId: 'B', redirectUrl: 'http://x' });

    // 1 auth call + 2 order calls = 3 total (auth NOT repeated)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('throws when PhonePe returns an error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'invalid amount' }),
      } as Response);

    await expect(
      createOrder({ amount: 0, merchantOrderId: 'X', redirectUrl: 'http://x' }),
    ).rejects.toThrow(/invalid amount/);
  });

  it('throws when the response has an orderId but no redirectUrl', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderId: 'OMO_NO_REDIRECT', state: 'PENDING' }),
      } as Response);

    await expect(
      createOrder({ amount: 500, merchantOrderId: 'Y', redirectUrl: 'http://x' }),
    ).rejects.toThrow(/missing redirectUrl in response/);
  });
});

describe('checkOrderStatus', () => {
  it('fetches order status keyed by merchantOrderId', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderId: 'OMO_1', state: 'COMPLETED', amount: 50000 }),
      } as Response);

    const status = await checkOrderStatus('ADM_TEST_1');
    expect(status.state).toBe('COMPLETED');
    expect(status.amount).toBe(50000);
  });
});

describe('verifyWebhookAuth', () => {
  it('accepts the correct SHA-256(username:password) hex digest', () => {
    const expected = createHash('sha256').update('webhookuser:webhookpass').digest('hex');
    expect(verifyWebhookAuth(expected)).toBe(true);
  });

  it('rejects a wrong digest', () => {
    expect(verifyWebhookAuth('deadbeef')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyWebhookAuth(null)).toBe(false);
  });
});
