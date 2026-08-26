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
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');

const VERTICALS = ['BOYS_HOSTEL', 'GIRLS_ASHRAM', 'DHARAMSHALA'];
const TRACKING_PREFIX = { BOYS_HOSTEL: 'BH', GIRLS_ASHRAM: 'GA', DHARAMSHALA: 'DH' };

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

  if (!filePath) {
    console.error('Usage: node scripts/import-data.js <file.xlsx> [--dry-run]');
    console.error('       node scripts/import-data.js --make-template');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
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
  const roomRows = sheetToRows(wb.getWorksheet('Rooms'));
  const studentRows = sheetToRows(wb.getWorksheet('Students'));

  if (roomRows.length === 0 && studentRows.length === 0) {
    console.error('No data rows found in "Rooms" or "Students" sheets.');
    process.exitCode = 1;
    return;
  }

  console.log(dryRun ? '--- DRY RUN: no data will be written ---' : '--- LIVE IMPORT ---');
  console.log(`Found ${roomRows.length} room row(s), ${studentRows.length} student row(s)\n`);

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

module.exports = { sheetToRows, validateRoom, validateStudent, VERTICALS, TRACKING_PREFIX };
