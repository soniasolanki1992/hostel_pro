import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { DashboardAPI, ApplicationStatus } from '@/types/api';
import { requireAuth, getVerticalFilter } from '@/lib/authorize';

/**
 * GET /api/dashboard/superintendent
 * Get superintendent dashboard data
 * Auth: SUPERINTENDENT only (vertical filtered)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT']);
    const verticalFilter = getVerticalFilter(user);
    // Get applications filtered by vertical
    const { rows: applications } = verticalFilter
      ? await query('SELECT * FROM applications WHERE vertical = $1', [verticalFilter])
      : await query('SELECT * FROM applications');

    // Count by status
    const byStatus: Record<ApplicationStatus, number> = {
      DRAFT: 0,
      SUBMITTED: 0,
      REVIEW: 0,
      TRUSTEE_REVIEW: 0,
      SHORTLISTED: 0,
      INTERVIEW: 0,
      TRUSTEE_FINAL_REVIEW: 0,
      APPROVED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
      ARCHIVED: 0,
      WAITLIST: 0,
    };

    let pendingReview = 0;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    let totalThisMonth = 0;

    (applications || []).forEach((app: any) => {
      byStatus[app.current_status as ApplicationStatus]++;

      if (app.current_status === 'SUBMITTED' || app.current_status === 'REVIEW') {
        pendingReview++;
      }

      const createdDate = new Date(app.created_at);
      if (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      ) {
        totalThisMonth++;
      }
    });

    // Get occupancy stats filtered by vertical
    const { rows: rooms } = verticalFilter
      ? await query('SELECT * FROM rooms WHERE vertical = $1', [verticalFilter])
      : await query('SELECT * FROM rooms');

    let totalCapacity = 0;
    let currentOccupancy = 0;

    (rooms || []).forEach((room: any) => {
      totalCapacity += room.capacity;
      currentOccupancy += room.occupied_count || 0;
    });

    const occupancyPercentage = totalCapacity > 0
      ? Math.round((currentOccupancy / totalCapacity) * 100)
      : 0;

    // Get recent applications (excluding DRAFT and ARCHIVED)
    const recentApplications = (applications || [])
      .filter((app: any) => app.current_status !== 'DRAFT' && app.current_status !== 'ARCHIVED')
      .sort((a: any, b: any) => {
        return new Date(b.submitted_at || b.created_at).getTime() -
               new Date(a.submitted_at || a.created_at).getTime();
      })
      .slice(0, 10);

    const dashboardData: DashboardAPI.SuperintendentDashboard = {
      applications: {
        pending_review: pendingReview,
        total_this_month: totalThisMonth,
        by_status: byStatus,
      },
      occupancy: {
        total_capacity: totalCapacity,
        current_occupancy: currentOccupancy,
        percentage: occupancyPercentage,
      },
      recent_applications: recentApplications,
    };

    return successResponse(dashboardData);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/dashboard/superintendent:', error);
    return serverErrorResponse('Failed to fetch superintendent dashboard', error);
  }
}
