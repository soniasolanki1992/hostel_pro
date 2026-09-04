import { NextRequest, NextResponse } from 'next/server';
import { saveFile } from '@/lib/storage';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { detectMimeFromBytes, isAcceptedMime } from '@/lib/file-type';
import { verifySignedSessionToken } from '@/lib/auth';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/**
 * POST /api/alumni/documents/upload
 *
 * Alumni registration upload (S-12).
 *
 * Defenses:
 *  - Required `intentToken` (HMAC-signed, 30-min TTL) issued by
 *    /api/alumni/register/init when the register page loads. Binds the
 *    upload to a real registration intent without forcing an OTP step.
 *  - Per-IP rate limit (10 / hour).
 *  - Strict size cap (10 MB).
 *  - Server-side magic-byte MIME validation (S-21).
 *  - UUID-prefixed sanitised file names.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`alumni-upload-ip:${ip}`, {
      maxRequests: 10,
      windowSeconds: 60 * 60,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many uploads — try again later.' },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const kind = (formData.get('kind') as string | null) || 'profilePhoto';
    const intentToken =
      (formData.get('intentToken') as string | null) ||
      request.headers.get('x-register-intent') ||
      null;

    // S-12: require a signed registration-intent token.
    if (!intentToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Registration intent token required. Refresh the registration page and try again.',
        },
        { status: 401 },
      );
    }
    const intent = verifySignedSessionToken(intentToken) as
      | { purpose?: string; email?: string }
      | null;
    if (!intent || intent.purpose !== 'alumni_registration' || !intent.email) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired registration intent token' },
        { status: 401 },
      );
    }

    if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ success: false, error: 'File exceeds 10 MB limit' }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: `File type '${file.type}' not allowed. Accepted: PDF, JPEG, PNG` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // S-21: sniff magic bytes to detect content/Content-Type mismatch.
    const detected = detectMimeFromBytes(buffer);
    if (!detected || !isAcceptedMime(detected, ALLOWED_MIME_TYPES)) {
      return NextResponse.json(
        { success: false, error: 'File contents do not match the declared type' },
        { status: 400 },
      );
    }

    const subPath = kind === 'proofDocument' ? 'proof' : 'photo';
    const path = await saveFile(buffer, 'alumni', subPath, file.name);

    return NextResponse.json({ success: true, data: { path, fileName: file.name, mimeType: file.type, size: file.size } });
  } catch (error: unknown) {
    console.error('Alumni upload failed', error);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
