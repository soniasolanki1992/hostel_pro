import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { optionalAuth } from '@/lib/authorize';
import { verifySignedSessionToken } from '@/lib/auth';

/**
 * GET /api/applications/track/[trackingNumber]
 *
 * Public endpoint with two response shapes (S-02):
 *
 *  - Unauthenticated callers receive a SAFE projection: tracking_number,
 *    current_status, vertical, payment_status, submitted/created timestamps.
 *    The `data` jsonb (PII), applicant mobile, and the application UUID
 *    are NOT returned, preventing tracking-number enumeration from
 *    harvesting personal data.
 *
 *  - Authenticated staff (SUPERINTENDENT/TRUSTEE/ACCOUNTS) OR an
 *    OTP-verified applicant session whose mobile matches the application
 *    receive the FULL row.
 *
 * Optional `?sessionToken=` query param accepts the same OTP session token
 * issued by /api/otp/verify, mirroring the drafts-by-mobile contract.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingNumber: string }> }
) {
  try {
    const { trackingNumber } = await params;
    const url = new URL(request.url);
    const sessionToken = url.searchParams.get('sessionToken');

    const { rows } = await query(
      'SELECT * FROM applications WHERE tracking_number = $1',
      [trackingNumber]
    );

    if (rows.length === 0) {
      return notFoundResponse(
        `No application found with tracking number: ${trackingNumber}`
      );
    }

    const app = rows[0];

    // Decide if the caller may see full PII.
    const authUser = await optionalAuth(request);
    const isStaff =
      authUser &&
      ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS'].includes(authUser.role);

    let isApplicant = false;
    if (sessionToken) {
      const payload = verifySignedSessionToken(sessionToken) as
        | { contact?: string; verified?: boolean }
        | null;
      if (payload && payload.verified === true) {
        const tokenMobile = (payload.contact || '').replace(/\D/g, '').slice(-10);
        const appMobile = String(app.applicant_mobile || '').replace(/\D/g, '').slice(-10);
        if (tokenMobile && tokenMobile === appMobile) {
          isApplicant = true;
        }
      }
    }

    if (isStaff || isApplicant) {
      return successResponse(app);
    }

    // Unauthenticated public projection — no PII, no UUID.
    const safe = {
      tracking_number: app.tracking_number,
      current_status: app.current_status,
      vertical: app.vertical,
      payment_status: app.payment_status,
      submitted_at: app.submitted_at,
      created_at: app.created_at,
    };
    return successResponse(safe);
  } catch (error: any) {
    return serverErrorResponse('Failed to track application', error);
  }
}
