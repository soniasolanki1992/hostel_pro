import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from './db';

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start with insecure defaults.');
}
// Reject placeholder values copied verbatim from .env.example. (S-22)
const JWT_SECRET_PLACEHOLDERS = [
  'generate-a-strong-random-secret-at-least-48-chars',
  'change-me',
  'your-jwt-secret',
];
if (
  JWT_SECRET_PLACEHOLDERS.includes(process.env.JWT_SECRET) ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error(
    'FATAL: JWT_SECRET is a placeholder or shorter than 32 chars. Refusing to start. Generate one with: openssl rand -hex 48'
  );
}
const JWT_SECRET = process.env.JWT_SECRET;
// S-24: shorter access token; the existing refresh token still gives the
// user a 7-day rolling session. A stolen access token is now usable for ≤2h
// of inactivity rather than 24h.
const JWT_EXPIRES_IN = 2 * 60 * 60; // 2 hours in seconds
const JWT_REFRESH_EXPIRES_IN = 604800; // 7 days in seconds
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 3;
const SALT_ROUNDS = 12;

// ============================================================================
// JWT
// ============================================================================

export interface JwtPayload {
  sub: string;        // user.id
  email?: string;
  phone?: string;
  role: string;
  vertical?: string;
  type?: 'access' | 'refresh';
}

// S-25: in-memory jti denylist. Each issued token carries a unique jti;
// `revokeJti` adds a jti to the deny set, and `verifyToken` rejects any
// token whose jti is denied. The set is GC'd opportunistically when the
// token's underlying expiry passes (no entry needs to outlive 2h).
//
// This is a single-instance solution; multi-instance deployments must
// promote to a Redis or PostgreSQL-backed set.
type DenyEntry = { exp: number };
const jtiDenylist = new Map<string, DenyEntry>();

function pruneDenylist() {
  const now = Math.floor(Date.now() / 1000);
  for (const [jti, entry] of jtiDenylist) {
    if (entry.exp <= now) jtiDenylist.delete(jti);
  }
}

export function revokeJti(jti: string, exp: number) {
  if (!jti) return;
  jtiDenylist.set(jti, { exp });
}

export function isJtiRevoked(jti?: string): boolean {
  if (!jti) return false;
  pruneDenylist();
  return jtiDenylist.has(jti);
}

export function signAccessToken(payload: Omit<JwtPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, jwtid: crypto.randomUUID() },
  );
}

export function signRefreshToken(payload: Omit<JwtPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN, jwtid: crypto.randomUUID() },
  );
}

export function verifyToken(token: string): JwtPayload & { jti?: string; exp?: number } {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { jti?: string; exp?: number };
  if (isJtiRevoked(decoded.jti)) {
    throw new Error('Token has been revoked');
  }
  return decoded;
}

// ============================================================================
// PASSWORD
// ============================================================================

/**
 * Bcrypt hashes from sql/002_seed_test_users.sql for `Password123` (S-04).
 * If any of these are present in the live `users` table when NODE_ENV=production
 * the app refuses authentication for that account — preventing a leaked
 * staging seed from becoming a backdoor in production.
 */
const KNOWN_SEED_HASHES = new Set<string>([
  '$2b$12$BVZ6IVRfoDLBIHgF8I8AcOXM92KBUA2Ff9EDAfVxeDXwvVY5mHpCi',
]);

export function isKnownSeedHash(hash: string): boolean {
  return KNOWN_SEED_HASHES.has(hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength. Single source of truth for all endpoints.
 * Returns null if valid, or an error message string if invalid.
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*]/.test(password)) return 'Password must contain at least one special character (!@#$%^&*)';
  return null;
}

/**
 * Generate a cryptographically secure temporary password that satisfies
 * the password policy (8+ chars, uppercase, lowercase, number, special).
 */
export function generateSecureTempPassword(): string {
  // Guarantee one of each required character class
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';

  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];

  // Start with one from each required class
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];

  // Fill remaining 8 chars from the full pool
  const pool = upper + lower + digits + special;
  const remaining = Array.from({ length: 8 }, () => pick(pool));

  // Shuffle all 12 chars using Fisher-Yates
  const all = [...required, ...remaining];
  for (let i = all.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.join('');
}

/**
 * Generate a cryptographically signed session token with expiry.
 * Used for OTP-verified guest sessions (applicants, parents).
 */
export function createSignedSessionToken(
  data: Record<string, unknown>,
  expirySeconds: number = 1800 // 30 minutes
): string {
  const expires = Math.floor(Date.now() / 1000) + expirySeconds;
  const payload = { ...data, exp: expires, sid: crypto.randomBytes(16).toString('hex') };
  const payloadStr = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(payloadStr)
    .digest('hex');

  return Buffer.from(JSON.stringify({ p: payloadStr, s: signature })).toString('base64url');
}

/**
 * Verify a signed session token. Returns the payload if valid, or null.
 *
 * Pass `{ ignoreExpiry: true }` to accept a signature-valid token whose `exp`
 * has passed. This is only safe for flows that re-issue a fresh token (e.g.
 * resending an OTP), never for granting access — the signature still proves we
 * issued the token, but the session window has lapsed.
 */
