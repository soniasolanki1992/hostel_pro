import { query as defaultQuery } from '@/lib/db';

type Querier = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
};

const wrappedDefault: Querier = { query: defaultQuery as any };

/**
 * On approval, the paid ADMISSION_FEE for the application is converted into a
 * credit on the new resident's hostel-fee ledger by attaching student_id to
 * the existing fees row. Idempotent: if already attached, does nothing.
 *
 * Pass `client` to run inside an existing transaction.
 */
export async function adjustAdmissionFeeCredit(
  applicationId: string,
  studentId: string,
  client: Querier = wrappedDefault,
) {
  const { rows: feeRows } = await client.query(
    `SELECT id, student_id FROM fees
     WHERE application_id = $1 AND fee_head = 'ADMISSION_FEE' AND status = 'PAID'
     LIMIT 1`,
    [applicationId],
  );
  if (!feeRows[0]) return;
  if (feeRows[0].student_id === studentId) return;

  await client.query(
    `UPDATE fees SET student_id = $1, remarks = COALESCE(remarks, '') || ' [Adjusted on admission]'
     WHERE id = $2`,
    [studentId, feeRows[0].id],
  );
}
