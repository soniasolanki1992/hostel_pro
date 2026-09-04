import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const conds: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (status && (status === 'upcoming' || status === 'past')) {
      conds.push(`status = $${i++}`);
      params.push(status);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT id, title, description, event_date, event_time, location, type, status
       FROM alumni_events ${where}
       ORDER BY event_date DESC`,
      params
    );

    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      date: r.event_date instanceof Date ? r.event_date.toISOString().slice(0, 10) : String(r.event_date),
      time: r.event_time,
      location: r.location,
      type: r.type,
      status: r.status,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni events fetch failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to load events' }, { status: 500 });
  }
}
