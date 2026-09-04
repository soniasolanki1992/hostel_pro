import { query } from '@/lib/db';

export type VerticalCode = 'BOYS_HOSTEL' | 'GIRLS_ASHRAM' | 'DHARAMSHALA';

export async function hasAvailableRoom(vertical: VerticalCode): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM rooms
     WHERE vertical = $1
       AND status IN ('AVAILABLE', 'PARTIAL')
       AND occupied_count < capacity
     LIMIT 1`,
    [vertical]
  );
  return rows.length > 0;
}
