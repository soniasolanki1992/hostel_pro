import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifySignedSessionToken } from '@/lib/auth';

function normalizeMobile(input: string): string {
  return (input || '').replace(/\D/g, '').slice(-10);
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`drafts-by-mobile:${ip}`, { maxRequests: 10, windowSeconds: 900 });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: `Too many requests. Try again in ${rl.retryAfterSeconds}s.` }),
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Content-Type': 'application/json' } },
      );
    }

    const body = await request.json();
    const mobile = normalizeMobile(body.mobile);
    const sessionToken: string = body.sessionToken;

    if (!mobile || mobile.length !== 10) return badRequestResponse('Valid 10-digit mobile is required');
    if (!sessionToken) return badRequestResponse('sessionToken is required');

    const payload = verifySignedSessionToken(sessionToken) as { contact?: string; verified?: boolean } | null;
    if (!payload || payload.verified !== true) return unauthorizedResponse('Invalid session');
    if (normalizeMobile(payload.contact || '') !== mobile) return unauthorizedResponse('Session does not match mobile');

    // Lazy cleanup: archive DRAFTs older than 1 year for this mobile.
    await query(
      `UPDATE applications
          SET current_status = 'ARCHIVED'
        WHERE applicant_mobile = $1
          AND current_status = 'DRAFT'
          AND created_at < NOW() - INTERVAL '1 year'`,
      [mobile],
    );

    const { rows } = await query(
      `SELECT id, tracking_number, vertical, created_at
         FROM applications
        WHERE applicant_mobile = $1
          AND current_status = 'DRAFT'
        ORDER BY created_at DESC`,
      [mobile],
    );

    return successResponse(
      rows.map((r) => ({
        id: r.id,
        trackingNumber: r.tracking_number,
        vertical: r.vertical,
        createdAt: r.created_at,
      })),
    );
  } catch (error: any) {
    console.error('Error in POST /api/applications/drafts-by-mobile:', error);
    return serverErrorResponse('Failed to look up drafts', error);
  }
}
