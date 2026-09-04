import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api/responses';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';

/**
 * GET /api/applications/waitlist
 * List applications currently on the waitlist (status = WAITLIST), ordered FIFO.
 * Auth: SUPERINTENDENT (own vertical only), TRUSTEE.
 * Optional query param: ?vertical=BOYS_HOSTEL|GIRLS_ASHRAM|DHARAMSHALA
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE']);
    const { searchParams } = new URL(request.url);
    const verticalParam = searchParams.get('vertical');

    const conditions: string[] = [`current_status = 'WAITLIST'`];
    const params: string[] = [];

    const verticalFilter = getVerticalFilter(user) || verticalParam;
    if (verticalFilter) {
      params.push(verticalFilter);
      conditions.push(`vertical = $${params.length}`);
    }

    const sql = `
      SELECT id, tracking_number, applicant_name, applicant_mobile, applicant_email,
             vertical, current_status, waitlisted_at, approved_at, data, created_at
      FROM applications
      WHERE ${conditions.join(' AND ')}
      ORDER BY waitlisted_at ASC NULLS LAST, created_at ASC
    `;

    const { rows } = await query(sql, params);
    return successResponse(rows);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/applications/waitlist:', error);
    return serverErrorResponse('Failed to fetch waitlist', error);
  }
}
