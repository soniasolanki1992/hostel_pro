'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge, type BadgeVariant } from '@/components/shadcn/badge-extended';
import { Chip } from '@/components/shadcn/chip';
import { Button } from '@/components/shadcn/button-extended';
import { Modal } from '@/components/feedback/Modal';
import { Table } from '@/components/data/Table';
import { SendMessagePanel, type SendMessageData, DEFAULT_TEMPLATES } from '@/components/communication/SendMessagePanel';
import type { TableColumn } from '@/components/types';
import { cn } from '@/components/utils';
import { Spinner } from '@/components/feedback/Spinner';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmergencyInfoModal } from '@/components/EmergencyInfoModal';

// Types
type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEW' | 'TRUSTEE_REVIEW' | 'SHORTLISTED' | 'INTERVIEW' | 'TRUSTEE_FINAL_REVIEW' | 'WAITLIST' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'ARCHIVED';
type Vertical = 'BOYS' | 'GIRLS' | 'DHARAMSHALA';

interface ApplicationDocument {
  type: string;
  documentType: string;
  dbDocumentType: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
}

interface InterviewDetails {
  scheduleTime: string | null;
  mode: string | null;
}

interface Application {
  id: string;
  trackingNumber: string;
  applicantName: string;
  vertical: Vertical;
  status: ApplicationStatus;
  applicationDate: string;
  paymentStatus: string;
  interviewScheduled: boolean;
  interview?: InterviewDetails;
  flags?: string[];
  email?: string;
  mobile?: string;
  documents?: ApplicationDocument[];
}


