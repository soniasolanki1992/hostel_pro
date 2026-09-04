import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { sendOtp } from '@/lib/msg91';
import { createSignedSessionToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  successResponse,
  badRequestResponse,
  serverErrorResponse,
  validateFields,
  errorResponse,
} from '@/lib/api/responses';
import { AuthAPI } from '@/types/api';
import { logger } from '@/lib/logger';

const RESET_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * POST /api/auth/forgot-password
 *
 * Initiate password reset process.
 * Sends OTP to user's registered mobile via MSG91.
 * Returns token for password reset verification.
 *
 * @see Task 7 - Student Login (Forgot Password Flow)
 * @see .docs/api-routes-audit.md
 */
export async function POST(request: NextRequest) {
  try {
    const body: AuthAPI.ForgotPasswordRequest = await request.json();
    const { contact } = body;

    // Validate input
    const validation = validateFields([
      {
        field: 'contact',
        value: contact,
        rules: [
          {
            type: 'required',
            message: 'Email or mobile number is required',
          },
        ],
      },
    ]);

    if (!validation.isValid) {
      return badRequestResponse('Validation failed', validation.errors);
    }

    // Rate-limit per contact and per IP — prevents brute-force enumeration and
    // OTP-spam against an arbitrary user. (S-14)
    const ip = getClientIp(request);
    const rlContact = checkRateLimit(`forgot-password:${contact}`, {
      maxRequests: 3,
      windowSeconds: 60 * 60, // 1 hour
    });
    if (!rlContact.allowed) {
      return errorResponse(
        'Too many password-reset requests for this contact. Please try again later.',
        429
      );
    }
    const rlIp = checkRateLimit(`forgot-password-ip:${ip}`, {
      maxRequests: 10,
      windowSeconds: 60 * 60,
    });
    if (!rlIp.allowed) {
      return errorResponse(
        'Too many password-reset requests from this network. Please try again later.',
        429
      );
    }

    // Find user by email or mobile
    const normalizedContact = contact.toLowerCase().trim();
    const normalizedMobile = contact.replace(/\s/g, '');

    const userResult = await query(
      `SELECT id, email, mobile FROM users
       WHERE LOWER(email) = $1 OR mobile = $2
       LIMIT 1`,
      [normalizedContact, normalizedMobile]
    );

    const user = userResult.rows[0];

    // For security, don't reveal if user exists or not
    // Always return success even if user not found
    if (!user) {
      // Sign the mock token so its shape matches a real one — prevents trivial
      // forgery attempts from being distinguishable. (S-01)
      const mockToken = createSignedSessionToken(
        { mock: true, contact },
        RESET_TOKEN_TTL_SECONDS
      );

      return successResponse({
        success: true,
        token: mockToken,
        message:
          'If an account exists with this contact, a password reset OTP has been sent.',
      } as AuthAPI.ForgotPasswordResponse);
    }

    // Send OTP via MSG91
    const userContact = user.mobile || user.email;
    const msg91Result = await sendOtp(
      user.mobile || undefined,
      user.email || undefined
    );

    if (!msg91Result.success) {
      logger.error('Forgot password OTP send failed via MSG91', {
        userId: user.id,
        error: msg91Result.message,
      });
      // Still return success to not reveal user existence
    }

    // Create HMAC-signed reset token bound to the resolved user. (S-01, S-11)
    // The token includes a 15-minute expiry; verifySignedSessionToken will
    // reject any tampered or expired token in /api/auth/reset-password.
    const resetToken = createSignedSessionToken(
      {
        userId: user.id,
        contact: userContact,
      },
      RESET_TOKEN_TTL_SECONDS
    );

    const response: AuthAPI.ForgotPasswordResponse = {
      success: true,
      token: resetToken,
      message: user.email
        ? `Password reset OTP sent to ${user.email}`
        : `Password reset OTP sent to ${user.mobile}`,
    };

    return successResponse(response);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in /api/auth/forgot-password', { error: errMsg });
    return serverErrorResponse('Failed to initiate password reset', error instanceof Error ? error : undefined);
  }
}
