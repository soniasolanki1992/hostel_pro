import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { saveFile } from '@/lib/storage';
import { detectMimeFromBytes, isAcceptedMime } from '@/lib/file-type';

const DOCUMENT_TYPE_MAP: Record<string, string> = {
  'photoFile': 'PHOTOGRAPH',
  'PHOTOGRAPH': 'PHOTOGRAPH',
  'birthCertificate': 'BIRTH_CERTIFICATE',
  'BIRTH_CERTIFICATE': 'BIRTH_CERTIFICATE',
  'marksheet': 'EDUCATION_CERTIFICATE',
  'EDUCATION_CERTIFICATE': 'EDUCATION_CERTIFICATE',
  'recommendationLetter': 'OTHER',
  'casteCertificate': 'CASTE_CERTIFICATE',
  'CASTE_CERTIFICATE': 'CASTE_CERTIFICATE',
  'photoWithParents': 'PHOTO_WITH_PARENTS',
  'PHOTO_WITH_PARENTS': 'PHOTO_WITH_PARENTS',
  'photoWithFather': 'PHOTO_WITH_FATHER',
  'PHOTO_WITH_FATHER': 'PHOTO_WITH_FATHER',
  'photoWithMother': 'PHOTO_WITH_MOTHER',
  'PHOTO_WITH_MOTHER': 'PHOTO_WITH_MOTHER',
  'photoWithGuardian': 'PHOTO_WITH_GUARDIAN',
  'PHOTO_WITH_GUARDIAN': 'PHOTO_WITH_GUARDIAN',
  'incomeCertificate': 'INCOME_CERTIFICATE',
  'INCOME_CERTIFICATE': 'INCOME_CERTIFICATE',
  'medicalCertificate': 'MEDICAL_CERTIFICATE',
  'medicalFitnessCertificate': 'MEDICAL_CERTIFICATE',
  'MEDICAL_CERTIFICATE': 'MEDICAL_CERTIFICATE',
  'AADHAAR_CARD': 'AADHAAR_CARD',
  'ANTI_RAGGING': 'ANTI_RAGGING',
  'HOSTEL_RULES': 'HOSTEL_RULES',
  'OTHER': 'OTHER',
  'bonafideCertificate': 'BONAFIDE_CERTIFICATE',
  'BONAFIDE_CERTIFICATE': 'BONAFIDE_CERTIFICATE',
  'caFirmLetter': 'CA_FIRM_LETTER',
  'CA_FIRM_LETTER': 'CA_FIRM_LETTER',
  'aadhaarOrVoterId': 'AADHAAR_CARD',
  'addressProof': 'ADDRESS_PROOF',
  'ADDRESS_PROOF': 'ADDRESS_PROOF',
  'marksheets': 'EDUCATION_CERTIFICATE',
  'feeReceipt': 'FEE_RECEIPT',
  'FEE_RECEIPT': 'FEE_RECEIPT',
  'registrationLetter': 'REGISTRATION_LETTER',
  'REGISTRATION_LETTER': 'REGISTRATION_LETTER',
  'guardianAadhaar': 'GUARDIAN_AADHAAR',
  'GUARDIAN_AADHAAR': 'GUARDIAN_AADHAAR',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/**
 * POST /api/applications/documents/upload
 * Upload a document for an application to local storage.
 * Public endpoint (guest applicants), but requires valid application_id or temp_id.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const file = formData.get('file') as File;
    const documentType = formData.get('document_type') as string;
    const applicationId = formData.get('application_id') as string | null;
    const tempId = formData.get('temp_id') as string | null;

    // --- Validation ---

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (!documentType) {
      return NextResponse.json({ success: false, error: 'Document type is required' }, { status: 400 });
    }

    // Require an identifier to scope the upload
    if (!applicationId && !tempId) {
      return NextResponse.json({ success: false, error: 'Either application_id or temp_id is required' }, { status: 400 });
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

    // If application_id provided, verify it exists in DB
    if (applicationId) {
      const { rows } = await query(
        'SELECT id FROM applications WHERE id = $1',
        [applicationId]
      );
      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Invalid application_id' }, { status: 400 });
      }
    }

    // --- Upload ---

    const dbDocumentType = DOCUMENT_TYPE_MAP[documentType] || 'OTHER';
    const identifier = applicationId || tempId || `temp_${Date.now()}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // S-21: server-side magic-byte check to defeat MIME spoofing.
    const detected = detectMimeFromBytes(buffer);
    if (!detected || !isAcceptedMime(detected, ALLOWED_MIME_TYPES)) {
      return NextResponse.json(
        { success: false, error: 'File contents do not match the declared type' },
        { status: 400 }
      );
    }

    const filePath = await saveFile(buffer, 'applications', identifier, file.name);

    // Save document record to database
    const { rows: docRows } = await query(
      `INSERT INTO documents (application_id, document_type, category, file_name, file_path, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        applicationId || null,
        dbDocumentType,
        DOCUMENT_TYPE_MAP[documentType] === 'PHOTOGRAPH' || dbDocumentType === 'BIRTH_CERTIFICATE' ? 'IDENTITY' : 'ADMISSION',
        file.name,
        filePath,
        file.size,
        file.type,
      ]
    );

    return NextResponse.json({
      success: true,
      data: {
        id: docRows[0]?.id,
        documentType,
        dbDocumentType,
        originalFileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storagePath: filePath,
      },
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/applications/documents/upload:', error);
    return NextResponse.json({ success: false, error: 'Failed to upload document' }, { status: 500 });
  }
}
