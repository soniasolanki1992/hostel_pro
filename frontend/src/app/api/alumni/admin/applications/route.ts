import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';
import { logger } from '@/lib/logger';

const SLUG_FOR_VERTICAL: Record<string, string> = {
  BOYS_HOSTEL: 'boys-hostel',
  GIRLS_ASHRAM: 'girls-hostel',
};

/**
 * GET /api/alumni/admin/applications
 * Lists alumni registrations. Trustees & Accounts see all; Superintendents
 * are constrained to their own vertical.
 * Query: ?status=PENDING|APPROVED|REJECTED (default PENDING)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['TRUSTEE', 'SUPERINTENDENT', 'ACCOUNTS']);
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'PENDING').toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const conds: string[] = [`status = $1`];
    const params: unknown[] = [status];
    let i = 2;

    const verticalFilter = getVerticalFilter(user);
    if (verticalFilter) {
      conds.push(`vertical = $${i++}`);
      params.push(verticalFilter);
    }

    const { rows } = await query(
      `SELECT id, vertical, first_name, middle_name, last_name, email, phone,
              year_of_joining, year_of_passing, department, hostel_name, room_number,
              status, profile_photo_path, proof_document_path, created_at
       FROM alumni
       WHERE ${conds.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );

    const data = rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.middle_name ? r.middle_name + ' ' : ''}${r.last_name}`.replace(/\s+/g, ' ').trim(),
      email: r.email,
      phone: r.phone,
      institution: SLUG_FOR_VERTICAL[r.vertical] || r.vertical,
      yearOfJoining: r.year_of_joining,
      yearOfPassing: r.year_of_passing,
      department: r.department,
      hostelName: r.hostel_name,
      roomNumber: r.room_number,
      status: r.status,
      profilePhotoPath: r.profile_photo_path,
      proofDocumentPath: r.proof_document_path,
      submittedAt: r.created_at,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni admin list failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to load applications' }, { status: 500 });
  }
}
