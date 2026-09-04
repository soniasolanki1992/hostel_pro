import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, createAuditLog, generateSecureTempPassword } from '@/lib/auth';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';
import {
  successResponse,
  badRequestResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/superintendent/reset-password
 *
 * Reset a resident's password. Generates a random temp password and
 * forces the resident to change it on next login.
 *
 * Auth: SUPERINTENDENT or TRUSTEE
 * Body: { userId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE']);
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return badRequestResponse('userId is required');
    }

    // Fetch the target resident — verify they are a STUDENT and (for superintendents) same vertical
    const vertical = getVerticalFilter(authUser);
    const verticalClause = vertical ? 'AND vertical = $2' : '';
    const params = vertical ? [userId, vertical] : [userId];

    const { rows } = await query(
      `SELECT id, full_name, email, mobile, role, vertical
       FROM users
       WHERE id = $1 AND role = 'STUDENT' AND is_active = true ${verticalClause}`,
      params
    );

    if (rows.length === 0) {
      return badRequestResponse('Resident not found or not in your vertical');
    }

    const resident = rows[0];

    // Generate a secure temp password that satisfies password policy
    const tempPassword = generateSecureTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await query(
      `UPDATE users
       SET password_hash = $1,
           requires_password_change = true,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, resident.id]
    );

    const ip = getClientIp(request);
    await createAuditLog({
      entityType: 'USER',
      entityId: resident.id,
      action: 'PASSWORD_RESET_BY_ADMIN',
      performedBy: authUser.id,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || 'unknown',
      metadata: {
        reset_by_role: authUser.role,
        target_name: resident.full_name,
        target_vertical: resident.vertical,
        note: 'Temp password issued, requires_password_change set',
      },
    });

    return successResponse({
      tempPassword,
      residentName: resident.full_name,
      email: resident.email,
      mobile: resident.mobile,
    }, 'Password reset successfully. Share the temporary password with the resident.');
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    return serverErrorResponse('Failed to reset password', error);
  }
}
