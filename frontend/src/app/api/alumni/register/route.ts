import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifySignedSessionToken } from '@/lib/auth';

const VERTICAL_MAP: Record<string, string> = {
  'boys-hostel': 'BOYS_HOSTEL',
  'girls-hostel': 'GIRLS_ASHRAM',
};

interface ReferenceInput {
  name: string;
  batch?: string;
  email?: string;
  phone?: string;
  relationship?: string;
  consent: boolean;
}

function toIntOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      firstName, middleName, lastName, popularName, email, phone,
      institution, yearOfJoining, yearOfPassing,
      hometownCity, hometownState,
      currentCity, currentState, currentCountry,
      currentDesignation, currentOrganisation, profession,
      linkedinUrl, instagramUrl,
      graduation, graduationYear, highestQualification, highestQualificationYear,
      department, rollNumber, hostelName, roomNumber,
      yearsOfStayFrom, yearsOfStayTo,
      profilePhotoPath, proofDocumentPath,
      privacyConsent, visibility,
      references,
    } = body as Record<string, unknown> & { references?: ReferenceInput[] };

    if (!firstName || !lastName || !email || !institution) {
      return NextResponse.json({ success: false, error: 'firstName, lastName, email and institution are required' }, { status: 400 });
    }

    // S-12: registration intent token must match the submitted email.
    const intentToken =
      ((body as Record<string, unknown>).intentToken as string | undefined) ||
      request.headers.get('x-register-intent') ||
      undefined;
    if (!intentToken) {
      return NextResponse.json(
        { success: false, error: 'Registration intent token required. Refresh the page and try again.' },
        { status: 401 },
      );
    }
    const intent = verifySignedSessionToken(intentToken) as
      | { purpose?: string; email?: string }
      | null;
    if (
      !intent ||
      intent.purpose !== 'alumni_registration' ||
      !intent.email ||
      String(intent.email).toLowerCase().trim() !== String(email).toLowerCase().trim()
    ) {
      return NextResponse.json(
        { success: false, error: 'Registration intent token does not match the submitted email' },
        { status: 401 },
      );
    }

    const vertical = VERTICAL_MAP[String(institution)];
    if (!vertical) {
      return NextResponse.json({ success: false, error: 'Alumni registration is only available for Boys Hostel and Girls Hostel' }, { status: 400 });
    }

    if (!privacyConsent) {
      return NextResponse.json({ success: false, error: 'Privacy consent is required' }, { status: 400 });
    }

    const refs: ReferenceInput[] = Array.isArray(references) ? references : [];
    const filledRefs = refs.filter(r => r && typeof r.name === 'string' && r.name.trim() !== '');
    if (filledRefs.length < 1) {
      return NextResponse.json({ success: false, error: 'At least 1 reference is required' }, { status: 400 });
    }
    if (!filledRefs.every(r => r.consent === true)) {
      return NextResponse.json({ success: false, error: 'Consent is required for every reference' }, { status: 400 });
    }

    const visibilityJson = visibility && typeof visibility === 'object'
      ? visibility
      : { email: 'alumni-only', phone: 'private', batch: 'alumni-only' };

    const result = await withTransaction(async (client) => {
      const insertAlumni = await client.query(
        `INSERT INTO alumni (
          vertical, first_name, middle_name, last_name, popular_name, email, phone,
          year_of_joining, year_of_passing, years_of_stay_from, years_of_stay_to,
          hometown_city, hometown_state,
          current_city, current_state, current_country,
          current_designation, current_organisation, profession,
          linkedin_url, instagram_url,
          graduation, graduation_year, highest_qualification, highest_qualification_year,
          department, roll_number, hostel_name, room_number,
          profile_photo_path, proof_document_path,
          visibility, privacy_consent, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13,
          $14, $15, $16,
          $17, $18, $19,
          $20, $21,
          $22, $23, $24, $25,
          $26, $27, $28, $29,
          $30, $31,
          $32, $33, 'PENDING')
        RETURNING id, status, created_at`,
        [
          vertical, firstName, middleName || null, lastName, popularName || null, String(email).toLowerCase(), phone || null,
          toIntOrNull(yearOfJoining), toIntOrNull(yearOfPassing), toIntOrNull(yearsOfStayFrom), toIntOrNull(yearsOfStayTo),
          hometownCity || null, hometownState || null,
          currentCity || null, currentState || null, currentCountry || null,
          currentDesignation || null, currentOrganisation || null, profession || null,
          linkedinUrl || null, instagramUrl || null,
          graduation || null, toIntOrNull(graduationYear), highestQualification || null, toIntOrNull(highestQualificationYear),
          department || null, rollNumber || null, hostelName || null, roomNumber || null,
          profilePhotoPath || null, proofDocumentPath || null,
          JSON.stringify(visibilityJson), Boolean(privacyConsent),
        ]
      );

      const alumniId = insertAlumni.rows[0].id;

      for (const ref of filledRefs) {
        await client.query(
          `INSERT INTO alumni_references (alumni_id, name, batch, email, phone, relationship, consent)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [alumniId, ref.name, ref.batch || null, ref.email || null, ref.phone || null, ref.relationship || null, true]
        );
      }

      return insertAlumni.rows[0];
    });

    return NextResponse.json({
      success: true,
      data: { id: result.id, status: result.status, createdAt: result.created_at },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('alumni_email_key') || message.includes('duplicate key')) {
      return NextResponse.json({ success: false, error: 'An alumni record with this email already exists' }, { status: 409 });
    }
    logger.error('Alumni register failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to register alumni' }, { status: 500 });
  }
}
