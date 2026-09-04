import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(_request: NextRequest) {
  try {
    const { rows } = await query(
      `SELECT id, title, company, location, type, salary, description,
              posted_by_name, posted_by_batch, posted_at, status
       FROM alumni_jobs WHERE status = 'active'
       ORDER BY posted_at DESC`
    );

    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      location: r.location,
      type: r.type,
      salary: r.salary,
      description: r.description,
      postedBy: { name: r.posted_by_name || 'Alumni', batch: r.posted_by_batch || '' },
      postedAt: r.posted_at instanceof Date ? r.posted_at.toISOString() : String(r.posted_at),
      status: r.status,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Alumni jobs fetch failed', { error: message });
    return NextResponse.json({ success: false, error: 'Failed to load jobs' }, { status: 500 });
  }
}
