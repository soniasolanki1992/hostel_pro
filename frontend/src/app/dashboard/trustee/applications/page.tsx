'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge, type BadgeVariant } from '@/components/shadcn/badge-extended';
import { Chip } from '@/components/shadcn/chip';
import { Button } from '@/components/shadcn/button-extended';
import { Table } from '@/components/data/Table';
import { Spinner } from '@/components/feedback/Spinner';
import type { TableColumn } from '@/components/types';
import { cn } from '@/components/utils';
import {
  ApplicationReviewModal,
  type Application,
  type ApplicationStatus,
  type Vertical,
} from '../_components';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmergencyInfoModal } from '@/components/EmergencyInfoModal';

export default function TrusteeApplications() {
  const { t } = useLanguage();
  const [selectedStatus, setSelectedStatus] = useState<'PENDING' | 'ALL' | 'TRUSTEE_REVIEW' | 'TRUSTEE_FINAL_REVIEW' | 'SHORTLISTED' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [selectedVertical, setSelectedVertical] = useState<Vertical | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [emergencyApp, setEmergencyApp] = useState<Application | null>(null);

  const fetchApplications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/applications', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error('Failed to fetch applications');
      }
      const responseData = await response.json();
      const data = responseData?.data || responseData;

      const transformedApplications: Application[] = (Array.isArray(data) ? data : []).map((app: any) => {
        let applicantName = 'Unknown';
        if (app.firstName) {
          applicantName = `${app.firstName} ${app.lastName || ''}`.trim();
        } else if (app.data?.personal_info?.full_name) {
          applicantName = app.data.personal_info.full_name;
        }

        const appStatus = (app.status || app.currentStatus || app.current_status || 'SUBMITTED') as ApplicationStatus;
        const status: ApplicationStatus = appStatus;

        return {
          id: app.id,
          trackingNumber: app.trackingNumber || app.tracking_number || app.id,
          applicantName,
          vertical: ((): Vertical => {
            const v = (app.vertical || 'BOYS_HOSTEL').toUpperCase();
            if (v.includes('BOYS')) return 'BOYS';
            if (v.includes('GIRLS')) return 'GIRLS';
            if (v.includes('DHARAMSHALA')) return 'DHARAMSHALA';
            return 'BOYS';
          })(),
          status,
          applicationDate: app.createdAt
            ? new Date(app.createdAt).toLocaleDateString('en-GB')
            : new Date().toLocaleDateString('en-GB'),
          paymentStatus: app.paymentStatus || 'PAID',
          interviewScheduled: false,
          flags: app.flags || [],
          forwardedBy: (app.remarks || app.data?.status_remarks || app.forwarded_by)
            ? {
                superintendentId: app.forwarded_by?.superintendent_id || app.superintendent_id || '',
                superintendentName: app.forwarded_by?.superintendent_name || app.superintendent_name || 'Not assigned',
                forwardedOn: app.forwarded_at
                  ? new Date(app.forwarded_at).toLocaleDateString('en-GB')
                  : app.reviewed_at
                  ? new Date(app.reviewed_at).toLocaleDateString('en-GB')
                  : '',
                recommendation: app.forwarded_by?.recommendation || app.recommendation || 'PENDING',
                remarks: app.remarks || app.data?.status_remarks || '',
              }
            : undefined,
          interview: undefined,
        };
      });

      setApplications(transformedApplications);
    } catch (err: any) {
      setError(err.message || 'Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const filteredApplications = applications.filter((app) => {
    const matchesStatus =
      selectedStatus === 'ALL' ||
      (selectedStatus === 'PENDING'
        ? app.status === 'TRUSTEE_REVIEW' || app.status === 'TRUSTEE_FINAL_REVIEW'
        : app.status === selectedStatus);
    const matchesVertical = selectedVertical === 'ALL' || app.vertical === selectedVertical;
    const matchesSearch =
      app.applicantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesVertical && matchesSearch;
  });

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    REVIEW: 'Under Review',
    TRUSTEE_REVIEW: 'Pending Trustee Review',
    SHORTLISTED: 'Shortlisted',
    INTERVIEW: 'Interview Scheduled',
    TRUSTEE_FINAL_REVIEW: 'Pending Trustee Final Review',
    WAITLIST: 'Waitlisted',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn',
    ARCHIVED: 'Archived',
  };

  const getStatusVariant = (status: ApplicationStatus): BadgeVariant => {
    switch (status) {
      case 'TRUSTEE_REVIEW':
      case 'TRUSTEE_FINAL_REVIEW': return 'info';
      case 'SHORTLISTED': return 'warning';
      case 'WAITLIST': return 'warning';
      case 'APPROVED': return 'success';
      case 'REJECTED':
      case 'WITHDRAWN': return 'error';
      default: return 'default';
    }
  };

  const handleShortlist = async (applicationId: string, remarks: string) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/applications/${applicationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        status: 'SHORTLISTED',
        current_status: 'SHORTLISTED',
        remarks,
      }),
    });
    if (response.ok) {
      await fetchApplications();
    } else {
      throw new Error('Failed to shortlist application');
    }
  };

  const handleFinalApprove = async (applicationId: string, remarks: string) => {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

    const submit = async (overrides: Record<string, any>) => {
      return fetch(`/api/applications/${applicationId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: 'APPROVED', current_status: 'APPROVED', remarks, ...overrides }),
      });
    };

    let response = await submit({});

    if (response.status === 409) {
      const data = await response.json().catch(() => ({}));
      if (data?.details?.suggested_status === 'WAITLIST') {
        const moveToWaitlist = window.confirm(
          'No rooms are currently available in this vertical.\n\n' +
          'Click OK to move this applicant to the WAITLIST.\n' +
          'Click Cancel to approve anyway (override room check).'
        );
        if (moveToWaitlist) {
          response = await submit({ status: 'WAITLIST', current_status: 'WAITLIST' });
        } else {
          response = await submit({ force: true });
        }
      }
    }

    if (response.ok) {
      await fetchApplications();
    } else {
      throw new Error('Failed to approve application');
    }
  };

  const handleFinalReject = async (applicationId: string, remarks: string) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/applications/${applicationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        status: 'REJECTED',
        current_status: 'REJECTED',
        remarks,
      }),
    });
    if (response.ok) {
      await fetchApplications();
    } else {
      throw new Error('Failed to reject application');
    }
  };

  const columns: TableColumn<Application>[] = [
    {
      key: 'applicantName',
      header: 'Applicant',
      sortable: true,
      render: (value: string) => <span className="font-medium">{value}</span>,
    },
    {
      key: 'trackingNumber',
      header: 'Tracking #',
      sortable: true,
      render: (value: string) => <span className="font-mono text-xs">{value}</span>,
    },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      render: (value: Vertical) => (
        <span
          className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            value === 'BOYS' && 'bg-blue-100 text-blue-700',
            value === 'GIRLS' && 'bg-pink-100 text-pink-700',
            value === 'DHARAMSHALA' && 'bg-yellow-100 text-yellow-700'
          )}
        >
          {value}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (value: ApplicationStatus) => (
        <Badge variant={getStatusVariant(value)} size="sm">
          {STATUS_LABELS[value as string] || value.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'interviewScheduled',
      header: 'Stage',
      render: (_: boolean, row: Application) => {
        if (row.status === 'TRUSTEE_REVIEW') return <Badge variant="info" size="sm" rounded={true}>Initial</Badge>;
        if (row.status === 'TRUSTEE_FINAL_REVIEW') return <Badge variant="warning" size="sm" rounded={true}>Final</Badge>;
        if (row.status === 'SHORTLISTED') return <Badge variant="default" size="sm" rounded={true}>Shortlisted</Badge>;
        return <Badge variant="default" size="sm" rounded={true}>-</Badge>;
      },
    },
    {
      key: 'flags',
      header: 'Flags',
      render: (value: string[]) => (
        <div className="flex gap-1">
          {value &&
            value.length > 0 &&
            value.map((flag, index) => (
              <Chip key={index} variant="warning" size="sm">
                {flag}
              </Chip>
            ))}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: Application) => (
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setSelectedApplication(row)}>
            Review
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={(e: any) => { e?.stopPropagation?.(); setEmergencyApp(row); }}
            style={{ background: '#dc2626', borderColor: '#dc2626' }}
            aria-label={`Emergency info for ${row.applicantName}`}
          >
            🚨 Emergency
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
        <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>
          {t('Loading applications...', 'आवेदन लोड हो रहे हैं...')}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg border" style={{ background: 'var(--color-red-50)', borderColor: 'var(--color-red-200)' }}>
        <p className="font-medium text-red-700">Error loading applications</p>
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={fetchApplications}>
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
            {t('Applications', 'आवेदन')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('Review forwarded applications and make decisions', 'अग्रेषित आवेदनों की समीक्षा करें और निर्णय लें')}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchApplications}>
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
        <div className="flex flex-col gap-4">
          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium mr-2" style={{ color: 'var(--text-secondary)' }}>
              Status:
            </label>
            {([
              { value: 'PENDING', label: 'Pending Action' },
              { value: 'TRUSTEE_REVIEW', label: 'Initial Review' },
              { value: 'TRUSTEE_FINAL_REVIEW', label: 'Final Review' },
              { value: 'SHORTLISTED', label: 'Shortlisted' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'ALL', label: 'All' },
            ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSelectedStatus(value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-all border-2',
                    selectedStatus === value
                      ? 'border-navy-900 bg-navy-900 text-white'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  {label}
                </button>
              ))}
          </div>

          {/* Vertical Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium mr-2" style={{ color: 'var(--text-secondary)' }}>
              Vertical:
            </label>
            {(['ALL', 'BOYS', 'GIRLS', 'DHARAMSHALA'] as const).map((vertical) => (
              <button
                key={vertical}
                onClick={() => setSelectedVertical(vertical)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-all border-2',
                  selectedVertical === vertical
                    ? vertical === 'ALL'
                      ? 'border-navy-900 bg-navy-900 text-white'
                      : vertical === 'BOYS'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : vertical === 'GIRLS'
                      ? 'border-pink-600 bg-pink-600 text-white'
                      : 'border-yellow-600 bg-yellow-600 text-white'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                )}
              >
                {vertical === 'ALL' ? 'All Verticals' : vertical}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search by name or tracking #"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm flex-1 max-w-md focus:outline-none focus:ring-2 focus:ring-gold-500"
              style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedStatus('PENDING');
                setSelectedVertical('ALL');
                setSearchQuery('');
              }}
            >
              {t('Clear Filters', 'फ़िल्टर साफ़ करें')}
            </Button>
          </div>
        </div>
      </div>

      {/* Applications Table */}
      {filteredApplications.length === 0 ? (
        <div className="p-12 text-center rounded-lg" style={{ background: 'var(--surface-primary)' }}>
          <p className="text-gray-600 mb-2">{t('No applications found', 'कोई आवेदन नहीं मिला')}</p>
          <p className="text-sm text-gray-500">{t('Try adjusting your filters or check back later.', 'अपने फ़िल्टर बदलकर देखें या बाद में पुनः जांचें।')}</p>
        </div>
      ) : (
        <Table<Application>
          data={filteredApplications}
          columns={columns}
          onRowClick={(row) => setSelectedApplication(row)}
          pagination={{
            currentPage: 1,
            pageSize: 10,
            totalItems: filteredApplications.length,
            totalPages: Math.ceil(filteredApplications.length / 10),
            onPageChange: () => {},
          }}
          density="normal"
          striped={true}
        />
      )}

      {/* Emergency Info Modal */}
      {emergencyApp && (
        <EmergencyInfoModal
          applicationId={emergencyApp.id}
          studentName={emergencyApp.applicantName}
          onClose={() => setEmergencyApp(null)}
        />
      )}

      {/* Application Review Modal */}
      <ApplicationReviewModal
        isOpen={selectedApplication !== null}
        onClose={() => setSelectedApplication(null)}
        application={selectedApplication}
        onShortlist={handleShortlist}
        onFinalApprove={handleFinalApprove}
        onFinalReject={handleFinalReject}
      />
    </div>
  );
}
