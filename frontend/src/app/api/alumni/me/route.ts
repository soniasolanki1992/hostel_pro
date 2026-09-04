import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/authorize';
import { logger } from '@/lib/logger';

const SLUG_FOR_VERTICAL: Record<string, string> = {
  BOYS_HOSTEL: 'boys-hostel',
  GIRLS_ASHRAM: 'girls-hostel',
};

interface AlumniRow extends Record<string, unknown> {
  bio?: string;
}

function shape(row: AlumniRow) {
  const vertical = String(row.vertical);
  return {
    id: row.id,
    name: `${row.first_name ?? ''} ${row.middle_name ? row.middle_name + ' ' : ''}${row.last_name ?? ''}`.replace(/\s+/g, ' ').trim(),
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    popularName: row.popular_name,
    email: row.email,
    phone: row.phone,
    institution: SLUG_FOR_VERTICAL[vertical] || vertical,
    vertical,
    department: row.department,
    hostelBlock: row.hostel_name,
    roomNumber: row.room_number,
    yearsOfStay: row.years_of_stay_from && row.years_of_stay_to ? `${row.years_of_stay_from}-${row.years_of_stay_to}` : null,
    yearOfJoining: row.year_of_joining,
    yearOfPassing: row.year_of_passing,
    batch: row.year_of_joining && row.year_of_passing ? `${row.year_of_joining}-${row.year_of_passing}` : null,
    currentCity: row.current_city,
    currentState: row.current_state,
    currentCountry: row.current_country,
    currentDesignation: row.current_designation,
    currentOrganisation: row.current_organisation,
    profession: row.profession,
    linkedinUrl: row.linkedin_url,
    instagramUrl: row.instagram_url,
    profilePhotoPath: row.profile_photo_path,
    visibility: row.visibility,
    status: row.status,
    bio: row.bio || '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ALUMNI']);
    const { rows } = await query(`SELECT * FROM alumni WHERE id = $1`, [user.id]);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Alumni profile not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: shape(rows[0]) });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni GET /me failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ALUMNI']);
    const body = await request.json();

    const allowedFields: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      phone: 'phone',
      currentCity: 'current_city',
      currentState: 'current_state',
      currentCountry: 'current_country',
      currentDesignation: 'current_designation',
      currentOrganisation: 'current_organisation',
      profession: 'profession',
      linkedinUrl: 'linkedin_url',
      instagramUrl: 'instagram_url',
      department: 'department',
      hostelBlock: 'hostel_name',
      roomNumber: 'room_number',
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, col] of Object.entries(allowedFields)) {
      if (key in body) {
        sets.push(`${col} = $${idx++}`);
        params.push(body[key] ?? null);
      }
    }

    if ('visibility' in body && body.visibility && typeof body.visibility === 'object') {
      sets.push(`visibility = $${idx++}`);
      params.push(JSON.stringify(body.visibility));
    }

    if (sets.length === 0) {
      return NextResponse.json({ success: false, error: 'No updatable fields provided' }, { status: 400 });
    }

    params.push(user.id);
    const { rows } = await query(
      `UPDATE alumni SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Alumni profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: shape(rows[0]) });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni PATCH /me failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }
}
