import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sendOtp } from '@/lib/msg91';
import { sendEmail } from '@/lib/mailer';
import { createSignedSessionToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { buildOtpEmail } from '@/lib/otp-email';
import { logger } from '@/lib/logger';

/**
 * POST /api/otp/send
 *
 * Send OTP for application or parent login flows.
 * Uses MSG91 OTP API for generation and delivery.
 *
 * Request body:
 * - phone?: string - Mobile number (for SMS OTP)
 * - email?: string - Email address (for Email OTP)
 * - vertical: string - Application vertical (boys-hostel, girls-ashram, dharamshala)
 *
 * Response:
 * - Success: 200 with { success: true, token: string, expiresIn: number }
 * - Error: 400/500 with { message: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 OTP requests per 15 minutes per IP
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`otp-send:${ip}`, { maxRequests: 3, windowSeconds: 900 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: `Too many OTP requests. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { phone, email, vertical } = body;

    // Validate input
    if (!phone && !email) {
      return NextResponse.json(
        { message: 'Either phone or email is required' },
        { status: 400 }
      );
    }

    if (!vertical) {
      return NextResponse.json(
        { message: 'Vertical is required' },
        { status: 400 }
      );
    }

    // Validate phone format (if provided)
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { message: 'Invalid phone number format. Must be 10 digits starting with 6-9.' },
        { status: 400 }
      );
    }

    // Validate email format (if provided)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: 'Invalid email format' },
        { status: 400 }
      );
    }

    const contact = phone || email;

    // Email OTP path: generate locally, send via SMTP, embed hashed OTP in signed token.
    if (email && !phone) {
      const otp = String(crypto.randomInt(100000, 1000000));
      const otpHash = await bcrypt.hash(otp, 10);

      const { subject, html, text } = buildOtpEmail(otp, vertical);
      const mailResult = await sendEmail({ to: email, subject, html, text });

      if (!mailResult.success) {
        logger.error('OTP send failed via SMTP', { contact, error: mailResult.error });
        return NextResponse.json(
          { message: 'Failed to send OTP email. Please try again.' },
          { status: 500 }
        );
      }

      const sessionToken = createSignedSessionToken({
        contact,
        vertical,
        channel: 'email',
        otpHash,
      }, 300); // 5 min expiry

      return NextResponse.json({
        success: true,
        token: sessionToken,
        expiresIn: 300,
        message: `OTP sent to ${email}. Check your inbox (and your Spam/Junk folder if you don't see it).`,
      });
    }

    // Phone OTP path: MSG91 owns generation + verification.
    const msg91Result = await sendOtp(phone, undefined);

    if (!msg91Result.success) {
      logger.error('OTP send failed via MSG91', { contact, error: msg91Result.message });
      return NextResponse.json(
        { message: 'Failed to send OTP. Please try again.' },
        { status: 500 }
      );
    }

    const sessionToken = Buffer.from(JSON.stringify({
      contact,
      vertical,
      channel: 'sms',
      timestamp: Date.now(),
    })).toString('base64');

    return NextResponse.json({
      success: true,
      token: sessionToken,
      expiresIn: 300,
      message: `OTP sent to ${phone}. Check your SMS messages.`,
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('OTP send failed', { route: '/api/otp/send', error: errMsg });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
