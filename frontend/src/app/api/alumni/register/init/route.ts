import { NextRequest, NextResponse } from 'next/server';
import { createSignedSessionToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const REGISTER_INTENT_TTL_SECONDS = 30 * 60; // 30 minutes

/**
 * POST /api/alumni/register/init
 *
 * Issues a short-lived HMAC-signed "registration intent" token (S-12).
 * The alumni register page calls this on mount; the upload route and
 * the final register route then require the same token.
 *
 * The token's `email` claim is matched against the email submitted at
 * upload time and at final register time. This binds storage uploads
 * to a real registration intent without adding an OTP step to the
 * registration UX.
 *
 * Per-IP rate limit prevents bulk token minting.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`alumni-register-init:${ip}`, {
      maxRequests: 20,
      windowSeconds: 60 * 60,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many registration attempts — try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'A valid email is required to begin registration' },
        { status: 400 },
      );
    }

    const intentToken = createSignedSessionToken(
      { purpose: 'alumni_registration', email },
      REGISTER_INTENT_TTL_SECONDS,
    );

    return NextResponse.json({ success: true, data: { intentToken } });
  } catch (error) {
    console.error('Alumni register/init failed', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start registration' },
      { status: 500 },
    );
  }
}
