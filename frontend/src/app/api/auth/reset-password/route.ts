import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  hashPassword,
  verifyOtp,
  createAuditLog,
  validatePasswordStrength,
  verifySignedSessionToken,
} from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  successResponse,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
  validateFields,
  errorResponse,
} from '@/lib/api/responses';
import { AuthAPI } from '@/types/api';

/**
 * POST /api/auth/reset-password
 *
 * Complete password reset with OTP verification.
 * Validates OTP via DB and updates user password hash.
 *
 * @see Task 7 - Student Login (Forgot Password Flow)
 * @see .docs/api-routes-audit.md
 */
export async function POST(request: NextRequest) {
  try {
    const body: AuthAPI.ResetPasswordRequest = await request.json();
    const { token, otp, newPassword } = body;

    // Validate input
    const validation = validateFields([
      {
        field: 'token',
        value: token,
        rules: [
          {
            type: 'required',
            message: 'Reset token is required',
          },
        ],
      },
      {
        field: 'otp',
        value: otp,
        rules: [
          {
            type: 'required',
            message: 'OTP is required',
          },
          {
            type: 'pattern',
            param: /^\d{6}$/,
            message: 'OTP must be a 6-digit number',
          },
        ],
      },
    ]);

    if (!validation.isValid) {
      return badRequestResponse('Validation failed', validation.errors);
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return badRequestResponse(passwordError);
    }

    // Per-IP brute-force throttle on the OTP-verify step. (S-14)
    const ip = getClientIp(request);
    const rl = checkRateLimit(`reset-password-ip:${ip}`, {
      maxRequests: 10,
      windowSeconds: 60 * 60,
    });
    if (!rl.allowed) {
      return errorResponse(
        'Too many password-reset attempts from this network. Please try again later.',
        429
      );
    }

    // Decode and verify HMAC-signed reset token (S-01, S-11). The helper
    // validates both the signature and the embedded `exp` claim.
    const tokenData = verifySignedSessionToken(token) as
      | { userId?: string; contact?: string; mock?: boolean }
      | null;
    if (!tokenData) {
      return unauthorizedResponse('Invalid or expired reset token');
    }

    // Check if token is a mock (user doesn't exist)
    if (tokenData.mock) {
      return unauthorizedResponse('Invalid reset token');
    }

    if (!tokenData.userId || !tokenData.contact) {
      return unauthorizedResponse('Invalid reset token');
    }

    // Verify OTP via DB-backed verification
    const otpResult = await verifyOtp(tokenData.contact, otp, 'password_reset');

    if (!otpResult.valid) {
      return unauthorizedResponse(otpResult.error || 'Invalid OTP code');
    }

    // Find user
    const userResult = await query(
      `SELECT id, email, mobile FROM users WHERE id = $1`,
      [tokenData.userId]
    );

    if (userResult.rows.length === 0) {
      return unauthorizedResponse('User not found');
    }

    const user = userResult.rows[0];

    // Hash new password with bcrypt
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    const updateResult = await query(
      `UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [hashedPassword, user.id]
    );

    if (updateResult.rowCount === 0) {
      return serverErrorResponse('Failed to reset password');
    }

    // Log password reset
    await createAuditLog({
      entityType: 'USER',
      entityId: user.id,
      action: 'PASSWORD_RESET',
      performedBy: user.id,
      newValue: 'RESET',
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      metadata: {
        reset_method: 'OTP',
      },
    });

    const response: AuthAPI.ResetPasswordResponse = {
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.',
    };

    return successResponse(response);
  } catch (error: any) {
    console.error('Error in /api/auth/reset-password:', error);
    return serverErrorResponse('Failed to reset password', error);
  }
}
