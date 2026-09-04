import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/authorize';
import { logger } from '@/lib/logger';

const VERTICAL_FOR_SLUG: Record<string, string> = {
  'boys-hostel': 'BOYS_HOSTEL',
  'girls-hostel': 'GIRLS_ASHRAM',
};
const SLUG_FOR_VERTICAL: Record<string, string> = {
  BOYS_HOSTEL: 'boys-hostel',
  GIRLS_ASHRAM: 'girls-hostel',
};

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['ALUMNI', 'TRUSTEE', 'SUPERINTENDENT', 'ACCOUNTS']);
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const institutionSlug = searchParams.get('institution');
    const batch = searchParams.get('batch');

    const conds: string[] = [`status = 'APPROVED'`];
    const params: unknown[] = [];
    let i = 1;

    if (institutionSlug && institutionSlug !== 'all' && VERTICAL_FOR_SLUG[institutionSlug]) {
      conds.push(`vertical = $${i++}`);
      params.push(VERTICAL_FOR_SLUG[institutionSlug]);
    }
    if (q) {
      conds.push(`(LOWER(first_name) LIKE $${i} OR LOWER(last_name) LIKE $${i} OR LOWER(popular_name) LIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }
    if (batch && batch !== 'all') {
      conds.push(`(year_of_joining || '-' || year_of_passing) = $${i++}`);
      params.push(batch);
    }

    const { rows } = await query(
      `SELECT id, vertical, first_name, middle_name, last_name, email, phone, year_of_joining, year_of_passing,
              department, hostel_name, room_number, visibility, profile_photo_path
       FROM alumni
       WHERE ${conds.join(' AND ')}
       ORDER BY year_of_passing DESC NULLS LAST, last_name ASC`,
      params
    );

    const data = rows.map((r) => {
      const vis = (r.visibility || {}) as Record<string, string>;
      const fullName = `${r.first_name} ${r.middle_name ? r.middle_name + ' ' : ''}${r.last_name}`.replace(/\s+/g, ' ').trim();
      const batchStr = r.year_of_joining && r.year_of_passing ? `${r.year_of_joining}-${r.year_of_passing}` : '';
      const hostelRoom = [r.hostel_name, r.room_number].filter(Boolean).join(', Room ');
      return {
        id: r.id,
        name: fullName,
        institution: SLUG_FOR_VERTICAL[r.vertical] || r.vertical,
        batch: batchStr,
        department: r.department || '',
        hostelRoom,
        email: vis.email === 'alumni-only' ? r.email : null,
        phone: vis.phone === 'alumni-only' ? r.phone : null,
        visibility: vis,
        profilePhotoPath: r.profile_photo_path,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni directory failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to load directory' }, { status: 500 });
  }
}
