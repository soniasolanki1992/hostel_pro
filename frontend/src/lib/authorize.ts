import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, getUserFromToken } from './auth';

export type UserRole = 'STUDENT' | 'SUPERINTENDENT' | 'TRUSTEE' | 'ACCOUNTS' | 'PARENT' | 'ALUMNI';

export interface AuthUser {
  id: string;
  email: string | null;
  mobile: string;
  full_name: string;
  role: UserRole;
  vertical: string | null;
  is_active: boolean;
}

/**
 * Authenticate the request and return the user.
 * Returns null if auth is not required (public routes).
 * Throws NextResponse if auth fails.
 *
 * S-08 (additive): the access token can arrive either via the existing
 * `Authorization: Bearer …` header (legacy localStorage flow) or via an
 * `auth_token` HttpOnly cookie (recommended). The cookie path is the
 * forward-looking secure path; the header path is preserved so existing
 * dashboard fetches keep working during migration.
 */
export async function requireAuth(
  request: NextRequest,
  allowedRoles?: UserRole[]
): Promise<AuthUser> {
  const token =
    extractTokenFromHeader(request.headers.get('authorization')) ||
    request.cookies.get('auth_token')?.value ||
    null;

  if (!token) {
    throw NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  const user = await getUserFromToken(token);
  if (!user) {
    throw NextResponse.json(
      { success: false, error: 'Invalid or expired token' },
      { status: 401 }
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role as UserRole)) {
    throw NextResponse.json(
      { success: false, error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  return user as AuthUser;
}

/**
 * Optional auth — returns user if token present, null otherwise.
 * Does not throw. Useful for routes that work both authenticated and unauthenticated.
 */
export async function optionalAuth(request: NextRequest): Promise<AuthUser | null> {
  const token =
    extractTokenFromHeader(request.headers.get('authorization')) ||
    request.cookies.get('auth_token')?.value ||
    null;
  if (!token) return null;

  const user = await getUserFromToken(token);
  return user as AuthUser | null;
}

/**
 * Verify the authenticated user can access a specific student's data.
 * - Students can only access their own data
 * - Parents can access their children's data (checked via application mobile match)
 * - Superintendents can access students in their vertical
 * - Trustees and Accounts can access all students
 */
export function canAccessStudent(authUser: AuthUser, studentId: string, studentVertical?: string | null): boolean {
  switch (authUser.role) {
    case 'STUDENT':
      return authUser.id === studentId;
    case 'PARENT':
      // Parent access is checked at query level (by mobile match), allow here
      return true;
    case 'SUPERINTENDENT':
      // Superintendent can only access students in their vertical (S-15).
      // If either side's vertical is missing we deny — previously this branch
      // returned true, allowing cross-vertical access whenever a record had a
      // null/empty vertical column.
      if (!authUser.vertical || !studentVertical) return false;
      return authUser.vertical === studentVertical;
    case 'TRUSTEE':
    case 'ACCOUNTS':
      return true; // Full access
    default:
      return false;
  }
}

/**
 * Get vertical filter for superintendent queries.
 * Returns the vertical string for SUPERINTENDENTs, null for others (no filter).
 */
export function getVerticalFilter(authUser: AuthUser): string | null {
  if (authUser.role === 'SUPERINTENDENT' && authUser.vertical) {
    return authUser.vertical;
  }
  return null;
}
