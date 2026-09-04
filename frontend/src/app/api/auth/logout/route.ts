import { NextRequest } from 'next/server';
import {
  getUserFromToken,
  invalidateAllSessions,
  createAuditLog,
  verifyToken,
  revokeJti,
} from '@/lib/auth';
import {
  successResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { AuthAPI } from '@/types/api';

/**
 * POST /api/auth/logout
 *
 * Terminate user session by invalidating all JWT sessions.
 * Logs the logout action for audit purposes.
 */
export async function POST(request: NextRequest) {
  try {
    const body: AuthAPI.LogoutRequest = await request.json();
    const { token } = body;

    if (!token) {
      // Even without a token, consider the client "logged out"
      return successResponse({
        success: true,
        message: 'Logged out successfully',
      } as AuthAPI.LogoutResponse);
    }

    // Verify token and get user info
    const user = await getUserFromToken(token);

    if (!user) {
      // Token invalid/expired — still return success for client-side cleanup
      return successResponse({
        success: true,
        message: 'Logged out successfully',
      } as AuthAPI.LogoutResponse);
    }

    // Invalidate all sessions for this user
    try {
      await invalidateAllSessions(user.id);
    } catch (err) {
      console.error('Session invalidation error:', err);
      // Don't fail the request
    }

    // Log logout action
    await createAuditLog({
      entityType: 'USER',
      entityId: user.id,
      action: 'LOGOUT',
      performedBy: user.id,
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // S-25: revoke the access token's jti so it cannot be used until expiry.
    try {
      const decoded = verifyToken(token) as { jti?: string; exp?: number };
      if (decoded.jti && decoded.exp) revokeJti(decoded.jti, decoded.exp);
    } catch {
      /* best-effort revoke */
    }

    const response: AuthAPI.LogoutResponse = {
      success: true,
      message: 'Logged out successfully',
    };

    // S-08: clear the HttpOnly cookie too.
    const res = successResponse(response);
    res.cookies.set('auth_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
  } catch (error: any) {
    console.error('Error in /api/auth/logout:', error);
    return serverErrorResponse('Logout failed', error);
  }
}
