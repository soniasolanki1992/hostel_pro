import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { resendOtp } from '@/lib/msg91';
import { sendEmail } from '@/lib/mailer';
import { sendWhatsappOtp } from '@/lib/twilio-whatsapp';
import { createSignedSessionToken, verifySignedSessionToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { buildOtpEmail } from '@/lib/otp-email';
import { logger } from '@/lib/logger';

/**
 * POST /api/otp/resend
 *
 * Resend OTP for application or parent login flows.
 * Email OTPs are regenerated locally and re-sent via SMTP (signed token).
 * SMS OTPs use the MSG91 retry API (base64 JSON token).
 *
 * Request body:
 * - token: string - Original token from /api/otp/send response
 * - retryType?: 'text' | 'voice' - Channel for SMS retry (default: 'text')
 *
 * Response:
 * - Success: 200 with { success: true, token: string, expiresIn: number }
 * - Error: 400/401/429/500 with { message: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 resend attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`otp-resend:${ip}`, { maxRequests: 5, windowSeconds: 900 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: `Too many resend attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { token, retryType } = body;

    // Validate input
    if (!token) {
      return NextResponse.json(
        { message: 'Token is required' },
        { status: 400 }
      );
    }

    // Decode token. Email OTPs use signed tokens (HMAC); SMS uses base64 JSON.
    // Accept an expired signed token here: resend issues a fresh OTP + token,
    // so recovering the (signature-verified) contact from a lapsed session is safe.
    let tokenData: any = verifySignedSessionToken(token, { ignoreExpiry: true });
    if (!tokenData) {
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        tokenData = JSON.parse(decoded);
      } catch {
        return NextResponse.json(
          { message: 'Invalid or expired token' },
          { status: 401 }
        );
      }
    }

    const contact = tokenData.contact;
    const vertical = tokenData.vertical;

    if (!contact) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      );
    }

    // Rate limiting: require at least 60 seconds between resends (SMS tokens carry a timestamp)
    if (typeof tokenData.timestamp === 'number') {
      const timeSinceOriginal = Date.now() - tokenData.timestamp;
      const minResendInterval = 60000; // 60 seconds
      if (timeSinceOriginal < minResendInterval) {
        const secondsRemaining = Math.ceil((minResendInterval - timeSinceOriginal) / 1000);
        return NextResponse.json(
          { message: `Please wait ${secondsRemaining} seconds before requesting a new OTP` },
          { status: 429 }
        );
      }
    }

    // Self-generated channels (email, WhatsApp): regenerate the code, deliver via
    // the channel's transport, and embed the fresh hash in a new signed token.
    if (tokenData.channel === 'email' || tokenData.channel === 'whatsapp') {
      const otp = String(crypto.randomInt(100000, 1000000));
      const otpHash = await bcrypt.hash(otp, 10);

      if (tokenData.channel === 'whatsapp') {
        const waResult = await sendWhatsappOtp(contact, otp, vertical);
        if (!waResult.success) {
          logger.error('OTP resend failed via WhatsApp', { contact, error: waResult.error });
          return NextResponse.json(
            { message: 'Failed to resend WhatsApp OTP. Please try again.' },
            { status: 500 }
          );
        }
      } else {
        const { subject, html, text } = buildOtpEmail(otp, vertical);
        const mailResult = await sendEmail({ to: contact, subject, html, text });

        if (!mailResult.success) {
          logger.error('OTP resend failed via SMTP', { contact, error: mailResult.error });
          return NextResponse.json(
            { message: 'Failed to resend OTP email. Please try again.' },
            { status: 500 }
          );
        }
      }

      const newToken = createSignedSessionToken({
        contact,
        vertical,
        channel: tokenData.channel,
        otpHash,
      }, 300); // 5 min expiry

      return NextResponse.json({
        success: true,
        token: newToken,
        expiresIn: 300,
        message: `New OTP sent to ${contact}`,
      });
    }

    // SMS OTP path: MSG91 retry API.
    const msg91Result = await resendOtp(contact, retryType || 'text');

    if (!msg91Result.success) {
      logger.error('OTP resend failed via MSG91', { contact, error: msg91Result.message });
      return NextResponse.json(
        { message: 'Failed to resend OTP. Please try again.' },
        { status: 500 }
      );
    }

    // Generate new token with same contact info but new timestamp
    const newToken = Buffer.from(JSON.stringify({
      contact,
      vertical,
      channel: 'sms',
      timestamp: Date.now(),
    })).toString('base64');

    return NextResponse.json({
      success: true,
      token: newToken,
      expiresIn: 300, // 5 minutes
      message: `New OTP sent to ${contact}`,
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('OTP resend failed', { route: '/api/otp/resend', error: errMsg });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
