#!/usr/bin/env node
/**
 * One-time bulk data import: Rooms + Students, direct from an Excel workbook
 * into Postgres. This is a standalone admin script, NOT part of the running
 * app — no page, no API route, no login. Run it once from the terminal to
 * migrate legacy resident/room data before go-live.
 *
 * Usage (run from the `frontend/` folder):
 *   node scripts/import-data.js --make-template        # writes scripts/import-template.xlsx
 *   node scripts/import-data.js data.xlsx --dry-run     # validate only, writes nothing
 *   node scripts/import-data.js data.xlsx               # actually import
 *
 * Workbook format: up to two sheets, "Rooms" and "Students". Either sheet
 * may be omitted. Rooms are imported before Students so a student row can
 * reference a room_number created earlier in the same file.
 *
 * Rooms columns:    room_number*, vertical*, floor*, capacity*, building,
 *                    room_type, rent_per_head
 * Students columns: full_name*, mobile*, vertical* are required; everything
 *                    else below is optional (legacy records are often
 *                    incomplete — a missing field just leaves that part
 *                    blank rather than rejecting the row):
 *                      email, date_of_birth, gender, blood_group,
 *                      address_line1, address_line2, city, state, pin_code,
 *                      father_name, father_mobile, father_occupation, father_email,
 *                      mother_name, mother_mobile, mother_occupation, mother_email,
 *                      guardian_name, guardian_relationship, guardian_mobile,
 *                      emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship,
 *                      institution, course, year, qualification, percentage, board, passing_year,
 *                      joining_date, duration, room_number
 *   (* = required)     vertical must be one of BOYS_HOSTEL | GIRLS_ASHRAM | DHARAMSHALA
 *
 * Students created this way skip the normal application/interview/approval
 * flow entirely — they become active STUDENT accounts immediately, each
 * with a randomly generated temporary password (requires_password_change =
 * true, same as accounts created via application approval). The temp
 * passwords are printed at the end so they can be handed out; they are not
 * recoverable afterwards — re-run a password reset if lost.
 *
 * For every student row, a matching `applications` record is also created
 * (status APPROVED, linked via student_user_id) carrying the same
 * personal/address/guardian/emergency/academic/hostel data the real
 * application form would have collected. This is what the rest of the app
 * (notably the parent portal, which looks up a student by matching the
 * parent's mobile against applications.data.guardian_info) actually reads —
 * without it, a migrated student would be invisible to their parent.
 *
 * Deliberately NOT captured by this import:
 * - Documents (photo, certificates, marksheets, Aadhaar, etc.) — these are
 *   physical file uploads tied to the `documents` table and real files on
 *   disk; an Excel row can't carry a scanned document. Upload these
 *   separately per student after import, same as any other resident.
 * - Declaration/consent checkboxes (rules acceptance, damage liability,
 *   etc.) — these represent a legal digital consent captured at the moment
 *   someone actually accepted them. This script does NOT mark them
 *   accepted on anyone's behalf; declaration_accepted is left false and
 *   consent should be collected properly (e.g. at the student's next
 *   6-month renewal, which already requires a fresh digital consent).
 *
 * Notes:
 * - Reads DATABASE_URL from process env first, falling back to ../.env.local.
 * - A row with a missing/invalid required field is skipped (logged), not
 *   fatal — one bad row doesn't abort the whole file.
 * - A room_number / mobile that already exists in the DB is skipped
 *   (logged) rather than erroring, so the same file can be re-run safely.
 *
 * ---------------------------------------------------------------------------
 * --client-format mode: importing a client's own admission register as-is
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node scripts/import-data.js "some-file.xlsx" --client-format --vertical=BOYS_HOSTEL [--dry-run]
 *
 * This is a SEPARATE mode from the Rooms/Students template above, for
 * importing a real client-supplied register (e.g. "WhatsApp 2025-26.xlsx")
 * without hand-reformatting it first. It expects a specific known layout —
 * one or more term-period sheets (processed in CLIENT_FORMAT_SHEET_ORDER),
 * each with a 19-column header on row 3 (not row 1), matched by fixed
 * column position because a couple of headers repeat ("R. NO" / "R. NO."):
 *
 *   1 SL NO.  2 ROOM  3 STUDENT NAME  4 FORM  5 TERM  6 COURSE
 *   7 COLLEGE/FIRM NAME  8 N.PLACE  9 MOB NO.
 *   10 FEE  11 R. NO  12 DATE  13 UTR NO.       <- term-fee payment group
 *   14 R. NO.  15 KAYAMI                        <- security deposit group
 *   16 WIFI
 *   17 LOCAL GUARDIAN NAME  18 ADDRESS  19 MOBILE
 *
 * `--vertical` applies uniformly to every row in the file (this register
 * doesn't have a per-row vertical column).
 *
 * Column mapping:
 * - ROOM is a real room_number — must already exist (this file has no
 *   Rooms sheet of its own; run the plain Rooms mode first if needed).
 * - STUDENT NAME -> full_name. COURSE/COLLEGE-FIRM-NAME -> academic_info.
 *   N.PLACE -> address.city (only address field this file has).
 * - LOCAL GUARDIAN NAME/MOBILE -> guardian_info.father_name/father_mobile
 *   (NOT the generic guardian_name/guardian_mobile fields — father_mobile
 *   is what the parent portal actually matches on, see
 *   src/app/api/parent/student/route.ts). This is a "local guardian" in
 *   the source data, not necessarily the legal parent — imported this way
 *   on record. Also reused for emergency_contact (relationship: "Local
 *   Guardian"), the only contact info this file has.
 * - SL NO./FORM/TERM/WIFI/LOCAL GUARDIAN ADDRESS have no structured home in
 *   applications.data — stashed under data.legacy_import for traceability
 *   rather than dropped silently.
 *
 * Fee/deposit data IS imported for real (unlike the plain mode, which
 * doesn't touch fees at all), using the canonical fee_head values already
 * defined in src/lib/fees/feeHeads.ts and the same fee-then-transaction
 * pattern already used by src/app/api/transactions/route.ts (fee inserted
 * PENDING, a transaction inserted SUCCESS, then the fee updated to PAID):
 * - Term fee (cols 10-13) -> a HOSTEL_FEES fee the first time a student is
 *   seen on a given sheet, RENEWAL_FEE if they're seen again on a later
 *   sheet (so two same-sheet installment rows for one student both
 *   correctly count as the same term, not a "renewal").
 * - Kayami (cols 14-15) -> a SECURITY_DEPOSIT fee, reusing the term fee's
 *   DATE as its paid_at since there's no separate date column for it.
 *
 * Dedup is by mobile, but unlike the plain Students mode (which fully
 * skips a row whose mobile already exists), this mode SUPPLEMENTS: an
 * existing student's account/application/allocation is not re-created,
 * but their new fee/transaction rows for this sheet are still added, and
 * if their ROOM number changed since their last-seen sheet they are
 * actually transferred (old allocation vacated, new one created) rather
 * than left stale.
 *
 * Known gaps, deliberate:
 * - A mobile number shared by two different-named students in the file is
 *   a real data problem, not a script bug — both rows are skipped and
 *   logged by name so the source file can be corrected and just those
 *   rows re-imported later. Never auto-merged.
 * - Fee/transaction rows are NOT idempotent — re-running the same file
 *   live a second time will create duplicate fee/transaction records (only
 *   the user/application/allocation side is safe to re-run, same as the
 *   plain mode). Always --dry-run twice before a live run.
 * - No documents, no consent/declaration — same as the plain mode above.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');

const VERTICALS = ['BOYS_HOSTEL', 'GIRLS_ASHRAM', 'DHARAMSHALA'];
const TRACKING_PREFIX = { BOYS_HOSTEL: 'BH', GIRLS_ASHRAM: 'GA', DHARAMSHALA: 'DH' };

// --client-format mode constants (see file header for the full explanation).
const CLIENT_FORMAT_HEADER_ROW = 3;
const CLIENT_FORMAT_DATA_START_ROW = 4;
const CLIENT_FORMAT_SHEET_ORDER = ['JUNE-NOV', 'DEC-APR'];
const CLIENT_FORMAT_EXPECTED_HEADERS = [
  'SL NO.', 'ROOM', 'STUDENT NAME', 'FORM', 'TERM', 'COURSE', 'COLLEGE/FIRM NAME',
  'N.PLACE', 'MOB NO.', 'FEE', 'R. NO', 'DATE', 'UTR NO.', 'R. NO.', 'KAYAMI',
  'WIFI', 'NAME', 'ADDRESS', 'MOBILE',
];
// Mirrors the relevant codes from src/lib/fees/feeHeads.ts (FEE_HEAD_LABELS /
// CANONICAL_FEE_HEADS). That file is a TS/ESM module and can't be require()'d
// from this plain CJS script — keep these three in sync by hand if
// feeHeads.ts ever changes.
const CLIENT_FEE_HEAD = { HOSTEL_FEES: 'HOSTEL_FEES', RENEWAL_FEE: 'RENEWAL_FEE', SECURITY_DEPOSIT: 'SECURITY_DEPOSIT' };
const CLIENT_FEE_HEAD_LABEL = { HOSTEL_FEES: 'First Term Fee', RENEWAL_FEE: 'Renewal Fee', SECURITY_DEPOSIT: 'Hostel Deposit' };

loadEnvFile(path.join(__dirname, '..', '.env.local'));

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

async function makeTemplate() {
  const outPath = path.join(__dirname, 'import-template.xlsx');
  const wb = new ExcelJS.Workbook();

  const rooms = wb.addWorksheet('Rooms');
  rooms.columns = [
    { header: 'room_number', key: 'room_number', width: 14 },
    { header: 'vertical', key: 'vertical', width: 16 },
    { header: 'floor', key: 'floor', width: 8 },
    { header: 'capacity', key: 'capacity', width: 10 },
    { header: 'building', key: 'building', width: 14 },
    { header: 'room_type', key: 'room_type', width: 12 },
    { header: 'rent_per_head', key: 'rent_per_head', width: 14 },
  ];
  rooms.addRow({
    room_number: '101', vertical: 'BOYS_HOSTEL', floor: 1, capacity: 4,
    building: 'Block A', room_type: 'SHARED', rent_per_head: 3500,
  });
  rooms.addRow({
    room_number: '101', vertical: 'GIRLS_ASHRAM', floor: 1, capacity: 4,
    building: 'Block A', room_type: 'SHARED', rent_per_head: 3500,
  });

  const students = wb.addWorksheet('Students');
  students.columns = [
    // Core (required)
    { header: 'full_name', key: 'full_name', width: 22 },
    { header: 'mobile', key: 'mobile', width: 14 },
    { header: 'vertical', key: 'vertical', width: 16 },
    // Personal
    { header: 'email', key: 'email', width: 26 },
    { header: 'date_of_birth', key: 'date_of_birth', width: 16 },
    { header: 'gender', key: 'gender', width: 10 },
    { header: 'blood_group', key: 'blood_group', width: 12 },
    // Address
    { header: 'address_line1', key: 'address_line1', width: 24 },
    { header: 'address_line2', key: 'address_line2', width: 24 },
    { header: 'city', key: 'city', width: 16 },
    { header: 'state', key: 'state', width: 16 },
    { header: 'pin_code', key: 'pin_code', width: 10 },
    // Guardian
    { header: 'father_name', key: 'father_name', width: 22 },
    { header: 'father_mobile', key: 'father_mobile', width: 14 },
    { header: 'father_occupation', key: 'father_occupation', width: 18 },
    { header: 'father_email', key: 'father_email', width: 26 },
    { header: 'mother_name', key: 'mother_name', width: 22 },
    { header: 'mother_mobile', key: 'mother_mobile', width: 14 },
    { header: 'mother_occupation', key: 'mother_occupation', width: 18 },
    { header: 'mother_email', key: 'mother_email', width: 26 },
    { header: 'guardian_name', key: 'guardian_name', width: 22 },
    { header: 'guardian_relationship', key: 'guardian_relationship', width: 18 },
    { header: 'guardian_mobile', key: 'guardian_mobile', width: 14 },
    // Emergency contact
    { header: 'emergency_contact_name', key: 'emergency_contact_name', width: 22 },
    { header: 'emergency_contact_mobile', key: 'emergency_contact_mobile', width: 16 },
    { header: 'emergency_contact_relationship', key: 'emergency_contact_relationship', width: 20 },
    // Academic
    { header: 'institution', key: 'institution', width: 24 },
    { header: 'course', key: 'course', width: 18 },
    { header: 'year', key: 'year', width: 10 },
    { header: 'qualification', key: 'qualification', width: 18 },
    { header: 'percentage', key: 'percentage', width: 10 },
    { header: 'board', key: 'board', width: 16 },
    { header: 'passing_year', key: 'passing_year', width: 12 },
    // Hostel
    { header: 'joining_date', key: 'joining_date', width: 16 },
    { header: 'duration', key: 'duration', width: 14 },
    { header: 'room_number', key: 'room_number', width: 14 },
  ];
  students.addRow({
    full_name: 'Riya Shah', mobile: '9876543210', vertical: 'GIRLS_ASHRAM',
    email: 'riya@example.com', date_of_birth: '2004-09-12', gender: 'Female', blood_group: 'B+',
    address_line1: '12 MG Road', address_line2: '', city: 'Ahmedabad', state: 'Gujarat', pin_code: '380001',
    father_name: 'Ramesh Shah', father_mobile: '9876500001', father_occupation: 'Business', father_email: '',
    mother_name: 'Sita Shah', mother_mobile: '9876500002', mother_occupation: 'Homemaker', mother_email: '',
    guardian_name: 'Ramesh Shah', guardian_relationship: 'Father', guardian_mobile: '9876500001',
    emergency_contact_name: 'Ramesh Shah', emergency_contact_mobile: '9876500001', emergency_contact_relationship: 'Father',
    institution: 'XYZ College', course: 'B.Com', year: '2', qualification: 'Graduation', percentage: '78', board: 'GSEB', passing_year: '2022',
    joining_date: '2024-06-01', duration: '12 months', room_number: '101',
  });
  students.addRow({
    full_name: 'Aarav Mehta', mobile: '9876543211', vertical: 'BOYS_HOSTEL',
    email: 'aarav@example.com', date_of_birth: '2003-11-04', gender: 'Male', blood_group: 'O+',
    address_line1: '45 Ring Road', address_line2: '', city: 'Surat', state: 'Gujarat', pin_code: '395001',
    father_name: 'Kishor Mehta', father_mobile: '9876500003', father_occupation: 'Trader', father_email: '',
    mother_name: 'Nita Mehta', mother_mobile: '9876500004', mother_occupation: 'Homemaker', mother_email: '',
    guardian_name: 'Kishor Mehta', guardian_relationship: 'Father', guardian_mobile: '9876500003',
    emergency_contact_name: 'Kishor Mehta', emergency_contact_mobile: '9876500003', emergency_contact_relationship: 'Father',
    institution: 'ABC College', course: 'B.Sc', year: '1', qualification: 'Graduation', percentage: '82', board: 'CBSE', passing_year: '2023',
    joining_date: '2024-06-01', duration: '12 months', room_number: '101',
  });

  for (const sheet of [rooms, students]) {
    sheet.getRow(1).font = { bold: true };
  }

  await wb.xlsx.writeFile(outPath);
  console.log(`Template written: ${outPath}`);
  console.log('vertical must be one of:', VERTICALS.join(', '));
}

// ---------------------------------------------------------------------------
// Reading + validating rows
// ---------------------------------------------------------------------------

function sheetToRows(sheet) {
  if (!sheet) return [];
  const headerRow = sheet.getRow(1).values; // 1-indexed, [0] is empty
  const headers = {};
  headerRow.forEach((h, i) => {
    if (h) headers[String(h).trim()] = i;
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (col) => {
      const idx = headers[col];
      if (!idx) return undefined;
      const cell = row.getCell(idx);
      const v = cell.value;
      if (v === null || v === undefined || v === '') return undefined;
      if (typeof v === 'object' && v.text) return String(v.text).trim(); // rich text
      if (v instanceof Date) return v;
      return typeof v === 'string' ? v.trim() : v;
    };
    rows.push({ rowNumber, get });
  });
  return rows;
}

function validateRoom(row) {
  const room_number = row.get('room_number');
  const vertical = row.get('vertical');
  const floor = row.get('floor');
  const capacity = row.get('capacity');
  const errors = [];

  if (!room_number) errors.push('room_number is required');
  if (!vertical || !VERTICALS.includes(String(vertical))) {
    errors.push(`vertical must be one of ${VERTICALS.join(', ')}`);
  }
  if (floor === undefined || Number.isNaN(Number(floor))) errors.push('floor is required and must be a number');
  if (!capacity || Number.isNaN(Number(capacity)) || Number(capacity) < 1) {
    errors.push('capacity is required and must be a positive number');
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      room_number: String(room_number),
      vertical: String(vertical),
      floor: Number(floor),
      capacity: Number(capacity),
      building: row.get('building') ? String(row.get('building')) : null,
      room_type: row.get('room_type') ? String(row.get('room_type')) : null,
      rent_per_head: row.get('rent_per_head') ? Number(row.get('rent_per_head')) : null,
    },
  };
}

// Parses a cell into a plain string, or null if blank — used for every
// optional text field so a blank cell never becomes the literal string "undefined".
function str(row, col) {
  const v = row.get(col);
  return v === undefined ? null : String(v).trim() || null;
}

function parseDate(row, col, errors) {
  const raw = row.get(col);
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) {
    errors.push(`${col} is not a valid date`);
    return null;
  }
  return d;
}

function validateStudent(row) {
  const full_name = row.get('full_name');
  const mobile = row.get('mobile');
  const vertical = row.get('vertical');
  const errors = [];

  if (!full_name) errors.push('full_name is required');
  if (!mobile || !/^\d{7,15}$/.test(String(mobile))) errors.push('mobile is required and must be 7-15 digits');
  if (!vertical || !VERTICALS.includes(String(vertical))) {
    errors.push(`vertical must be one of ${VERTICALS.join(', ')}`);
  }

  const date_of_birth = parseDate(row, 'date_of_birth', errors);
  const joining_date = parseDate(row, 'joining_date', errors);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      full_name: String(full_name),
      mobile: String(mobile),
      vertical: String(vertical),
      email: str(row, 'email'),
      date_of_birth,
      gender: str(row, 'gender'),
      blood_group: str(row, 'blood_group'),
      room_number: str(row, 'room_number'),
      address: {
        line1: str(row, 'address_line1'),
        line2: str(row, 'address_line2'),
        city: str(row, 'city'),
        state: str(row, 'state'),
        pin_code: str(row, 'pin_code'),
      },
      guardian_info: {
        father_name: str(row, 'father_name'),
        father_mobile: str(row, 'father_mobile'),
        father_occupation: str(row, 'father_occupation'),
        father_email: str(row, 'father_email'),
        mother_name: str(row, 'mother_name'),
        mother_mobile: str(row, 'mother_mobile'),
        mother_occupation: str(row, 'mother_occupation'),
        mother_email: str(row, 'mother_email'),
        guardian_name: str(row, 'guardian_name'),
        guardian_relationship: str(row, 'guardian_relationship'),
        guardian_mobile: str(row, 'guardian_mobile'),
      },
      emergency_contact: {
        name: str(row, 'emergency_contact_name'),
        mobile: str(row, 'emergency_contact_mobile'),
        relationship: str(row, 'emergency_contact_relationship'),
      },
      academic_info: {
        institution: str(row, 'institution'),
        course: str(row, 'course'),
        year: str(row, 'year'),
        qualification: str(row, 'qualification'),
        percentage: str(row, 'percentage'),
        board: str(row, 'board'),
        passing_year: str(row, 'passing_year'),
      },
      hostel_preferences: {
        joining_date,
        duration: str(row, 'duration'),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// --client-format reading + validation
// ---------------------------------------------------------------------------

// Positional reader (fixed column index, not header-name lookup) — needed
// because columns 11/14 both read "R. NO"/"R. NO." on the real file. Row 3 is
// the header row (rows 1-2 are merged section labels), data starts row 4.
// Validates row 3 against CLIENT_FORMAT_EXPECTED_HEADERS and throws on any
// mismatch — a wrong/future file format must fail loudly, not silently
// mis-map columns.
function sheetToPositionalRows(sheet) {
  const headerRow = sheet.getRow(CLIENT_FORMAT_HEADER_ROW);
  const cellText = (cell) => {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && v.text) return String(v.text).trim();
    return String(v).trim();
  };
  const actual = CLIENT_FORMAT_EXPECTED_HEADERS.map((_, i) => cellText(headerRow.getCell(i + 1)));
  const mismatches = CLIENT_FORMAT_EXPECTED_HEADERS
    .map((h, i) => (h === actual[i] ? null : `col ${i + 1}: expected "${h}", found "${actual[i]}"`))
    .filter(Boolean);
  if (mismatches.length) {
    throw new Error(
      `Sheet "${sheet.name}" row ${CLIENT_FORMAT_HEADER_ROW} does not match the expected client-format header:\n  ` +
      mismatches.join('\n  ')
    );
  }

  const cellValue = (row, colIndex) => {
    const v = row.getCell(colIndex).value;
    if (v === null || v === undefined || v === '') return undefined;
    if (typeof v === 'object' && v.text) return String(v.text).trim();
    if (v instanceof Date) return v;
    return typeof v === 'string' ? v.trim() : v;
  };

  const rows = [];
  for (let r = CLIENT_FORMAT_DATA_START_ROW; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = cellValue(row, 3);
    const mob = cellValue(row, 9);
    if (name === undefined && mob === undefined) continue; // blank padding row
    rows.push({ rowNumber: r, get: (colIndex) => cellValue(row, colIndex) });
  }
  return rows;
}

// `str`/`parseDate` above already work with a numeric column index — they
// just call row.get(col), and don't care whether col is a name or a number.
function validateClientRow(row, vertical) {
  const errors = [];
  const full_name = str(row, 3);
  const mobileRaw = row.get(9);
  const mobile = mobileRaw === undefined ? undefined : String(mobileRaw).trim();

  if (!full_name) errors.push('STUDENT NAME is required');
  if (!mobile || !/^\d{7,15}$/.test(mobile)) errors.push('MOB NO. is required and must be 7-15 digits');

  const term_fee_date = parseDate(row, 12, errors);

  if (errors.length) return { ok: false, errors };

  const normalizeDash = (v) => (v === null || v === '-' ? null : v);
  const rawTermFeeAmount = row.get(10);
  const rawKayamiAmount = normalizeDash(str(row, 15));

  return {
    ok: true,
    data: {
      full_name,
      mobile,
      vertical,
      room_number: str(row, 2) ? String(row.get(2)) : null,
      academic_info: { institution: str(row, 7), course: str(row, 6) },
      address: { city: str(row, 8) },
      guardian_info: { father_name: str(row, 17), father_mobile: str(row, 19) },
      emergency_contact: { name: str(row, 17), mobile: str(row, 19), relationship: 'Local Guardian' },
      legacy_import: {
        sl_no: row.get(1) ?? null,
        form_number: row.get(4) ?? null,
        term_count: row.get(5) ?? null,
        wifi_status: str(row, 16),
        guardian_address: str(row, 18),
        native_place: str(row, 8),
        source_sheet: null, // filled in by the importer, which knows which sheet it's on
      },
      term_fee: {
        amount: rawTermFeeAmount ? Number(rawTermFeeAmount) : 0,
        receipt_number: str(row, 11),
        date: term_fee_date,
        utr: normalizeDash(str(row, 13)),
      },
      kayami: {
        amount: rawKayamiAmount ? Number(rawKayamiAmount) : 0,
        receipt_number: normalizeDash(str(row, 14)),
      },
    },
  };
}

// Derives "2025-2026" from a filename containing "2025-26" (matches the
// existing app convention used by FeeStructureTab.tsx / seed data — NOT the
// sheet name literally, which wouldn't group correctly in the Accounts UI's
// session filter). The half-year distinction is preserved in each fee's
// description text instead.
function academicSessionFor(filePath, sheetName) {
  const m = path.basename(filePath).match(/(\d{4})-(\d{2})\b/);
  if (!m) {
    throw new Error(`Could not derive academic year from filename "${filePath}" — expected a "YYYY-YY" pattern (e.g. "2025-26")`);
  }
  const startYear = Number(m[1]);
  const endYear = Math.floor(startYear / 100) * 100 + Number(m[2]);
  return { session: `${startYear}-${endYear}`, halfYearLabel: `${sheetName} ${m[1]}-${m[2]}` };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function genTempPassword() {
  // e.g. "Hs7f-K2pQ-9wZr" — readable-ish, high entropy, no ambiguous chars needed since it's typed once
  return crypto.randomBytes(9).toString('base64url');
}

// Same scheme as the live application form (applications/route.ts): PREFIX-YEAR-SEQUENCE,
// e.g. BH-2026-00001. `cache` is a Map seeded lazily per prefix-year from the current DB
// count, then incremented in memory so a single import run doesn't collide with itself.
async function nextTrackingNumber(client, vertical, cache) {
  const prefix = TRACKING_PREFIX[vertical];
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  if (!cache.has(key)) {
    const { rows } = await client.query(
      'SELECT COUNT(*) AS count FROM applications WHERE tracking_number LIKE $1',
      [`${key}%`]
    );
    cache.set(key, parseInt(rows[0]?.count || '0', 10) + 1);
  }
  const seq = cache.get(key);
  cache.set(key, seq + 1);
  return `${key}-${String(seq).padStart(5, '0')}`;
}

async function importRooms(client, roomRows, dryRun) {
  const result = { inserted: 0, skipped: 0, errors: [] };
  for (const row of roomRows) {
    const v = validateRoom(row);
    if (!v.ok) {
      result.errors.push(`Rooms row ${row.rowNumber}: ${v.errors.join('; ')}`);
      continue;
    }
    const { room_number, vertical, floor, capacity, building, room_type, rent_per_head } = v.data;

    const { rows: existing } = await client.query(
      'SELECT id FROM rooms WHERE room_number = $1 AND vertical = $2',
      [room_number, vertical]
    );
    if (existing.length > 0) {
      result.skipped++;
      continue;
    }

    if (!dryRun) {
      await client.query(
        `INSERT INTO rooms (room_number, vertical, floor, capacity, building, room_type, rent_per_head)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [room_number, vertical, floor, capacity, building, room_type, rent_per_head]
      );
    }
    result.inserted++;
  }
  return result;
}

async function importStudents(client, studentRows, dryRun, trackingCache) {
  const result = { inserted: 0, skipped: 0, errors: [], allocated: 0, credentials: [] };
  for (const row of studentRows) {
    const v = validateStudent(row);
    if (!v.ok) {
      result.errors.push(`Students row ${row.rowNumber}: ${v.errors.join('; ')}`);
      continue;
    }
    const {
      full_name, mobile, vertical, email, date_of_birth, gender, blood_group, room_number,
      address, guardian_info, emergency_contact, academic_info, hostel_preferences,
    } = v.data;

    const { rows: existingUser } = await client.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existingUser.length > 0) {
      result.skipped++;
      continue;
    }

    let room = null;
    if (room_number) {
      const { rows: roomRows } = await client.query(
        'SELECT * FROM rooms WHERE room_number = $1 AND vertical = $2',
        [room_number, vertical]
      );
      if (roomRows.length === 0) {
        result.errors.push(`Students row ${row.rowNumber}: room_number "${room_number}" not found in vertical ${vertical}`);
        continue;
      }
      if (roomRows[0].occupied_count >= roomRows[0].capacity) {
        result.errors.push(`Students row ${row.rowNumber}: room_number "${room_number}" is already full`);
        continue;
      }
      room = roomRows[0];
    }

    const tempPassword = genTempPassword();

    if (!dryRun) {
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const { rows: userRows } = await client.query(
        `INSERT INTO users (role, vertical, full_name, email, mobile, date_of_birth, password_hash, is_active, requires_password_change, profile_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        ['STUDENT', vertical, full_name, email, mobile, date_of_birth, passwordHash, true, true, JSON.stringify({ imported: true, gender, blood_group })]
      );
      const studentId = userRows[0].id;

      // Matching APPROVED application record — this is what the parent portal and
      // the rest of the app actually read (see parent/student/route.ts), not the
      // users table alone. See file header for what's deliberately left out
      // (documents, consent/declaration).
      const trackingNumber = await nextTrackingNumber(client, vertical, trackingCache);
      const applicationData = {
        personal_info: { full_name, date_of_birth, gender, blood_group },
        address,
        guardian_info,
        emergency_contact,
        academic_info,
        hostel_preferences: { ...hostel_preferences, vertical },
        references: [],
        documents: [],
        declaration_accepted: false,
        declaration_timestamp: null,
        migration_imported: true,
        migration_imported_at: new Date().toISOString(),
      };
      await client.query(
        `INSERT INTO applications (tracking_number, type, vertical, applicant_mobile, applicant_email, applicant_name, student_user_id, current_status, data, submitted_at, reviewed_at, approved_at)
         VALUES ($1, 'NEW', $2, $3, $4, $5, $6, 'APPROVED', $7, NOW(), NOW(), NOW())`,
        [trackingNumber, vertical, mobile, email, full_name, studentId, JSON.stringify(applicationData)]
      );

      if (room) {
        await client.query(
          `INSERT INTO room_allocations (student_id, room_id, status) VALUES ($1, $2, $3)`,
          [studentId, room.id, 'ACTIVE']
        );
        const newOccupied = room.occupied_count + 1;
        const newStatus = newOccupied >= room.capacity ? 'FULL' : newOccupied > 0 ? 'PARTIAL' : 'AVAILABLE';
        await client.query('UPDATE rooms SET occupied_count = $1, status = $2 WHERE id = $3', [newOccupied, newStatus, room.id]);
        result.allocated++;
      }
    } else if (room) {
      result.allocated++;
    }

    result.inserted++;
    result.credentials.push({ mobile, full_name, tempPassword });
  }
  return result;
}

// ---------------------------------------------------------------------------
// --client-format import
// ---------------------------------------------------------------------------

async function resolveClientRoom(client, roomNumber, vertical) {
  if (!roomNumber) return { room: null, reason: null };
  const { rows } = await client.query('SELECT * FROM rooms WHERE room_number = $1 AND vertical = $2', [roomNumber, vertical]);
  if (rows.length === 0) return { room: null, reason: 'not_found' };
  if (rows[0].occupied_count >= rows[0].capacity) return { room: null, reason: 'full' };
  return { room: rows[0], reason: null };
}

// Same occupancy-update logic as allocations/route.ts.
async function allocateRoom(client, studentId, room) {
  await client.query(`INSERT INTO room_allocations (student_id, room_id, status) VALUES ($1, $2, 'ACTIVE')`, [studentId, room.id]);
  const newOccupied = room.occupied_count + 1;
  const newStatus = newOccupied >= room.capacity ? 'FULL' : newOccupied > 0 ? 'PARTIAL' : 'AVAILABLE';
  await client.query('UPDATE rooms SET occupied_count = $1, status = $2 WHERE id = $3', [newOccupied, newStatus, room.id]);
}

// Same logic as allocations/vacate/[id]/route.ts.
async function vacateRoom(client, allocationId, room) {
  await client.query(`UPDATE room_allocations SET status = 'VACATED', vacated_at = NOW() WHERE id = $1`, [allocationId]);
  const newOccupied = Math.max(0, room.occupied_count - 1);
  const newStatus = newOccupied >= room.capacity ? 'FULL' : newOccupied > 0 ? 'PARTIAL' : 'AVAILABLE';
  await client.query('UPDATE rooms SET occupied_count = $1, status = $2 WHERE id = $3', [newOccupied, newStatus, room.id]);
}

// transactions.transaction_ref has a UNIQUE constraint, and the source file has
// real repeated literal UTR values (e.g. "DEPOSITED"). Disambiguates by
// appending a receipt number / row number before giving up (dropping the ref
// to null) rather than letting a duplicate crash the whole BEGIN/COMMIT.
async function dedupeTransactionRef(client, rawRef, disambiguators) {
  if (!rawRef) return { ref: null, adjusted: false };
  const candidates = [rawRef, ...disambiguators.filter(Boolean).map((d) => `${rawRef}-${d}`)];
  for (const candidate of candidates) {
    const { rows } = await client.query('SELECT 1 FROM transactions WHERE transaction_ref = $1', [candidate]);
    if (rows.length === 0) return { ref: candidate, adjusted: candidate !== rawRef };
  }
  return { ref: null, adjusted: true };
}

// Mirrors the exact fee->transaction pattern in src/app/api/transactions/route.ts:
// fee inserted PENDING -> transaction inserted SUCCESS -> fee updated to PAID.
async function createFeeWithOptionalPayment(client, opts) {
  const { studentId, applicationId, feeHead, amount, academicSession, description, receiptNumber, transactionRef, paidAt, dryRun } = opts;
  if (!amount || amount <= 0) return null;
  if (dryRun) return { paid: !!paidAt };

  const { rows: feeRows } = await client.query(
    `INSERT INTO fees (student_id, application_id, fee_head, description, academic_session, amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING id`,
    [studentId, applicationId, feeHead, description, academicSession, amount]
  );
  const feeId = feeRows[0].id;

  if (paidAt) {
    await client.query(
      `INSERT INTO transactions (fee_id, amount, payment_method, transaction_ref, status, receipt_number)
       VALUES ($1, $2, 'BANK_TRANSFER', $3, 'SUCCESS', $4)`,
      [feeId, amount, transactionRef || null, receiptNumber || null]
    );
    await client.query(
      `UPDATE fees SET paid_amount = $1, status = 'PAID', payment_method = 'BANK_TRANSFER', paid_at = $2, updated_at = NOW() WHERE id = $3`,
      [amount, paidAt, feeId]
    );
  }
  return { feeId, paid: !!paidAt };
}

async function importClientFormat(client, workbook, filePath, vertical, dryRun, trackingCache) {
  // mobile -> { studentId, applicationId, firstSeenSheet, firstSeenName, activeAllocationId, activeRoomId, activeRoomNumber }
  const seenMobiles = new Map();
  const result = {
    newStudents: 0, existingSupplemented: 0, roomAllocated: 0, roomTransferred: 0,
    termFeesCreated: 0, depositFeesCreated: 0, transactionsCreated: 0,
    mobileCollisions: 0, errors: [], notes: [], credentials: [],
  };

  for (const sheetName of CLIENT_FORMAT_SHEET_ORDER) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      result.notes.push(`Sheet "${sheetName}" not found in workbook — skipped`);
      continue;
    }
    const rows = sheetToPositionalRows(sheet); // throws on header mismatch — aborts the whole run, on purpose
    const { session, halfYearLabel } = academicSessionFor(filePath, sheetName);

    for (const row of rows) {
      const v = validateClientRow(row, vertical);
      if (!v.ok) {
        result.errors.push(`${sheetName} row ${row.rowNumber}: ${v.errors.join('; ')}`);
        continue;
      }
      const d = v.data;
      d.legacy_import.source_sheet = sheetName;

      let entry = seenMobiles.get(d.mobile);
      if (!entry) {
        const { rows: existingUsers } = await client.query('SELECT id FROM users WHERE mobile = $1', [d.mobile]);
        if (existingUsers.length > 0) {
          const studentDbId = existingUsers[0].id;
          const { rows: apps } = await client.query(
            `SELECT id FROM applications WHERE student_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [studentDbId]
          );
          const { rows: allocRows } = await client.query(
            `SELECT ra.id AS allocation_id, ra.room_id, r.room_number
             FROM room_allocations ra JOIN rooms r ON r.id = ra.room_id
             WHERE ra.student_id = $1 AND ra.status = 'ACTIVE'`,
            [studentDbId]
          );
          entry = {
            studentId: studentDbId,
            applicationId: apps[0]?.id || null,
            firstSeenSheet: null,
            firstSeenName: null,
            activeAllocationId: allocRows[0]?.allocation_id || null,
            activeRoomId: allocRows[0]?.room_id || null,
            activeRoomNumber: allocRows[0]?.room_number || null,
          };
        }
      }

      // Real same-mobile-different-person collision: skip both, never merge.
      if (entry && entry.firstSeenName && entry.firstSeenName.toLowerCase() !== d.full_name.toLowerCase()) {
        result.mobileCollisions++;
        result.errors.push(
          `${sheetName} row ${row.rowNumber}: mobile ${d.mobile} already belongs to "${entry.firstSeenName}" in this run, ` +
          `but this row is for "${d.full_name}" — skipped, needs manual resolution in the source file`
        );
        continue;
      }

      if (!entry) {
        // --- New student ---
        const { room, reason } = await resolveClientRoom(client, d.room_number, vertical);
        if (d.room_number && !room) {
          result.errors.push(
            `${sheetName} row ${row.rowNumber}: room_number "${d.room_number}" ${reason === 'full' ? 'is already full' : 'not found'} ` +
            `in vertical ${vertical} — student not created`
          );
          continue;
        }

        const tempPassword = genTempPassword();
        let studentId = null;
        let applicationId = null;

        if (!dryRun) {
          const passwordHash = await bcrypt.hash(tempPassword, 10);
          const { rows: userRows } = await client.query(
            `INSERT INTO users (role, vertical, full_name, mobile, password_hash, is_active, requires_password_change, profile_data)
             VALUES ('STUDENT', $1, $2, $3, $4, true, true, $5)
             RETURNING id`,
            [vertical, d.full_name, d.mobile, passwordHash, JSON.stringify({ imported: true, source: 'client_format' })]
          );
          studentId = userRows[0].id;

          const trackingNumber = await nextTrackingNumber(client, vertical, trackingCache);
          const applicationData = {
            personal_info: { full_name: d.full_name },
            address: d.address,
            guardian_info: d.guardian_info,
            emergency_contact: d.emergency_contact,
            academic_info: d.academic_info,
            hostel_preferences: { vertical },
            references: [],
            documents: [],
            declaration_accepted: false,
            declaration_timestamp: null,
            legacy_import: d.legacy_import,
            migration_imported: true,
            migration_imported_at: new Date().toISOString(),
          };
          const { rows: appRows } = await client.query(
            `INSERT INTO applications (tracking_number, type, vertical, applicant_mobile, applicant_name, student_user_id, current_status, data, submitted_at, reviewed_at, approved_at)
             VALUES ($1, 'NEW', $2, $3, $4, $5, 'APPROVED', $6, NOW(), NOW(), NOW())
             RETURNING id`,
            [trackingNumber, vertical, d.mobile, d.full_name, studentId, JSON.stringify(applicationData)]
          );
          applicationId = appRows[0].id;

          if (room) {
            await allocateRoom(client, studentId, room);
            result.roomAllocated++;
          }
        } else if (room) {
          result.roomAllocated++;
        }

        entry = {
          studentId, applicationId, firstSeenSheet: sheetName, firstSeenName: d.full_name,
          activeAllocationId: null, activeRoomId: room ? room.id : null, activeRoomNumber: room ? room.room_number : null,
        };
        seenMobiles.set(d.mobile, entry);
        result.newStudents++;
        result.credentials.push({ mobile: d.mobile, full_name: d.full_name, tempPassword });
      } else {
        // --- Existing student: supplement, possibly transfer room ---
        if (!entry.firstSeenSheet) {
          entry.firstSeenSheet = sheetName; // first seen was a pre-existing DB row, not this run
          entry.firstSeenName = d.full_name;
        }
        seenMobiles.set(d.mobile, entry);
        result.existingSupplemented++;
        result.notes.push(`${sheetName} row ${row.rowNumber}: existing student "${d.full_name}" (${d.mobile}) — added fee record`);

        if (d.room_number && d.room_number !== entry.activeRoomNumber) {
          const { room: newRoom, reason } = await resolveClientRoom(client, d.room_number, vertical);
          if (!newRoom) {
            result.notes.push(
              `${sheetName} row ${row.rowNumber}: room change to "${d.room_number}" skipped (${reason === 'full' ? 'full' : 'not found'}) — kept existing allocation`
            );
          } else if (!dryRun) {
            if (entry.activeAllocationId && entry.activeRoomId) {
              const { rows: oldRoomRows } = await client.query('SELECT * FROM rooms WHERE id = $1', [entry.activeRoomId]);
              if (oldRoomRows[0]) await vacateRoom(client, entry.activeAllocationId, oldRoomRows[0]);
            }
            await allocateRoom(client, entry.studentId, newRoom);
            const { rows: newAllocRows } = await client.query(
              `SELECT id FROM room_allocations WHERE student_id = $1 AND room_id = $2 AND status = 'ACTIVE' ORDER BY allocated_at DESC LIMIT 1`,
              [entry.studentId, newRoom.id]
            );
            entry.activeAllocationId = newAllocRows[0]?.id || null;
            entry.activeRoomId = newRoom.id;
            entry.activeRoomNumber = newRoom.room_number;
            result.roomTransferred++;
            result.notes.push(`${sheetName} row ${row.rowNumber}: "${d.full_name}" transferred to room ${d.room_number}`);
          } else {
            result.roomTransferred++;
          }
        }
      }

      // --- Fees (both new and existing students) ---
      // Same sheet as first-seen -> HOSTEL_FEES (handles same-term installment rows correctly);
      // a later sheet -> RENEWAL_FEE.
      const feeHead = entry.firstSeenSheet === sheetName ? CLIENT_FEE_HEAD.HOSTEL_FEES : CLIENT_FEE_HEAD.RENEWAL_FEE;

      if (d.term_fee.amount > 0) {
        let transactionRef = d.term_fee.utr;
        if (!dryRun && transactionRef) {
          const deduped = await dedupeTransactionRef(client, transactionRef, [d.term_fee.receipt_number, String(row.rowNumber)]);
          if (deduped.adjusted && deduped.ref) {
            result.notes.push(`${sheetName} row ${row.rowNumber}: duplicate UTR "${transactionRef}" disambiguated to "${deduped.ref}"`);
          } else if (deduped.adjusted) {
            result.notes.push(`${sheetName} row ${row.rowNumber}: duplicate UTR "${transactionRef}" could not be disambiguated — stored without a reference`);
          }
          transactionRef = deduped.ref;
        }
        const outcome = await createFeeWithOptionalPayment(client, {
          studentId: entry.studentId, applicationId: entry.applicationId,
          feeHead, amount: d.term_fee.amount, academicSession: session,
          description: `${CLIENT_FEE_HEAD_LABEL[feeHead]} — ${halfYearLabel} (legacy import)`,
          receiptNumber: d.term_fee.receipt_number, transactionRef, paidAt: d.term_fee.date, dryRun,
        });
        if (outcome) {
          result.termFeesCreated++;
          if (outcome.paid) result.transactionsCreated++;
        }
      }

      if (d.kayami.amount > 0) {
        const depositPaidAt = d.kayami.receipt_number ? d.term_fee.date : null;
        if (d.kayami.receipt_number && !d.term_fee.date) {
          result.notes.push(`${sheetName} row ${row.rowNumber}: deposit receipt present but no term-fee date to attribute payment to — left PENDING`);
        }
        const outcome = await createFeeWithOptionalPayment(client, {
          studentId: entry.studentId, applicationId: entry.applicationId,
          feeHead: CLIENT_FEE_HEAD.SECURITY_DEPOSIT, amount: d.kayami.amount, academicSession: session,
          description: `${CLIENT_FEE_HEAD_LABEL.SECURITY_DEPOSIT} — ${halfYearLabel} (legacy import)`,
          receiptNumber: d.kayami.receipt_number, transactionRef: null, paidAt: depositPaidAt, dryRun,
        });
        if (outcome) {
          result.depositFeesCreated++;
          if (outcome.paid) result.transactionsCreated++;
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--make-template')) {
    await makeTemplate();
    return;
  }

  const filePath = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const clientFormat = args.includes('--client-format');
  const verticalArg = args.find((a) => a.startsWith('--vertical='));
  const vertical = verticalArg ? verticalArg.split('=')[1] : null;

  if (!filePath) {
    console.error('Usage: node scripts/import-data.js <file.xlsx> [--dry-run]');
    console.error(`       node scripts/import-data.js <file.xlsx> --client-format --vertical=<${VERTICALS.join('|')}> [--dry-run]`);
    console.error('       node scripts/import-data.js --make-template');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }
  if (clientFormat && (!vertical || !VERTICALS.includes(vertical))) {
    console.error(`--vertical=<${VERTICALS.join('|')}> is required and must be valid when --client-format is set`);
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is not set (checked env and frontend/.env.local).');
    process.exitCode = 1;
    return;
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  let roomRows = [];
  let studentRows = [];
  if (!clientFormat) {
    roomRows = sheetToRows(wb.getWorksheet('Rooms'));
    studentRows = sheetToRows(wb.getWorksheet('Students'));
    if (roomRows.length === 0 && studentRows.length === 0) {
      console.error('No data rows found in "Rooms" or "Students" sheets.');
      process.exitCode = 1;
      return;
    }
  }

  console.log(dryRun ? '--- DRY RUN: no data will be written ---' : '--- LIVE IMPORT ---');
  if (clientFormat) {
    console.log(`Client-format mode, vertical=${vertical}\n`);
  } else {
    console.log(`Found ${roomRows.length} room row(s), ${studentRows.length} student row(s)\n`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`\nCould not connect to the database: ${err.message}`);
    await pool.end();
    process.exitCode = 1;
    return;
  }
  try {
    if (!dryRun) await client.query('BEGIN');

    if (clientFormat) {
      const result = await importClientFormat(client, wb, filePath, vertical, dryRun, new Map());

      if (!dryRun) await client.query('COMMIT');

      console.log('Client-format import:');
      console.log(`  new students: ${result.newStudents}, existing supplemented: ${result.existingSupplemented}`);
      console.log(`  room allocated: ${result.roomAllocated}, room transferred: ${result.roomTransferred}`);
      console.log(`  term fees created: ${result.termFeesCreated}, deposit fees created: ${result.depositFeesCreated}, transactions created: ${result.transactionsCreated}`);
      console.log(`  mobile collisions (skipped): ${result.mobileCollisions}`);
      if (result.notes.length) {
        console.log('  notes:');
        result.notes.forEach((n) => console.log(`    - ${n}`));
      }
      if (result.errors.length) {
        console.log('  errors:');
        result.errors.forEach((e) => console.log(`    - ${e}`));
      }
      if (!dryRun && result.credentials.length) {
        console.log('\nTemporary credentials (not recoverable after this — save them now):');
        console.log('mobile,full_name,temp_password');
        result.credentials.forEach((c) => console.log(`${c.mobile},${c.full_name},${c.tempPassword}`));
      }
    } else {
      const roomResult = await importRooms(client, roomRows, dryRun);
      const studentResult = await importStudents(client, studentRows, dryRun, new Map());

      if (!dryRun) await client.query('COMMIT');

      console.log('Rooms:');
      console.log(`  inserted: ${roomResult.inserted}, skipped (already exist): ${roomResult.skipped}`);
      if (roomResult.errors.length) {
        console.log('  errors:');
        roomResult.errors.forEach((e) => console.log(`    - ${e}`));
      }

      console.log('\nStudents:');
      console.log(`  inserted: ${studentResult.inserted}, skipped (already exist): ${studentResult.skipped}, room-allocated: ${studentResult.allocated}`);
      if (studentResult.errors.length) {
        console.log('  errors:');
        studentResult.errors.forEach((e) => console.log(`    - ${e}`));
      }

      if (!dryRun && studentResult.credentials.length) {
        console.log('\nTemporary credentials (not recoverable after this — save them now):');
        console.log('mobile,full_name,temp_password');
        studentResult.credentials.forEach((c) => console.log(`${c.mobile},${c.full_name},${c.tempPassword}`));
      }
    }

    if (dryRun) {
      console.log('\nDry run complete. Re-run without --dry-run to write these changes.');
    } else {
      console.log('\nImport complete.');
    }
  } catch (err) {
    if (!dryRun) {
      try {
        await client.query('ROLLBACK');
      } catch {}
    }
    console.error('\nImport failed, no changes were written:', err.message);
    if (err.detail) console.error('  detail:', err.detail);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  sheetToRows, validateRoom, validateStudent, VERTICALS, TRACKING_PREFIX,
  sheetToPositionalRows, validateClientRow, academicSessionFor,
  CLIENT_FORMAT_EXPECTED_HEADERS, CLIENT_FEE_HEAD,
};