export function verifySignedSessionToken(
  token: string,
  options: { ignoreExpiry?: boolean } = {}
): Record<string, unknown> | null {
  try {
    const { p: payloadStr, s: signature } = JSON.parse(Buffer.from(token, 'base64url').toString());

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(payloadStr)
      .digest('hex');

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(payloadStr);

    // Check expiry
    if (!options.ignoreExpiry && payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

// ============================================================================
// OTP
// ============================================================================

export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Mock-OTP gate (S-06): in production we always require a real OTP; in lower
// environments the developer must opt in by setting MOCK_OTP_ENABLED=true.
// NODE_ENV-based shortcuts are removed because a misconfigured deploy would
// otherwise turn 'NODE_ENV=development' into a universal authentication bypass.
const MOCK_OTP_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.MOCK_OTP_ENABLED === 'true';
if (process.env.NODE_ENV === 'production' && process.env.MOCK_OTP_ENABLED === 'true') {
  throw new Error('FATAL: MOCK_OTP_ENABLED must not be set in production.');
}
const MOCK_OTP_VALUE = process.env.MOCK_OTP_VALUE || '123456';

export async function createOtp(identifier: string, purpose: string): Promise<string> {
  const otp = MOCK_OTP_ENABLED ? MOCK_OTP_VALUE : generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing OTP for this identifier+purpose
  await query(
    `UPDATE otp_verifications SET verified = true WHERE identifier = $1 AND purpose = $2 AND verified = false`,
    [identifier, purpose]
  );

  await query(
    `INSERT INTO otp_verifications (identifier, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [identifier, otp, purpose, expiresAt]
  );

  return otp;
}

export async function verifyOtp(identifier: string, code: string, purpose: string): Promise<{ valid: boolean; error?: string }> {
  const result = await query(
    `SELECT id, otp_code, attempts, expires_at FROM otp_verifications
     WHERE identifier = $1 AND purpose = $2 AND verified = false
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'No OTP found. Please request a new one.' };
  }

  const otpRecord = result.rows[0];

  if (new Date() > new Date(otpRecord.expires_at)) {
    return { valid: false, error: 'OTP has expired. Please request a new one.' };
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    return { valid: false, error: 'Maximum attempts exceeded. Please request a new OTP.' };
  }

  // Increment attempts
  await query(`UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1`, [otpRecord.id]);

  if (otpRecord.otp_code !== code) {
    return { valid: false, error: 'Invalid OTP code.' };
  }

  // Mark as verified
  await query(`UPDATE otp_verifications SET verified = true WHERE id = $1`, [otpRecord.id]);

  return { valid: true };
}

// ============================================================================
// SESSION
// ============================================================================

export async function createSession(userId: string, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string }> {
  const userResult = await query(`SELECT id, email, mobile, role, vertical FROM users WHERE id = $1`, [userId]);
  if (userResult.rows.length === 0) throw new Error('User not found');

  const user = userResult.rows[0];
  const payload: Omit<JwtPayload, 'type'> = {
    sub: user.id,
    email: user.email,
    phone: user.mobile,
    role: user.role,
    vertical: user.vertical,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store refresh token hash in sessions table
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await query(
    `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, ip, userAgent, expiresAt]
  );

  return { accessToken, refreshToken };
}

export async function invalidateSession(refreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function invalidateAllSessions(userId: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

// ============================================================================
// AUDIT LOG HELPER
// ============================================================================

export async function createAuditLog(params: {
  entityType: string;
  entityId: string;
  action: string;
  performedBy?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  metadata?: unknown;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, old_value, new_value, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3::audit_action, $4, $5, $6, $7, $8, $9)`,
      [
        params.entityType,
        params.entityId,
        params.action,
        params.performedBy,
        params.oldValue ? JSON.stringify(params.oldValue) : null,
        params.newValue ? JSON.stringify(params.newValue) : null,
        params.ipAddress,
        params.userAgent,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );
  } catch {
    // Audit log failure should not break the main flow
    console.error('Failed to write audit log');
  }
}

// ============================================================================
// TOKEN EXTRACTION HELPER
// ============================================================================

export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function getUserFromToken(token: string) {
  try {
    const payload = verifyToken(token);
    if (payload.type === 'refresh') return null; // Don't accept refresh tokens as access

    // Alumni live in their own table — synthesise an AuthUser-shaped row.
    if (payload.role === 'ALUMNI') {
      const result = await query(
        `SELECT id, email, phone AS mobile, first_name, last_name, vertical, status
         FROM alumni WHERE id = $1`,
        [payload.sub]
      );
      if (result.rows.length === 0 || result.rows[0].status !== 'APPROVED') return null;
      const a = result.rows[0];
      return {
        id: a.id,
        email: a.email,
        mobile: a.mobile || '',
        full_name: `${a.first_name} ${a.last_name}`.trim(),
        role: 'ALUMNI',
        vertical: a.vertical,
        is_active: true,
      };
    }

    const result = await query(
      `SELECT id, email, mobile, full_name, role, vertical, is_active FROM users WHERE id = $1`,
      [payload.sub]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) return null;
    return result.rows[0];
  } catch {
    return null;
  }
}

/**
 * Mint an access token for an alumni without requiring a row in `users`.
 * The JWT subject is the alumni's primary key.
 */
export function createAlumniAccessToken(params: {
  alumniId: string;
  email: string;
  vertical: string;
}): string {
  return signAccessToken({
    sub: params.alumniId,
    email: params.email,
    role: 'ALUMNI',
    vertical: params.vertical,
  });
}
