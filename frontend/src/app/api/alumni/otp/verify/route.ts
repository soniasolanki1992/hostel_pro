import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyOtp, createAlumniAccessToken, createAuditLog } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/alumni/otp/verify
 * Verifies OTP and mints a JWT for an approved alumni. If the alumni does
 * not yet have a linked users row (legacy seed data), one is created on the fly.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`alumni-otp-verify:${ip}`, { maxRequests: 5, windowSeconds: 900 });
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many verification attempts. Try again in ${rl.retryAfterSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { code, token } = await request.json();
    if (!code || !/^\d{4,6}$/.test(String(code))) {
      return NextResponse.json({ success: false, error: 'Invalid OTP code' }, { status: 400 });
    }
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token required' }, { status: 400 });
    }

    let email: string;
    try {
      const decoded = JSON.parse(Buffer.from(String(token), 'base64').toString('utf-8'));
      email = String(decoded.email || '').toLowerCase();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const verification = await verifyOtp(email, String(code), 'ALUMNI_LOGIN');
    if (!verification.valid) {
      return NextResponse.json({ success: false, error: verification.error || 'Invalid OTP' }, { status: 401 });
    }

    const alumniRes = await query(
      `SELECT id, status, email, vertical
       FROM alumni WHERE LOWER(email) = $1`,
      [email]
    );
    if (alumniRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Alumni not found' }, { status: 404 });
    }
    const alumni = alumniRes.rows[0];
    if (alumni.status !== 'APPROVED') {
      return NextResponse.json({ success: false, error: 'Alumni not approved' }, { status: 403 });
    }

    const accessToken = createAlumniAccessToken({
      alumniId: alumni.id,
      email: alumni.email,
      vertical: alumni.vertical,
    });

    await createAuditLog({
      entityType: 'alumni',
      entityId: alumni.id,
      action: 'LOGIN',
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      token: accessToken,
      alumniId: alumni.id,
      redirect: '/alumni/dashboard',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni OTP verify failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to verify OTP' }, { status: 500 });
  }
}