export default function SuperintendentDashboard() {
  const { t } = useLanguage();
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus | 'ALL' | 'PENDING'>('PENDING');
  const [selectedVertical, setSelectedVertical] = useState<Vertical | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [emergencyApp, setEmergencyApp] = useState<Application | null>(null);

  // API data state
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Fetch applications from API
  const fetchApplications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/applications', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error('Failed to fetch applications');
      }
      const result = await response.json();
      // Handle wrapped response format: { success: true, data: [...] }
      const data = result.data || result;

      // Transform API data to UI format
      const transformedApplications: Application[] = Array.isArray(data) ? data.map((app: any) => {
        // Extract applicant name from different formats (check snake_case first as that's the DB format)
        let applicantName = 'Unknown';
        if (app.applicant_name) {
          applicantName = app.applicant_name;
        } else if (app.applicantName) {
          applicantName = app.applicantName;
        } else if (app.firstName) {
          applicantName = `${app.firstName} ${app.lastName || ''}`.trim();
        } else if (app.data?.personal_info?.full_name) {
          applicantName = app.data.personal_info.full_name;
        } else if (app.data?.personalInfo?.fullName) {
          applicantName = app.data.personalInfo.fullName;
        }

        return {
          id: app.id,
          trackingNumber: app.trackingNumber || app.tracking_number || `HG-${new Date().getFullYear()}-00000`,
          applicantName,
          vertical: mapVertical(app.personalInfo?.vertical || app.vertical || app.data?.vertical),
          status: mapApplicationStatus(app.current_status || app.currentStatus || app.status),
          applicationDate: app.created_at ? new Date(app.created_at).toLocaleDateString('en-GB') :
                          app.createdAt ? new Date(app.createdAt).toLocaleDateString('en-GB') :
                          app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-GB') :
                          app.submitted_at ? new Date(app.submitted_at).toLocaleDateString('en-GB') :
                          new Date().toLocaleDateString('en-GB'),
          paymentStatus: app.payment_status || app.fees?.paymentStatus || app.paymentStatus || 'PENDING',
          interviewScheduled: app.interview?.scheduled || app.interviewScheduled || !!app.interview_scheduled_at || false,
          interview: {
            scheduleTime: app.interview_scheduled_at || app.data?.interview?.scheduled_at || null,
            mode: app.data?.interview?.mode || null,
          },
          flags: app.flags || [],
          email: app.personalInfo?.email || app.applicant_email || app.applicantEmail || app.email,
          mobile: app.personalInfo?.mobile || app.applicant_mobile || app.applicantMobile || app.mobile
        };
      }) : [];
      
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

  // Fetch full application details including documents
  const fetchApplicationDetails = useCallback(async (appId: string) => {
    try {
      setIsLoadingDetails(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/applications/${appId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error('Failed to fetch application details');
      }
      const result = await response.json();
      const appData = result.data || result;

      // Extract documents from the application data
      const documents: ApplicationDocument[] = appData.documents || appData.data?.documents || [];

      // Extract interview details
      const interview: InterviewDetails = {
        scheduleTime: appData.interview_scheduled_at || appData.data?.interview?.scheduled_at || null,
        mode: appData.data?.interview?.mode || null,
      };

      return { documents, interview };
    } catch (err) {
      return { documents: [], interview: { scheduleTime: null, mode: null } };
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  // Handle viewing an application - fetch full details
  const handleViewApplication = useCallback(async (app: Application) => {
    setSelectedApplication(app);
    const { documents, interview } = await fetchApplicationDetails(app.id);
    setSelectedApplication(prev => prev ? { ...prev, documents, interview } : null);
  }, [fetchApplicationDetails]);

  // View document in new tab
  const handleViewDocument = async (doc: ApplicationDocument) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/applications/documents/url?path=${encodeURIComponent(doc.storagePath)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        alert('Failed to get document URL');
        return;
      }
      const result = await response.json();
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        alert('Document URL not available');
      }
    } catch (err) {
      alert('Failed to open document');
    }
  };

  // Communication state (for sending messages to applicants)
  const [showMessagePanel, setShowMessagePanel] = useState(false);
  const [selectedMessageRecipient, setSelectedMessageRecipient] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Action confirmation modal state
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject' | 'forward';
    application: Application | null;
    remarks: string;
  }>({
    isOpen: false,
    type: 'approve',
    application: null,
    remarks: ''
  });
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Interview scheduling state
  const [interviewModal, setInterviewModal] = useState<{
    isOpen: boolean;
    application: Application | null;
    mode: 'ONLINE' | 'PHYSICAL';
    date: string;
    time: string;
    isScheduling: boolean;
    error: string | null;
  }>({
    isOpen: false,
    application: null,
    mode: 'ONLINE',
    date: '',
    time: '',
    isScheduling: false,
    error: null,
  });

  const handleScheduleInterview = async () => {
    const { application, date, time, mode } = interviewModal;
    if (!application || !date || !time) {
      setInterviewModal(prev => ({ ...prev, error: 'Please select date and time' }));
      return;
    }
    setInterviewModal(prev => ({ ...prev, isScheduling: true, error: null }));
    try {
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          application_id: application.id,
          schedule_time: `${date}T${time}:00Z`,
          mode: mode === 'PHYSICAL' ? 'IN_PERSON' : 'ZOOM',
        }),
      });

      if (res.ok) {
        // Update application status to REVIEW/INTERVIEW
        await fetch(`/api/applications/${application.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ status: 'INTERVIEW', current_status: 'INTERVIEW' }),
        });
        setInterviewModal({ isOpen: false, application: null, mode: 'ONLINE', date: '', time: '', isScheduling: false, error: null });
        setSelectedApplication(null);
        await fetchApplications();
        alert('Interview scheduled successfully');
      } else {
        const data = await res.json();
        setInterviewModal(prev => ({ ...prev, isScheduling: false, error: data.error || 'Failed to schedule interview' }));
      }
    } catch {
      setInterviewModal(prev => ({ ...prev, isScheduling: false, error: 'Failed to schedule interview' }));
    }
  };

  // Status mapping functions
  const mapApplicationStatus = (status: string): ApplicationStatus => {
    const statusMap: Record<string, ApplicationStatus> = {
      'DRAFT': 'DRAFT',
      'SUBMITTED': 'SUBMITTED',
      'REVIEW': 'REVIEW',
      'UNDER_REVIEW': 'REVIEW',
      'NEW': 'SUBMITTED',
      'INTERVIEW': 'INTERVIEW',
      'TRUSTEE_REVIEW': 'TRUSTEE_REVIEW',
      'SHORTLISTED': 'SHORTLISTED',
      'TRUSTEE_FINAL_REVIEW': 'TRUSTEE_FINAL_REVIEW',
      'APPROVED': 'APPROVED',
      'REJECTED': 'REJECTED',
      'WITHDRAWN': 'WITHDRAWN',
      'ARCHIVED': 'ARCHIVED',
    };
    return statusMap[status] || 'DRAFT';
  };

  const mapVertical = (vertical: string): Vertical => {
    const verticalMap: Record<string, Vertical> = {
      'BOYS': 'BOYS',
      'BOYS_HOSTEL': 'BOYS',
      'GIRLS': 'GIRLS',
      'GIRLS_ASHRAM': 'GIRLS',
      'DHARAMSHALA': 'DHARAMSHALA'
    };
    return verticalMap[vertical] || 'BOYS';
  };

  // Filter applications (vertical already filtered by API for superintendents)
  const filteredApplications = applications.filter(app => {
    let matchesStatus = false;
    if (selectedStatus === 'ALL') {
      matchesStatus = true;
    } else if (selectedStatus === 'PENDING') {
      matchesStatus = ['SUBMITTED', 'REVIEW', 'SHORTLISTED', 'INTERVIEW'].includes(app.status);
    } else {
      matchesStatus = app.status === selectedStatus;
    }
    const matchesSearch = app.applicantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       app.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Status badge variants
  const getStatusVariant = (status: ApplicationStatus): BadgeVariant => {
    switch (status) {
      case 'DRAFT': return 'default';
      case 'SUBMITTED':
      case 'REVIEW':
      case 'SHORTLISTED':
      case 'INTERVIEW': return 'warning';
      case 'TRUSTEE_REVIEW':
      case 'TRUSTEE_FINAL_REVIEW': return 'info';
      case 'WAITLIST': return 'warning';
      case 'APPROVED': return 'success';
      case 'REJECTED':
      case 'WITHDRAWN': return 'error';
      case 'ARCHIVED': return 'default';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: ApplicationStatus): string => {
    const labels: Record<ApplicationStatus, string> = {
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      REVIEW: 'Under Review',
      TRUSTEE_REVIEW: 'Awaiting Trustee Review',
      SHORTLISTED: 'Shortlisted',
      INTERVIEW: 'Interview Scheduled',
      TRUSTEE_FINAL_REVIEW: 'Awaiting Trustee Final Review',
      WAITLIST: 'Waitlisted',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      WITHDRAWN: 'Withdrawn',
      ARCHIVED: 'Archived',
    };
    return labels[status] || status;
  };

  const handleSendMessage = async (data: SendMessageData) => {
    setIsSending(true);
    try {
      // TODO: Implement actual message sending via API
      // In a real implementation, this would call the communications API
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    } catch {
    } finally {
      setIsSending(false);
    }
  };

  // Table columns
  const columns: TableColumn<Application>[] = [
    {
      key: 'applicantName',
      header: 'Applicant Name',
      sortable: true,
      render: (value: string) => (
        <span className="font-medium">{value}</span>
      )
    },
    {
      key: 'trackingNumber',
      header: 'Tracking #',
      sortable: true,
      render: (value: string) => (
        <span className="font-mono text-xs">{value}</span>
      )
    },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      render: (value: Vertical) => (
        <span className={cn(
          'px-2 py-0.5 rounded text-xs font-medium',
          value === 'BOYS' && 'bg-blue-100 text-blue-700',
          value === 'GIRLS' && 'bg-pink-100 text-pink-700',
          value === 'DHARAMSHALA' && 'bg-yellow-100 text-yellow-700'
        )}>
          {value}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (value: ApplicationStatus) => (
        <Badge variant={getStatusVariant(value)} size="sm">
          {getStatusLabel(value)}
        </Badge>
      )
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      sortable: true,
      render: (value: string) => (
        <Badge
          variant={value === 'PAID' ? 'success' : value === 'PENDING' ? 'warning' : 'error'}
          size="sm"
        >
          {value}
        </Badge>
      )
    },
    {
      key: 'interviewScheduled',
      header: 'Interview',
      render: (value: boolean) => (
        <Badge
          variant={value ? 'success' : 'default'}
          size="sm"
          rounded={true}
        >
          {value ? 'Scheduled' : 'Not Scheduled'}
        </Badge>
      )
    },
    {
      key: 'flags',
      header: 'Flags',
      render: (value: string[]) => (
        <div className="flex gap-1">
          {value && value.length > 0 && value.map((flag, index) => (
            <Chip
              key={index}
              variant="warning"
              size="sm"
            >
              {flag}
            </Chip>
          ))}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: Application) => (
        <div className="flex gap-2">
          {['SUBMITTED', 'REVIEW', 'SHORTLISTED', 'INTERVIEW'].includes(row.status) ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleViewApplication(row)}
            >
              Review
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleViewApplication(row)}
            >
              View Details
            </Button>
          )}
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
      )
    }
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Page Title */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Applications', 'आवेदन')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('Review and manage hostel admission applications', 'छात्रावास प्रवेश आवेदनों की समीक्षा और प्रबंधन करें')}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchApplications}>
          {t('Refresh', 'रिफ्रेश')}
        </Button>
      </div>

      {/* Overview Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Total Applications', 'कुल आवेदन')}</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{applications.length}</p>
          </div>
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Pending Review', 'समीक्षा लंबित')}</p>
            <p className="text-2xl font-bold text-amber-600">
              {applications.filter(a => ['SUBMITTED', 'REVIEW', 'INTERVIEW'].includes(a.status)).length}
            </p>
          </div>
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Approved', 'स्वीकृत')}</p>
            <p className="text-2xl font-bold text-green-600">
              {applications.filter(a => a.status === 'APPROVED').length}
            </p>
          </div>
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Interviews', 'साक्षात्कार')}</p>
            <p className="text-2xl font-bold text-blue-600">
              {applications.filter(a => a.interviewScheduled).length}
            </p>
          </div>
        </div>
      )}

      {/* Applications Content */}
      <div>
            {/* Filters - Enhanced with Filter Chips */}
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex flex-col gap-4">
                {/* Status Filter Chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm font-medium mr-2" style={{ color: 'var(--text-secondary)' }}>
                    Status:
                  </label>
                  {[
                    { value: 'PENDING', label: t('Pending Action', 'कार्रवाई लंबित') },
                    { value: 'ALL', label: t('All', 'सभी') },
                    { value: 'APPROVED', label: t('Approved', 'स्वीकृत') },
                    { value: 'REJECTED', label: t('Rejected', 'अस्वीकृत') },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setSelectedStatus(filter.value as any)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-medium transition-all border-2',
                        selectedStatus === filter.value
                          ? 'border-navy-900 bg-navy-900 text-white'
                          : 'border-gray-300 text-gray-700 hover:border-gray-400'
                      )}
                    >
                      {filter.label}
                      {filter.value === 'PENDING' && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-white text-navy-900 rounded-full text-xs">
                          {applications.filter(a => ['SUBMITTED', 'REVIEW', 'INTERVIEW'].includes(a.status)).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Search and Clear */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Search:
                    </label>
                    <input
                      type="text"
                      placeholder="Search by name or tracking #"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded border border-gray-300 px-3 py-2 text-sm flex-1 max-w-md focus:outline-none focus:ring-2 focus:ring-gold-500"
                      style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* Clear Filters */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedStatus('ALL');
                      setSelectedVertical('ALL');
                      setSearchQuery('');
                    }}
                  >
                    {t('Clear Filters', 'फ़िल्टर साफ़ करें')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchApplications}
                  >
                    {t('Refresh', 'रीफ्रेश')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Applications Content */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
                <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>{t('Loading applications...', 'आवेदन लोड हो रहे हैं...')}</span>
              </div>
            ) : error ? (
              <div className="p-4 rounded-lg border" style={{ background: 'var(--color-red-50)', borderColor: 'var(--color-red-200)' }}>
                <p style={{ color: 'var(--color-red-700)' }} className="font-medium">{t('Error loading applications', 'आवेदन लोड करने में त्रुटि')}</p>
                <p style={{ color: 'var(--color-red-600)' }} className="text-sm">{error}</p>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="mt-3"
                  onClick={fetchApplications}
                >
                  {t('Retry', 'पुनः प्रयास करें')}
                </Button>
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="p-12 text-center rounded-lg" style={{ background: 'var(--surface-primary)' }}>
                <p className="text-gray-600 mb-2">{t('No applications found', 'कोई आवेदन नहीं मिला')}</p>
                <p className="text-sm text-gray-500">{t('Try adjusting your filters or check back later.', 'अपने फ़िल्टर बदलकर देखें या बाद में पुनः जांचें।')}</p>
              </div>
            ) : (
              <Table<Application>
                data={filteredApplications}
                columns={columns}
                onRowClick={(row) => handleViewApplication(row)}
                pagination={{
                  currentPage: 1,
                  pageSize: 10,
                  totalItems: filteredApplications.length,
                  totalPages: Math.ceil(filteredApplications.length / 10),
                  onPageChange: () => {}
                }}
                density="normal"
                striped={true}
              />
            )}
          </div>

      {/* Application Detail Modal */}
      <Modal
        isOpen={selectedApplication !== null}
        onClose={() => setSelectedApplication(null)}
        title="Application Details"
        size="xl"
      >
        {selectedApplication && (
          <div className="space-y-6">
            {/* Applicant Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Applicant Information
              </h3>
              <div className="flex items-start gap-6">
                <img
                  src={`/api/applications/${selectedApplication.id}/photo`}
                  alt={selectedApplication.applicantName}
                  className="w-28 h-36 object-cover rounded border bg-gray-100 flex-shrink-0"
                  style={{ borderColor: 'var(--border-primary)' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                />
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div>
                    <label className="text-sm text-gray-600">Name</label>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {selectedApplication.applicantName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Tracking Number</label>
                    <p className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                      {selectedApplication.trackingNumber}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Vertical</label>
                    <Badge
                      variant={selectedApplication.vertical === 'BOYS' ? 'success' : selectedApplication.vertical === 'GIRLS' ? 'warning' : 'info'}
                      size="md"
                    >
                      {selectedApplication.vertical}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Application Date</label>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {selectedApplication.applicationDate}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Status & Payment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Application Status</label>
                <Badge
                  variant={getStatusVariant(selectedApplication.status)}
                  size="md"
                  className="mt-2"
                >
                  {selectedApplication.status.replace('_', ' ')}
                </Badge>
              </div>
              <div>
                <label className="text-sm text-gray-600">Payment Status</label>
                <Badge
                  variant={selectedApplication.paymentStatus === 'PAID' ? 'success' : selectedApplication.paymentStatus === 'PENDING' ? 'warning' : 'error'}
                  size="md"
                  className="mt-2"
                >
                  {selectedApplication.paymentStatus}
                </Badge>
              </div>
            </div>

            {/* Interview Details */}
            {selectedApplication.interviewScheduled && selectedApplication.interview?.scheduleTime && (
              <div className="p-4 rounded-lg" style={{ background: 'var(--bg-page)' }}>
                <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Interview Scheduled
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm text-gray-600">Date</label>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {new Date(selectedApplication.interview.scheduleTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Time</label>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {new Date(selectedApplication.interview.scheduleTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
                    </p>
                  </div>
                  {selectedApplication.interview.mode && (
                    <div>
                      <label className="text-sm text-gray-600">Mode</label>
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {selectedApplication.interview.mode}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Flags */}
            {selectedApplication.flags && selectedApplication.flags.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Flags
                </h4>
                <div className="flex gap-2">
                  {selectedApplication.flags.map((flag, index) => (
                    <Chip
                      key={index}
                      variant="warning"
                      size="sm"
                    >
                      {flag}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* Documents Preview */}
            <div>
              <h4 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Uploaded Documents
              </h4>
              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner size="sm" />
                  <span className="ml-2 text-sm text-gray-500">Loading documents...</span>
                </div>
              ) : selectedApplication.documents && selectedApplication.documents.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {selectedApplication.documents.map((doc, index) => {
                    const docTypeLabels: Record<string, string> = {
                      'photoFile': 'Passport Photo',
                      'birthCertificate': 'Birth Certificate',
                      'marksheet': 'Academic Marksheet',
                      'recommendationLetter': 'Recommendation Letter',
                      'PHOTOGRAPH': 'Passport Photo',
                      'BIRTH_CERTIFICATE': 'Birth Certificate',
                      'EDUCATION_CERTIFICATE': 'Academic Document',
                      'OTHER': 'Other Document',
                    };
                    const label = docTypeLabels[doc.type] || docTypeLabels[doc.dbDocumentType] || doc.type;
                    const fileExt = doc.originalFileName?.split('.').pop()?.toUpperCase() || 'PDF';
                    const fileSize = doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : 'Unknown';

                    return (
                      <div
                        key={index}
                        className="p-4 rounded border cursor-pointer hover:shadow-md transition-shadow"
                        style={{ borderColor: 'var(--border-gray-200)', background: 'var(--bg-page)' }}
                        onClick={() => handleViewDocument(doc)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{fileExt === 'PDF' ? '📄' : '🖼️'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                              {label}
                            </p>
                            <p className="text-xs text-gray-600">{fileExt} • {fileSize}</p>
                          </div>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded border text-center" style={{ borderColor: 'var(--border-gray-200)', background: 'var(--bg-page)' }}>
                  <p className="text-sm text-gray-500">No documents uploaded yet</p>
                </div>
              )}
            </div>

            {/* Internal Notes */}
            <div>
              <h4 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Internal Notes (Superintendent Remarks)
              </h4>
              <textarea
                placeholder="Add internal remarks..."
                className="w-full rounded border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[100px]"
                style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Download PDF */}
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const token = localStorage.getItem('authToken');
                  if (!token) {
                    alert('Please login again');
                    return;
                  }
                  window.open(`/api/applications/${selectedApplication?.id}/pdf?token=${encodeURIComponent(token)}`, '_blank');
                }}
              >
                Download Application PDF
              </Button>
            </div>

            {/* Action Buttons - status-driven workflow */}
            {selectedApplication && ['SUBMITTED', 'REVIEW', 'SHORTLISTED', 'INTERVIEW'].includes(selectedApplication.status) && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
              <div className="flex gap-3 flex-wrap">
                {/* Pre-trustee: only Approve & Forward */}
                {(selectedApplication.status === 'SUBMITTED' || selectedApplication.status === 'REVIEW') && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setActionModal({
                        isOpen: true,
                        type: 'forward',
                        application: selectedApplication,
                        remarks: ''
                      });
                    }}
                  >
                    Approve &amp; Forward to Trustee
                  </Button>
                )}

                {/* Trustee shortlisted: schedule interview */}
                {selectedApplication.status === 'SHORTLISTED' && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setInterviewModal({
                        isOpen: true,
                        application: selectedApplication,
                        mode: 'ONLINE',
                        date: '',
                        time: '',
                        isScheduling: false,
                        error: null,
                      });
                    }}
                  >
                    Schedule Interview
                  </Button>
                )}

                {/* Post-interview: approve or send to trustee for final review */}
                {selectedApplication.status === 'INTERVIEW' && (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setActionModal({
                          isOpen: true,
                          type: 'approve',
                          application: selectedApplication,
                          remarks: ''
                        });
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setActionModal({
                          isOpen: true,
                          type: 'reject',
                          application: selectedApplication,
                          remarks: ''
                        });
                      }}
                    >
                      Reject
                    </Button>
                  </>
                )}
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedMessageRecipient(selectedApplication.id);
                  setShowMessagePanel(true);
                }}
              >
                Send Message
              </Button>
            </div>
            )}

            {/* Read-only banner for in-flight states owned by Trustee */}
            {selectedApplication && (selectedApplication.status === 'TRUSTEE_REVIEW' || selectedApplication.status === 'TRUSTEE_FINAL_REVIEW') && (
              <div className="p-3 rounded border bg-blue-50 text-blue-800 text-sm" style={{ borderColor: 'var(--border-gray-200)' }}>
                {selectedApplication.status === 'TRUSTEE_REVIEW'
                  ? 'Awaiting Trustee review. You will be able to schedule an interview once the Trustee shortlists this applicant.'
                  : 'Awaiting Trustee final review of your post-interview rejection.'}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Action Confirmation Modal */}
      <Modal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, type: 'approve', application: null, remarks: '' })}
        title={
          actionModal.type === 'approve' ? 'Approve Application' :
          actionModal.type === 'reject' ? 'Reject (Send to Trustee for Final Review)' : 'Approve & Forward to Trustee'
        }
        size="md"
        variant={actionModal.type === 'reject' ? 'destructive' : 'confirmation'}
        onConfirm={async () => {
          if (!actionModal.application) return;

          setIsActionLoading(true);
          try {
            // Sup post-interview reject routes to Trustee for override decision.
            const newStatus = actionModal.type === 'approve' ? 'APPROVED' :
                              actionModal.type === 'reject' ? 'TRUSTEE_FINAL_REVIEW' :
                              'TRUSTEE_REVIEW';

            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/applications/${actionModal.application.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
              body: JSON.stringify({
                status: newStatus,
                current_status: newStatus,
                remarks: actionModal.remarks
              })
            });

            if (response.ok) {
              await fetchApplications();
              setActionModal({ isOpen: false, type: 'approve', application: null, remarks: '' });
              setSelectedApplication(null);
              alert(
                actionModal.type === 'approve' ? 'Application approved' :
                actionModal.type === 'reject' ? 'Sent to Trustee for final review' :
                'Forwarded to Trustee for review'
              );
            } else {
              alert('Failed to update application status');
            }
          } catch (err) {
            alert('Failed to update application status');
          } finally {
            setIsActionLoading(false);
          }
        }}
        confirmText={actionModal.type === 'approve' ? 'Approve' : actionModal.type === 'reject' ? 'Send to Trustee' : 'Forward'}
        confirmLoading={isActionLoading}
      >
        {actionModal.application && (
          <div className="space-y-4">
            {/* Application Summary */}
            <div className="p-4 rounded border" style={{ background: 'var(--bg-page)', borderColor: 'var(--border-gray-200)' }}>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-gray-600">Applicant Name</label>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {actionModal.application.applicantName}
                  </p>
                </div>
                <div>
                  <label className="text-gray-600">Tracking Number</label>
                  <p className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    {actionModal.application.trackingNumber}
                  </p>
                </div>
                <div>
                  <label className="text-gray-600">Vertical</label>
                  <Badge
                    variant={actionModal.application.vertical === 'BOYS' ? 'success' : actionModal.application.vertical === 'GIRLS' ? 'warning' : 'info'}
                    size="sm"
                    className="mt-1"
                  >
                    {actionModal.application.vertical}
                  </Badge>
                </div>
                <div>
                  <label className="text-gray-600">Current Status</label>
                  <Badge
                    variant={getStatusVariant(actionModal.application.status)}
                    size="sm"
                    className="mt-1"
                  >
                    {actionModal.application.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              {/* Payment Status Warning */}
              {actionModal.application.paymentStatus !== 'PAID' && (
                <div className="mt-4 p-3 rounded border-l-4" style={{
                  background: 'var(--color-yellow-50)',
                  borderColor: 'var(--color-yellow-500)'
                }}>
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-600">⚠️</span>
                    <div>
                      <p className="font-medium text-yellow-800">Payment Status: {actionModal.application.paymentStatus}</p>
                      <p className="text-sm text-yellow-700">
                        Consider payment status before proceeding with this action.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Remarks Field */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Remarks <span className="text-red-500">*</span>
              </label>
              <textarea
                value={actionModal.remarks}
                onChange={(e) => setActionModal({ ...actionModal, remarks: e.target.value })}
                placeholder={actionModal.type === 'approve'
                  ? 'Enter approval remarks (e.g., Documents verified, interview completed successfully)'
                  : actionModal.type === 'reject'
                  ? 'Enter rejection reason (e.g., Incomplete documents, does not meet eligibility criteria)'
                  : 'Enter remarks for trustees (e.g., Recommendation, additional notes)'
                }
                className="w-full rounded border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[100px]"
                style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Remarks will be recorded in the audit trail and visible to other superintendents.
              </p>
            </div>

            {/* Vertical Context Warning */}
            {selectedVertical !== 'ALL' && actionModal.application.vertical !== selectedVertical && (
              <div className="p-3 rounded border-l-4" style={{
                background: 'var(--color-red-50)',
                borderColor: 'var(--color-red-500)'
              }}>
                <div className="flex items-start gap-2">
                  <span className="text-red-600">🚨</span>
                  <div>
                    <p className="font-medium text-red-800">Cross-Vertical Action Warning</p>
                    <p className="text-sm text-red-700">
                      You are currently viewing <strong>{selectedVertical}</strong> applications but attempting to take action on a <strong>{actionModal.application.vertical}</strong> application.
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      Please verify this is intentional before proceeding.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Send Message Panel */}
      <SendMessagePanel
        isOpen={showMessagePanel}
        onClose={() => {
          setShowMessagePanel(false);
          setSelectedMessageRecipient(null);
        }}
        onSend={handleSendMessage}
        recipients={applications.map(app => ({
          id: app.id,
          name: app.applicantName,
          role: 'applicant' as const,
          phone: app.mobile || '',
          email: app.email || ''
        }))}
        templates={DEFAULT_TEMPLATES}
        defaultRecipientId={selectedMessageRecipient || undefined}
        context={selectedApplication ? {
          trackingNumber: selectedApplication.trackingNumber,
          status: selectedApplication.status,
          vertical: selectedApplication.vertical
        } : undefined}
        isLoading={isSending}
        showContextWarning={!!selectedApplication}
      />

      {/* Interview Schedule Modal */}
      <Modal
        isOpen={interviewModal.isOpen}
        onClose={() => setInterviewModal(prev => ({ ...prev, isOpen: false }))}
        title="Schedule Interview"
        size="md"
      >
        {interviewModal.application && (
          <div className="space-y-6">
            {/* Application Summary */}
            <div className="p-4 rounded border" style={{ background: 'var(--bg-page)', borderColor: 'var(--border-gray-200)' }}>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-gray-600">Applicant</label>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {interviewModal.application.applicantName}
                  </p>
                </div>
                <div>
                  <label className="text-gray-600">Tracking #</label>
                  <p className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    {interviewModal.application.trackingNumber}
                  </p>
                </div>
                <div>
                  <label className="text-gray-600">Vertical</label>
                  <Badge
                    variant={interviewModal.application.vertical === 'BOYS' ? 'success' : interviewModal.application.vertical === 'GIRLS' ? 'warning' : 'info'}
                    size="sm"
                    className="mt-1"
                  >
                    {interviewModal.application.vertical}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Interview Mode */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-primary)' }}>
                Interview Mode
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="supt-interview-mode"
                    value="ONLINE"
                    checked={interviewModal.mode === 'ONLINE'}
                    onChange={() => setInterviewModal(prev => ({ ...prev, mode: 'ONLINE' }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Online (Zoom/Google Meet)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="supt-interview-mode"
                    value="PHYSICAL"
                    checked={interviewModal.mode === 'PHYSICAL'}
                    onChange={() => setInterviewModal(prev => ({ ...prev, mode: 'PHYSICAL' }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Physical (In-person)</span>
                </label>
              </div>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-primary)' }}>
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={interviewModal.date}
                  onChange={(e) => setInterviewModal(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                  style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-primary)' }}>
                  Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={interviewModal.time}
                  onChange={(e) => setInterviewModal(prev => ({ ...prev, time: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                  style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                  required
                />
              </div>
            </div>

            {/* Online mode info */}
            {interviewModal.mode === 'ONLINE' && (
              <div className="p-3 rounded border-l-4 bg-blue-50 border-blue-500">
                <p className="text-sm text-blue-800">
                  A meeting link will be generated automatically and sent to the applicant.
                </p>
              </div>
            )}

            {/* Error */}
            {interviewModal.error && (
              <div className="p-3 rounded border-l-4 bg-red-50 border-red-500">
                <p className="text-sm text-red-800">{interviewModal.error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
              <Button
                variant="primary"
                onClick={handleScheduleInterview}
                loading={interviewModal.isScheduling}
                disabled={!interviewModal.date || !interviewModal.time}
              >
                Schedule Interview
              </Button>
              <Button variant="secondary" onClick={() => setInterviewModal(prev => ({ ...prev, isOpen: false }))}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Emergency Info Modal */}
      {emergencyApp && (
        <EmergencyInfoModal
          applicationId={emergencyApp.id}
          studentName={emergencyApp.applicantName}
          onClose={() => setEmergencyApp(null)}
        />
      )}
    </div>
  );
}
