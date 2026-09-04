import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth } from '@/lib/authorize';

const VERTICALS = ['BOYS_HOSTEL', 'GIRLS_ASHRAM', 'DHARAMSHALA'];
const FREQUENCIES = ['ONE_TIME', 'SEMESTER', 'MONTHLY'];

/**
 * GET /api/fee-configuration
 * List fee structure rows. Optional filters: vertical, academic_session, fee_head, active.
 * Auth: any authenticated staff member.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const vertical = searchParams.get('vertical');
    const session = searchParams.get('academic_session');
    const feeHead = searchParams.get('fee_head');
    const activeOnly = searchParams.get('active') === 'true';

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (vertical) { conditions.push(`vertical = $${i++}`); params.push(vertical); }
    if (session) { conditions.push(`academic_session = $${i++}`); params.push(session); }
    if (feeHead) { conditions.push(`fee_head = $${i++}`); params.push(feeHead); }
    if (activeOnly) {
      conditions.push(`(valid_until IS NULL OR valid_until >= CURRENT_DATE)`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM fee_configuration ${where} ORDER BY vertical, academic_session DESC, fee_head`,
      params,
    );
    return successResponse(rows);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('GET /api/fee-configuration error:', error);
    return serverErrorResponse('Failed to fetch fee configuration', error);
  }
}

/**
 * POST /api/fee-configuration
 * Create a new fee structure row.
 * Auth: ACCOUNTS, TRUSTEE.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ACCOUNTS', 'TRUSTEE']);
    const body = await request.json();
    const { vertical, academic_session, fee_head, amount, frequency, is_refundable, valid_from, valid_until } = body;

    if (!vertical || !VERTICALS.includes(vertical)) {
      return badRequestResponse('Invalid vertical');
    }
    if (!academic_session || !fee_head) {
      return badRequestResponse('academic_session and fee_head are required');
    }
    if (amount === undefined || isNaN(parseFloat(amount)) || parseFloat(amount) < 0) {
      return badRequestResponse('amount must be a non-negative number');
    }
    if (!frequency || !FREQUENCIES.includes(frequency)) {
      return badRequestResponse('frequency must be one of ONE_TIME, SEMESTER, MONTHLY');
    }
    if (!valid_from) {
      return badRequestResponse('valid_from is required');
    }

    const created = await withTransaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO fee_configuration (vertical, academic_session, fee_head, amount, frequency, is_refundable, valid_from, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [vertical, academic_session, fee_head, amount, frequency, !!is_refundable, valid_from, valid_until || null],
      );
      const row = insertResult.rows[0];
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, new_value, performed_by)
         VALUES ('fee_configuration', $1, 'CREATE', $2, $3)`,
        [row.id, JSON.stringify(row), user.id],
      );
      return row;
    });

    return createdResponse(created, 'Fee configuration created');
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('POST /api/fee-configuration error:', error);
    return serverErrorResponse('Failed to create fee configuration', error);
  }
}

/**
 * PUT /api/fee-configuration
 * Update an existing fee structure row.
 * Auth: ACCOUNTS, TRUSTEE.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ACCOUNTS', 'TRUSTEE']);
    const body = await request.json();
    const { id, vertical, academic_session, fee_head, amount, frequency, is_refundable, valid_from, valid_until } = body;

    if (!id) return badRequestResponse('id is required');

    const { rows: existing } = await query(`SELECT * FROM fee_configuration WHERE id = $1`, [id]);
    if (!existing.length) return notFoundResponse('Fee configuration not found');

    if (vertical && !VERTICALS.includes(vertical)) return badRequestResponse('Invalid vertical');
    if (frequency && !FREQUENCIES.includes(frequency)) return badRequestResponse('Invalid frequency');

    const updates: string[] = [];
    const params: any[] = [];
    let i = 1;
    const setField = (col: string, val: any) => { updates.push(`${col} = $${i++}`); params.push(val); };
    if (vertical !== undefined) setField('vertical', vertical);
    if (academic_session !== undefined) setField('academic_session', academic_session);
    if (fee_head !== undefined) setField('fee_head', fee_head);
    if (amount !== undefined) setField('amount', amount);
    if (frequency !== undefined) setField('frequency', frequency);
    if (is_refundable !== undefined) setField('is_refundable', !!is_refundable);
    if (valid_from !== undefined) setField('valid_from', valid_from);
    if (valid_until !== undefined) setField('valid_until', valid_until || null);

    if (!updates.length) return badRequestResponse('No fields to update');

    params.push(id);
    const updated = await withTransaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE fee_configuration SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        params,
      );
      const row = updateResult.rows[0];
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, old_value, new_value, performed_by)
         VALUES ('fee_configuration', $1, 'UPDATE', $2, $3, $4)`,
        [id, JSON.stringify(existing[0]), JSON.stringify(row), user.id],
      );
      return row;
    });

    return successResponse(updated, 'Fee configuration updated');
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('PUT /api/fee-configuration error:', error);
    return serverErrorResponse('Failed to update fee configuration', error);
  }
}

/**
 * DELETE /api/fee-configuration?id=...
 * Remove a fee structure row.
 * Auth: ACCOUNTS, TRUSTEE.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['ACCOUNTS', 'TRUSTEE']);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return badRequestResponse('id query parameter is required');

    const { rows: existing } = await query(`SELECT * FROM fee_configuration WHERE id = $1`, [id]);
    if (!existing.length) return notFoundResponse('Fee configuration not found');

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM fee_configuration WHERE id = $1`, [id]);
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, old_value, performed_by)
         VALUES ('fee_configuration', $1, 'DELETE', $2, $3)`,
        [id, JSON.stringify(existing[0]), user.id],
      );
    });

    return successResponse({ id }, 'Fee configuration deleted');
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('DELETE /api/fee-configuration error:', error);
    return serverErrorResponse('Failed to delete fee configuration', error);
  }
}
