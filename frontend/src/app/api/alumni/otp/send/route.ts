import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createOtp } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/alumni/otp/send
 * Send OTP to an alumni's registered email. Only approved alumni may log in.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`alumni-otp-send:${ip}`, { maxRequests: 3, windowSeconds: 900 });
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many OTP requests. Try again in ${rl.retryAfterSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { email } = await request.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'A valid email is required' }, { status: 400 });
    }

    const normalized = String(email).toLowerCase();
    const { rows } = await query(
      `SELECT id, status FROM alumni WHERE LOWER(email) = $1`,
      [normalized]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No alumni record found for this email' }, { status: 404 });
    }
    if (rows[0].status !== 'APPROVED') {
      return NextResponse.json({
        success: false,
        error: rows[0].status === 'PENDING'
          ? 'Your application is still under review.'
          : 'Your alumni access has been rejected.',
        status: rows[0].status,
      }, { status: 403 });
    }

    const otp = await createOtp(normalized, 'ALUMNI_LOGIN');
    // In production, send via email here. Dev mode hardcodes 123456 (see lib/auth.createOtp).
    logger.info('Alumni OTP issued', { email: normalized, devOtp: process.env.NODE_ENV === 'development' ? otp : undefined });

    const token = Buffer.from(JSON.stringify({ email: normalized, ts: Date.now() })).toString('base64');
    return NextResponse.json({ success: true, token, expiresIn: 300 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni OTP send failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to send OTP' }, { status: 500 });
  }
}
