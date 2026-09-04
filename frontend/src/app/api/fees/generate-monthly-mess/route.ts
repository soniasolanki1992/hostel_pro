import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth } from '@/lib/authorize';

const VERTICALS = ['BOYS_HOSTEL', 'GIRLS_ASHRAM', 'DHARAMSHALA'];

/**
 * POST /api/fees/generate-monthly-mess
 * Body: { month: 'YYYY-MM', vertical?: 'BOYS_HOSTEL' | 'GIRLS_ASHRAM' | 'DHARAMSHALA', due_day?: number }
 *
 * For each STUDENT with an ACTIVE room_allocations row matching the optional vertical filter,
 * insert a MESS_MONTHLY_FEE row for the given month using the amount from fee_configuration.
 * Idempotent — skips students who already have a MESS_MONTHLY_FEE for the same month.
 *
 * Auth: ACCOUNTS, TRUSTEE.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ACCOUNTS', 'TRUSTEE']);
    const body = await request.json();
    const { month, vertical, due_day } = body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return badRequestResponse('month must be in YYYY-MM format');
    }
    if (vertical && !VERTICALS.includes(vertical)) {
      return badRequestResponse('Invalid vertical');
    }
    const dueDay = Number.isInteger(due_day) && due_day >= 1 && due_day <= 28 ? due_day : 10;

    const [yearStr, monthStr] = month.split('-');
    const monthStart = `${yearStr}-${monthStr}-01`;
    const monthEnd = new Date(Number(yearStr), Number(monthStr), 0);
    const monthEndStr = `${yearStr}-${monthStr}-${String(monthEnd.getDate()).padStart(2, '0')}`;
    const dueDate = `${yearStr}-${monthStr}-${String(dueDay).padStart(2, '0')}`;

    // Resolve academic session from the month (June-May style: June 2025 → 2025-2026)
    const monthNum = Number(monthStr);
    const yearNum = Number(yearStr);
    const sessionStart = monthNum >= 6 ? yearNum : yearNum - 1;
    const academicSession = `${sessionStart}-${sessionStart + 1}`;

    // Find active residents
    const verticalFilter = vertical ? 'AND u.vertical = $2' : '';
    const verticalParams = vertical ? [vertical] : [];
    const { rows: residents } = await query(
      `SELECT DISTINCT u.id AS student_id, u.vertical
         FROM users u
         JOIN room_allocations ra ON ra.student_id = u.id
        WHERE u.role = 'STUDENT'
          AND u.is_active = true
          AND ra.status = 'ACTIVE'
          ${verticalFilter}`,
      verticalParams,
    );

    if (!residents.length) {
      return successResponse({
        generated: 0,
        skipped: 0,
        failed: 0,
        details: { reason: 'No active residents matched the filter' },
      });
    }

    // Resolve amounts per vertical from fee_configuration
    const { rows: configRows } = await query(
      `SELECT vertical, amount
         FROM fee_configuration
        WHERE fee_head = 'MESS_MONTHLY_FEE'
          AND academic_session = $1
          AND (valid_until IS NULL OR valid_until >= $2)
          AND valid_from <= $3`,
      [academicSession, monthStart, monthEndStr],
    );
    const amountByVertical = new Map<string, number>(
      configRows.map((r: any) => [r.vertical, parseFloat(r.amount)] as const),
    );

    if (!amountByVertical.size) {
      return badRequestResponse(
        `No MESS_MONTHLY_FEE configuration found for session ${academicSession}. Set it up under Fee Structure first.`,
      );
    }

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ student_id: string; reason: string }> = [];

    await withTransaction(async (client) => {
      for (const r of residents) {
        const studentId = r.student_id as string;
        const studentVertical = r.vertical as string;
        const amount = amountByVertical.get(studentVertical);
        if (amount === undefined) {
          failed += 1;
          failures.push({ student_id: studentId, reason: `No fee config for ${studentVertical}` });
          continue;
        }

        const { rows: existing } = await client.query(
          `SELECT 1 FROM fees
            WHERE student_id = $1
              AND fee_head = 'MESS_MONTHLY_FEE'
              AND due_date >= $2 AND due_date <= $3
            LIMIT 1`,
          [studentId, monthStart, monthEndStr],
        );
        if (existing.length) {
          skipped += 1;
          continue;
        }

        await client.query(
          `INSERT INTO fees (student_id, fee_head, description, academic_session, amount, status, due_date)
           VALUES ($1, 'MESS_MONTHLY_FEE', $2, $3, $4, 'PENDING', $5)`,
          [
            studentId,
            `Mess Monthly Fees — ${month}`,
            academicSession,
            amount,
            dueDate,
          ],
        );
        generated += 1;
      }

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, new_value, performed_by, metadata)
         VALUES ('fee', $1, 'CREATE', $2, $3, $4)`,
        [
          user.id,
          JSON.stringify({ month, vertical: vertical || 'ALL', generated, skipped, failed }),
          user.id,
          JSON.stringify({ source: 'generate-monthly-mess', academic_session: academicSession, due_date: dueDate }),
        ],
      );
    });

    return successResponse({
      generated,
      skipped,
      failed,
      month,
      due_date: dueDate,
      academic_session: academicSession,
      ...(failures.length ? { failures } : {}),
    });
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('POST /api/fees/generate-monthly-mess error:', error);
    return serverErrorResponse('Failed to generate monthly mess fees', error);
  }
}
