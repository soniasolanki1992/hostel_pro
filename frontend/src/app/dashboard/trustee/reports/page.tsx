'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/shadcn/button-extended';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/components/utils';
import { TrendingUp, TrendingDown, Users, BedDouble, FileText, IndianRupee } from 'lucide-react';
import type { Vertical } from '../_components';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReportStats {
  applications: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    byVertical: Record<Vertical, number>;
  };
  occupancy: {
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    occupancyRate: number;
    byVertical: Record<Vertical, { total: number; occupied: number; rate: number }>;
  };
  financial: {
    totalCollected: number;
    pendingPayments: number;
    thisMonthCollection: number;
  };
  trends: {
    applicationsThisMonth: number;
    applicationsPreviousMonth: number;
    approvalsThisMonth: number;
    approvalsPreviousMonth: number;
  };
}

export default function TrusteeReports() {
  const { t } = useLanguage();
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReportStats>({
    applications: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      byVertical: { BOYS: 0, GIRLS: 0, DHARAMSHALA: 0 },
    },
    occupancy: {
      totalBeds: 0,
      occupiedBeds: 0,
      availableBeds: 0,
      occupancyRate: 0,
      byVertical: {
        BOYS: { total: 0, occupied: 0, rate: 0 },
        GIRLS: { total: 0, occupied: 0, rate: 0 },
        DHARAMSHALA: { total: 0, occupied: 0, rate: 0 },
      },
    },
    financial: {
      totalCollected: 0,
      pendingPayments: 0,
      thisMonthCollection: 0,
    },
    trends: {
      applicationsThisMonth: 0,
      applicationsPreviousMonth: 0,
      approvalsThisMonth: 0,
      approvalsPreviousMonth: 0,
    },
  });

  const fetchReportData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');

      // Fetch applications
      const applicationsResponse = await fetch('/api/applications', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
      });
      const applicationsData = await applicationsResponse.json();
      const applications = applicationsData.data || (Array.isArray(applicationsData) ? applicationsData : []);

      // Map database vertical values to display values for applications
      const mapAppVertical = (dbVertical: string): Vertical => {
        const mapping: Record<string, Vertical> = {
          'BOYS_HOSTEL': 'BOYS',
          'BOYS': 'BOYS',
          'GIRLS_ASHRAM': 'GIRLS',
          'GIRLS': 'GIRLS',
          'DHARAMSHALA': 'DHARAMSHALA',
        };
        return mapping[dbVertical?.toUpperCase()] || 'BOYS';
      };

      // Calculate application stats - use current_status from database
      const total = applications.length;
      const pending = applications.filter(
        (app: any) => ['SUBMITTED', 'REVIEW', 'TRUSTEE_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'TRUSTEE_FINAL_REVIEW'].includes(app.current_status || app.status)
      ).length;
      const approved = applications.filter((app: any) => (app.current_status || app.status) === 'APPROVED').length;
      const rejected = applications.filter((app: any) => (app.current_status || app.status) === 'REJECTED').length;

      const byVertical: Record<Vertical, number> = { BOYS: 0, GIRLS: 0, DHARAMSHALA: 0 };
      applications.forEach((app: any) => {
        const vertical = mapAppVertical(app.vertical);
        if (byVertical[vertical] !== undefined) {
          byVertical[vertical]++;
        }
      });

      // Fetch rooms for occupancy
      const roomsResponse = await fetch('/api/rooms', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
      });
      const roomsData = await roomsResponse.json();
      const rooms = Array.isArray(roomsData) ? roomsData : roomsData.data || [];

      let totalBeds = 0;
      let occupiedBeds = 0;
      const occupancyByVertical: Record<Vertical, { total: number; occupied: number; rate: number }> = {
        BOYS: { total: 0, occupied: 0, rate: 0 },
        GIRLS: { total: 0, occupied: 0, rate: 0 },
        DHARAMSHALA: { total: 0, occupied: 0, rate: 0 },
      };

      // Map database vertical values to display values
      const mapVertical = (dbVertical: string): Vertical => {
        const mapping: Record<string, Vertical> = {
          'BOYS_HOSTEL': 'BOYS',
          'BOYS': 'BOYS',
          'GIRLS_ASHRAM': 'GIRLS',
          'GIRLS': 'GIRLS',
          'DHARAMSHALA': 'DHARAMSHALA',
        };
        return mapping[dbVertical?.toUpperCase()] || 'BOYS';
      };

      rooms.forEach((room: any) => {
        const vertical = mapVertical(room.vertical);
        const capacity = room.capacity || 0;
        const occupied = room.occupied_count || 0;

        totalBeds += capacity;
        occupiedBeds += occupied;

        if (occupancyByVertical[vertical]) {
          occupancyByVertical[vertical].total += capacity;
          occupancyByVertical[vertical].occupied += occupied;
        }
      });

      // Calculate rates
      Object.keys(occupancyByVertical).forEach((v) => {
        const vertical = v as Vertical;
        const data = occupancyByVertical[vertical];
        data.rate = data.total > 0 ? Math.round((data.occupied / data.total) * 100) : 0;
      });

      // Calculate trends (simplified - would need historical data)
      const thisMonth = new Date();
      thisMonth.setDate(1);
      const lastMonth = new Date(thisMonth);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const applicationsThisMonth = applications.filter((app: any) => {
        const created = new Date(app.createdAt || app.created_at);
        return created >= thisMonth;
      }).length;

      const applicationsPreviousMonth = applications.filter((app: any) => {
        const created = new Date(app.createdAt || app.created_at);
        return created >= lastMonth && created < thisMonth;
      }).length;

      const approvalsThisMonth = applications.filter((app: any) => {
        const updated = new Date(app.updated_at || app.updatedAt);
        return (app.current_status || app.status) === 'APPROVED' && updated >= thisMonth;
      }).length;

      const approvalsPreviousMonth = applications.filter((app: any) => {
        const updated = new Date(app.updated_at || app.updatedAt);
        return (app.current_status || app.status) === 'APPROVED' && updated >= lastMonth && updated < thisMonth;
      }).length;

      setStats({
        applications: {
          total,
          pending,
          approved,
          rejected,
          byVertical,
        },
        occupancy: {
          totalBeds,
          occupiedBeds,
          availableBeds: totalBeds - occupiedBeds,
          occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
          byVertical: occupancyByVertical,
        },
        financial: {
          totalCollected: 250000, // Mock data - would need payments API
          pendingPayments: 45000,
          thisMonthCollection: 85000,
        },
        trends: {
          applicationsThisMonth,
          applicationsPreviousMonth,
          approvalsThisMonth,
          approvalsPreviousMonth,
        },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load report data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else if (current < previous) {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    }
    return null;
  };

  const getTrendPercentage = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const change = ((current - previous) / previous) * 100;
    return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
        <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>
          {t('Loading reports...', 'रिपोर्ट लोड हो रही हैं...')}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg border" style={{ background: 'var(--color-red-50)', borderColor: 'var(--color-red-200)' }}>
        <p className="font-medium text-red-700">Error loading reports</p>
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={fetchReportData}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Reports & Analytics', 'रिपोर्ट और विश्लेषण')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('Overview of hostel operations and statistics', 'छात्रावास संचालन और आंकड़ों का अवलोकन')}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchReportData}>
          Refresh
        </Button>
      </div>

      {/* Period Filter */}
      <div className="p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Period:
          </label>
          {(['month', 'quarter', 'year'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all border-2',
                selectedPeriod === period
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              )}
            >
              {period === 'month' ? 'This Month' : period === 'quarter' ? 'This Quarter' : 'This Year'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-8 h-8 text-blue-600" />
            <div className="flex items-center gap-1">
              {getTrendIcon(stats.trends.applicationsThisMonth, stats.trends.applicationsPreviousMonth)}
              <span className="text-xs text-gray-500">
                {getTrendPercentage(stats.trends.applicationsThisMonth, stats.trends.applicationsPreviousMonth)}
              </span>
            </div>
          </div>
          <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {stats.applications.total}
          </p>
          <p className="text-sm text-gray-500">{t('Total Applications', 'कुल आवेदन')}</p>
        </div>

        <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-green-600" />
            <div className="flex items-center gap-1">
              {getTrendIcon(stats.trends.approvalsThisMonth, stats.trends.approvalsPreviousMonth)}
              <span className="text-xs text-gray-500">
                {getTrendPercentage(stats.trends.approvalsThisMonth, stats.trends.approvalsPreviousMonth)}
              </span>
            </div>
          </div>
          <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {stats.applications.approved}
          </p>
          <p className="text-sm text-gray-500">{t('Approved', 'स्वीकृत')}</p>
        </div>

        <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
          <div className="flex items-center justify-between mb-2">
            <BedDouble className="w-8 h-8 text-purple-600" />
          </div>
          <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {stats.occupancy.occupancyRate}%
          </p>
          <p className="text-sm text-gray-500">{t('Occupancy Rate', 'अधिभोग दर')}</p>
        </div>

        <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
          <div className="flex items-center justify-between mb-2">
            <IndianRupee className="w-8 h-8 text-yellow-600" />
          </div>
          <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            ₹{(stats.financial.totalCollected / 1000).toFixed(0)}K
          </p>
          <p className="text-sm text-gray-500">{t('Total Collected', 'कुल संग्रहित')}</p>
        </div>
      </div>

      {/* Applications by Status */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('Applications by Status', 'स्थिति अनुसार आवेदन')}
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">{t('Pending Review', 'समीक्षा लंबित')}</span>
                <span className="text-sm font-medium">{stats.applications.pending}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div
                  className="h-full bg-yellow-500 rounded-full"
                  style={{ width: `${stats.applications.total > 0 ? (stats.applications.pending / stats.applications.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Approved</span>
                <span className="text-sm font-medium">{stats.applications.approved}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${stats.applications.total > 0 ? (stats.applications.approved / stats.applications.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Rejected</span>
                <span className="text-sm font-medium">{stats.applications.rejected}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${stats.applications.total > 0 ? (stats.applications.rejected / stats.applications.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
          <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('Applications by Vertical', 'वर्टिकल अनुसार आवेदन')}
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Boys Hostel</span>
                <span className="text-sm font-medium">{stats.applications.byVertical.BOYS}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${stats.applications.total > 0 ? (stats.applications.byVertical.BOYS / stats.applications.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Girls Ashram</span>
                <span className="text-sm font-medium">{stats.applications.byVertical.GIRLS}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div
                  className="h-full bg-pink-500 rounded-full"
                  style={{ width: `${stats.applications.total > 0 ? (stats.applications.byVertical.GIRLS / stats.applications.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">Dharamshala</span>
                <span className="text-sm font-medium">{stats.applications.byVertical.DHARAMSHALA}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div
                  className="h-full bg-yellow-500 rounded-full"
                  style={{ width: `${stats.applications.total > 0 ? (stats.applications.byVertical.DHARAMSHALA / stats.applications.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Occupancy by Vertical */}
      <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('Occupancy by Vertical', 'वर्टिकल अनुसार अधिभोग')}
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(stats.occupancy.byVertical).map(([vertical, data]) => (
            <div key={vertical} className="p-4 rounded border" style={{ borderColor: 'var(--border-gray-200)' }}>
              <h4 className="font-medium mb-2">
                {vertical === 'BOYS' ? 'Boys Hostel' : vertical === 'GIRLS' ? 'Girls Ashram' : 'Dharamshala'}
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Beds:</span>
                  <span className="font-medium">{data.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Occupied:</span>
                  <span className="font-medium">{data.occupied}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Available:</span>
                  <span className="font-medium text-green-600">{data.total - data.occupied}</span>
                </div>
                <div className="mt-2">
                  <div className="h-3 bg-gray-200 rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        vertical === 'BOYS' && 'bg-blue-500',
                        vertical === 'GIRLS' && 'bg-pink-500',
                        vertical === 'DHARAMSHALA' && 'bg-yellow-500'
                      )}
                      style={{ width: `${data.rate}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-right mt-1">{data.rate}% occupied</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('Financial Summary', 'वित्तीय सारांश')}
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 rounded border" style={{ borderColor: 'var(--border-gray-200)' }}>
            <p className="text-sm text-gray-600 mb-1">Total Collected</p>
            <p className="text-2xl font-bold text-green-600">₹{stats.financial.totalCollected.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded border" style={{ borderColor: 'var(--border-gray-200)' }}>
            <p className="text-sm text-gray-600 mb-1">This Month</p>
            <p className="text-2xl font-bold text-blue-600">₹{stats.financial.thisMonthCollection.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded border" style={{ borderColor: 'var(--border-gray-200)' }}>
            <p className="text-sm text-gray-600 mb-1">Pending Payments</p>
            <p className="text-2xl font-bold text-yellow-600">₹{stats.financial.pendingPayments.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
