import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveAndValidatePath } from '@/lib/storage';
import { optionalAuth } from '@/lib/authorize';
import { verifySignedSessionToken } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

/**
 * GET /api/applications/[id]/photo
 *
 * Returns the applicant's passport-size photograph inline.
 *
 * Access model (S-03):
 *  - When `id` is a UUID (122 bits of entropy → unguessable): the photo
 *    is served without further auth. Callers must already possess the
 *    application's UUID, which the API only emits to authenticated staff
 *    or to OTP-verified applicants. UUIDs cannot be enumerated.
 *  - When `id` is a tracking_number (sequential and guessable): the
 *    caller MUST be authenticated staff (SUPERINTENDENT/TRUSTEE/ACCOUNTS)
 *    OR present an OTP-verified session token whose `contact` mobile
 *    matches the application's `applicant_mobile`.
 *
 * The session token may be supplied via `?sessionToken=` query string or
 * `x-session-token` header.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // Access-control gate fires only when the caller used a tracking_number.
    if (!isUuid) {
      const authUser = await optionalAuth(request);
      const isStaff =
        authUser &&
        ['SUPERINTENDENT', 'TRUSTEE', 'ACCOUNTS'].includes(authUser.role);

      if (!isStaff) {
        const url = new URL(request.url);
        const sessionToken =
          url.searchParams.get('sessionToken') ||
          request.headers.get('x-session-token');

        if (!sessionToken) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        const payload = verifySignedSessionToken(sessionToken) as
          | { contact?: string; verified?: boolean }
          | null;
        if (!payload || payload.verified !== true) {
          return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
        }

        const appRow = (
          await query(
            `SELECT applicant_mobile, applicant_email FROM applications WHERE tracking_number = $1`,
            [id],
          )
        ).rows[0];
        if (!appRow) {
          return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
        }
        // The applicant may have verified by EITHER mobile or email, so match
        // the token's contact against whichever channel it represents.
        const contact = (payload.contact || '').trim();
        let contactMatches = false;
        if (contact.includes('@')) {
          const tokenEmail = contact.toLowerCase();
          const appEmail = String(appRow.applicant_email || '').trim().toLowerCase();
          contactMatches = !!tokenEmail && tokenEmail === appEmail;
        } else {
          const tokenMobile = contact.replace(/\D/g, '').slice(-10);
          const appMobile = String(appRow.applicant_mobile || '').replace(/\D/g, '').slice(-10);
          contactMatches = tokenMobile.length === 10 && tokenMobile === appMobile;
        }
        if (!contactMatches) {
          return NextResponse.json({ error: 'Session does not match application' }, { status: 403 });
        }
      }
    }

    const sql = isUuid
      ? `SELECT d.file_path, d.mime_type, d.file_name
           FROM documents d
          WHERE d.application_id = $1 AND d.document_type = 'PHOTOGRAPH'
          ORDER BY d.uploaded_at DESC
          LIMIT 1`
      : `SELECT d.file_path, d.mime_type, d.file_name
           FROM documents d
           JOIN applications a ON a.id = d.application_id
          WHERE a.tracking_number = $1 AND d.document_type = 'PHOTOGRAPH'
          ORDER BY d.uploaded_at DESC
          LIMIT 1`;

    const { rows } = await query(sql, [id]);
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const { file_path, mime_type, file_name } = rows[0];
    if (!file_path) {
      return NextResponse.json({ error: 'Photo file path missing' }, { status: 404 });
    }

    const absPath = await resolveAndValidatePath(file_path);
    const buffer = await fs.readFile(absPath);
    const ext = path.extname(file_path).toLowerCase();
    const contentType = mime_type || MIME_BY_EXT[ext] || 'application/octet-stream';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${file_name || 'photo' + ext}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('GET /api/applications/[id]/photo error:', error);
    return NextResponse.json({ error: 'Failed to load photo' }, { status: 500 });
  }
}
