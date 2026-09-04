import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth } from '@/lib/authorize';

type Vertical = 'boys-hostel' | 'girls-ashram' | 'dharamshala';

const VERTICALS: Vertical[] = ['boys-hostel', 'girls-ashram', 'dharamshala'];

function settingKey(v: Vertical) {
  return `applications_open_${v}`;
}

const ENUM_TO_VERTICAL: Record<string, Vertical> = {
  'BOYS_HOSTEL': 'boys-hostel',
  'GIRLS_ASHRAM': 'girls-ashram',
  'DHARAMSHALA': 'dharamshala',
};

/**
 * GET /api/config/applications-status
 * Public — returns whether each vertical's application form is open.
 * Default open (true) when no setting row exists.
 */
export async function GET(_request: NextRequest) {
  try {
    const keys = VERTICALS.map(settingKey);
    const { rows } = await query(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)',
      [keys],
    );
    const map: Record<Vertical, boolean> = {
      'boys-hostel': true,
      'girls-ashram': true,
      'dharamshala': true,
    };
    for (const row of rows || []) {
      const v = VERTICALS.find((x) => settingKey(x) === row.key);
      if (v) map[v] = row.value === 'true';
    }
    return successResponse(map);
  } catch (error: any) {
    console.error('GET /api/config/applications-status error:', error);
    return serverErrorResponse('Failed to load application status', error);
  }
}

/**
 * PATCH /api/config/applications-status
 * Body: { vertical: 'boys-hostel' | 'girls-ashram' | 'dharamshala', open: boolean }
 * - SUPERINTENDENT may only toggle their own vertical.
 * - TRUSTEE may toggle any vertical.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE']);
    const body = await request.json().catch(() => null);
    const vertical = body?.vertical as Vertical | undefined;
    const open = body?.open;
    if (!vertical || !VERTICALS.includes(vertical)) {
      return badRequestResponse('Invalid vertical');
    }
    if (typeof open !== 'boolean') {
      return badRequestResponse('`open` must be boolean');
    }

    if (user.role === 'SUPERINTENDENT') {
      const userVertical = user.vertical && ENUM_TO_VERTICAL[user.vertical];
      if (!userVertical || userVertical !== vertical) {
        return NextResponse.json(
          { success: false, error: 'Superintendents may only toggle their own vertical' },
          { status: 403 },
        );
      }
    }

    const key = settingKey(vertical);
    const value = open ? 'true' : 'false';
    await query(
      `INSERT INTO system_settings (key, value, description, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [key, value, `Whether the ${vertical} admission form is open to applicants`, user.id],
    );

    return successResponse({ vertical, open });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('PATCH /api/config/applications-status error:', error);
    return serverErrorResponse('Failed to update application status', error);
  }
}

