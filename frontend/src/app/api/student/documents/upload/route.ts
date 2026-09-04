import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { saveFile, deleteFile } from '@/lib/storage';
import { requireAuth } from '@/lib/authorize';
import { detectMimeFromBytes, isAcceptedMime } from '@/lib/file-type';

const DOCUMENT_TYPE_MAP: Record<string, string> = {
  'PHOTOGRAPH': 'PHOTOGRAPH',
  'AADHAAR_CARD': 'AADHAAR_CARD',
  'BIRTH_CERTIFICATE': 'BIRTH_CERTIFICATE',
  'EDUCATION_CERTIFICATE': 'EDUCATION_CERTIFICATE',
  'INCOME_CERTIFICATE': 'INCOME_CERTIFICATE',
  'MEDICAL_CERTIFICATE': 'MEDICAL_CERTIFICATE',
  'ANTI_RAGGING': 'ANTI_RAGGING',
  'HOSTEL_RULES': 'HOSTEL_RULES',
  'OTHER': 'OTHER',
  // Legacy mappings
  'AADHAR_CARD': 'AADHAAR_CARD',
  'PHOTO': 'PHOTOGRAPH',
  'MARKSHEET': 'EDUCATION_CERTIFICATE',
  'TRANSFER_CERTIFICATE': 'EDUCATION_CERTIFICATE',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/**
 * POST /api/student/documents/upload
 * Upload a document to local storage and create DB record
 * Auth: STUDENT only
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['STUDENT']);
    const formData = await request.formData();

    const file = formData.get('file') as File;
    const studentId = formData.get('student_id') as string;
    const documentType = formData.get('document_type') as string;
    const category = formData.get('category') as string;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (!studentId) {
      return NextResponse.json({ success: false, error: 'Student ID is required' }, { status: 400 });
    }
    if (!documentType) {
      return NextResponse.json({ success: false, error: 'Document type is required' }, { status: 400 });
    }

    // Students can only upload their own documents
    if (studentId !== user.id) {
      return NextResponse.json({ success: false, error: 'Cannot upload documents for another student' }, { status: 403 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File size exceeds 10 MB limit' }, { status: 400 });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `File type '${file.type}' not allowed. Accepted: PDF, JPEG, PNG` },
        { status: 400 }
      );
    }

    const dbDocumentType = DOCUMENT_TYPE_MAP[documentType] || 'OTHER';

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // S-21: server-side magic-byte check.
    const detected = detectMimeFromBytes(buffer);
    if (!detected || !isAcceptedMime(detected, ALLOWED_MIME_TYPES)) {
      return NextResponse.json(
        { success: false, error: 'File contents do not match the declared type' },
        { status: 400 }
      );
    }

    const filePath = await saveFile(buffer, 'students', studentId, file.name);

    // Create document record in database
    const result = await query(
      `INSERT INTO documents (student_user_id, document_type, category, file_name, file_path, file_size, mime_type, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'UPLOADED')
       RETURNING id`,
      [studentId, dbDocumentType, category || 'OTHER', file.name, filePath, file.size, file.type]
    );

    if (result.rows.length === 0) {
      await deleteFile(filePath);
      return NextResponse.json({ success: false, error: 'Failed to save document record' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.rows[0].id,
        fileName: file.name,
        documentType,
        category,
        storagePath: filePath,
      },
    });
  } catch (error: unknown) {
    if (error instanceof NextResponse) return error;
    console.error('Error in POST /api/student/documents/upload:', error);
    return NextResponse.json({ success: false, error: 'Failed to upload document' }, { status: 500 });
  }
}
