import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export interface PhonePeConfig {
  clientId: string;
  clientSecret: string;
  clientVersion: string;
  env: 'SANDBOX' | 'PRODUCTION';
  webhookUsername: string;
  webhookPassword: string;
}

const DEFAULT_URLS = {
  SANDBOX: {
    auth: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    api: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  PRODUCTION: {
    auth: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    api: 'https://api.phonepe.com/apis/pg',
  },
} as const;

export function getPhonePeConfig(): PhonePeConfig {
  const clientId = process.env.PHONEPE_CLIENT_ID || '';
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET || '';
  const clientVersion = process.env.PHONEPE_CLIENT_VERSION || '';
  const env = (process.env.PHONEPE_ENV || 'SANDBOX') as 'SANDBOX' | 'PRODUCTION';
  const webhookUsername = process.env.PHONEPE_WEBHOOK_USERNAME || '';
  const webhookPassword = process.env.PHONEPE_WEBHOOK_PASSWORD || '';
  if (!clientId || !clientSecret || !clientVersion) {
    throw new Error(
      'PhonePe env vars not configured: PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION required',
    );
  }
  return { clientId, clientSecret, clientVersion, env, webhookUsername, webhookPassword };
}

function authUrl(cfg: PhonePeConfig): string {
  return process.env.PHONEPE_AUTH_URL || DEFAULT_URLS[cfg.env].auth;
}

function apiBaseUrl(cfg: PhonePeConfig): string {
  return process.env.PHONEPE_API_BASE_URL || DEFAULT_URLS[cfg.env].api;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function generateMerchantOrderId(applicationId: string): string {
  const short = applicationId.replace(/-/g, '').slice(0, 12);
  const ts = Date.now().toString(36);
  const rand = randomBytes(3).toString('hex');
  return `ADM_${short}_${ts}_${rand}`.slice(0, 63);
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}
let cachedToken: CachedToken | null = null;

// Private export for test reset only
export function __resetTokenCache() {
  cachedToken = null;
}

async function getAuthToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now) {
    return cachedToken.accessToken;
  }
  const cfg = getPhonePeConfig();
  const res = await fetch(authUrl(cfg), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_version: cfg.clientVersion,
      client_secret: cfg.clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok || !json?.access_token) {
    throw new Error(`PhonePe auth failed: ${json?.message || res.status}`);
  }
  cachedToken = {
    accessToken: json.access_token,
    expiresAtMs: Number(json.expires_at) * 1000,
  };
  return cachedToken.accessToken;
}

export interface PhonePeOrder {
  orderId: string;
  checkoutUrl: string;
  state: string;
}

export async function createOrder(opts: {
  amount: number; // rupees
  merchantOrderId: string;
  redirectUrl: string;
}): Promise<PhonePeOrder> {
  const cfg = getPhonePeConfig();
  const token = await getAuthToken();
  const res = await fetch(`${apiBaseUrl(cfg)}/checkout/v2/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
    },
    body: JSON.stringify({
      merchantOrderId: opts.merchantOrderId,
      amount: Math.round(opts.amount * 100), // paise
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl: opts.redirectUrl },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok || !json?.orderId || !json?.redirectUrl) {
    const message =
      res.ok && json?.orderId && !json?.redirectUrl
        ? 'missing redirectUrl in response'
        : json?.message || res.status;
    throw new Error(`PhonePe createOrder failed: ${message}`);
  }
  return { orderId: json.orderId, checkoutUrl: json.redirectUrl, state: json.state || 'PENDING' };
}

export interface PhonePeOrderStatus {
  orderId: string;
  state: 'COMPLETED' | 'FAILED' | 'PENDING' | string;
  amount: number;
}

export async function checkOrderStatus(merchantOrderId: string): Promise<PhonePeOrderStatus> {
  const cfg = getPhonePeConfig();
  const token = await getAuthToken();
  const res = await fetch(`${apiBaseUrl(cfg)}/checkout/v2/order/${merchantOrderId}/status`, {
    headers: { Authorization: `O-Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`PhonePe checkOrderStatus failed: ${json?.message || res.status}`);
  }
  return { orderId: json.orderId, state: json.state, amount: json.amount };
}

export function verifyWebhookAuth(authorizationHeader: string | null): boolean {
  if (!authorizationHeader) return false;
  const cfg = getPhonePeConfig();
  if (!cfg.webhookUsername || !cfg.webhookPassword) return false;
  const expected = createHash('sha256')
    .update(`${cfg.webhookUsername}:${cfg.webhookPassword}`)
    .digest('hex');
  return constantTimeEqualHex(expected, authorizationHeader);
}
