import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { comparePassword, createSession, createAuditLog, isKnownSeedHash } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
  validateFields,
} from '@/lib/api/responses';
import { AuthAPI, UserRole, Vertical } from '@/types/api';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/login
 *
 * Authenticate user with username/email/mobile and password.
 * Uses custom PostgreSQL + JWT for secure password verification.
 * Returns JWT access token and user role for session management.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`login:${ip}`, { maxRequests: 5, windowSeconds: 900 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many login attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body: AuthAPI.LoginRequest = await request.json();
    const { username, password } = body;

    // Validate input
    const validation = validateFields([
      {
        field: 'username',
        value: username,
        rules: [
          {
            type: 'required',
            message: 'Username, email, or mobile number is required',
          },
        ],
      },
      {
        field: 'password',
        value: password,
        rules: [
          {
            type: 'required',
            message: 'Password is required',
          },
        ],
      },
    ]);

    if (!validation.isValid) {
      return badRequestResponse('Validation failed', validation.errors);
    }

    // Find user by email or mobile in users table
    const normalizedInput = username.toLowerCase().trim();
    const normalizedMobile = username.replace(/\s/g, '');

    const userResult = await query(
      `SELECT * FROM users WHERE LOWER(email) = $1 OR mobile = $2 LIMIT 1`,
      [normalizedInput, normalizedMobile]
    );

    const user = userResult.rows[0];

    if (!user) {
      return unauthorizedResponse('Invalid credentials');
    }

    // Check user status
    if (!user.is_active) {
      return unauthorizedResponse(
        'Account is inactive. Please contact administration.'
      );
    }

    // Check if user has a password_hash set
    if (!user.password_hash) {
      return unauthorizedResponse(
        'Account not configured. Please contact administration.'
      );
    }

    // S-04: in production, refuse logins for accounts whose password_hash
    // matches a published seed hash. Operators must rotate these via the
    // admin reset-password flow before the account can be used.
    if (
      process.env.NODE_ENV === 'production' &&
      isKnownSeedHash(user.password_hash)
    ) {
      logger.error('Refused login for seed-hash account', {
        userId: user.id,
        email: user.email,
      });
      return unauthorizedResponse(
        'Account password must be rotated by an administrator before first use.'
      );
    }

    // Verify password using bcrypt
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return unauthorizedResponse('Invalid credentials');
    }

    // Check if first-time login (password never changed)
    const requiresPasswordChange = user.requires_password_change || false;

    // Create JWT session
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const { accessToken } = await createSession(user.id, ip, userAgent);

    // Get user's vertical
    const vertical: Vertical | undefined = user.vertical as Vertical;

    // Log successful login
    await createAuditLog({
      entityType: 'USER',
      entityId: user.id,
      action: 'LOGIN',
      performedBy: user.id,
      ipAddress: ip,
      userAgent,
      metadata: {
        email: user.email,
        role: user.role,
      },
    });

    const response: AuthAPI.LoginResponse = {
      success: true,
      role: user.role as UserRole,
      token: accessToken,
      userId: user.id,
      requiresPasswordChange,
      ...(vertical && { vertical }),
      message: requiresPasswordChange
        ? 'Login successful. Please change your password.'
        : 'Login successful',
    };

    // S-08: also set an HttpOnly cookie alongside the response body so
    // dashboards can migrate away from localStorage at their own pace.
    const res = successResponse(response);
    res.cookies.set('auth_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 2 * 60 * 60, // matches JWT_EXPIRES_IN
    });
    return res;
  } catch (error: any) {
    logger.error('Login failed', { route: '/api/auth/login', error: error.message });
    return serverErrorResponse('Login failed', error);
  }
}
