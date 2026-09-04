'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/feedback/Modal';
import { Badge, type BadgeVariant } from '@/components/shadcn/badge-extended';
import { Button } from '@/components/shadcn/button-extended';
import { Chip } from '@/components/shadcn/chip';
import { FileText } from 'lucide-react';

export type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEW' | 'TRUSTEE_REVIEW' | 'SHORTLISTED' | 'INTERVIEW' | 'TRUSTEE_FINAL_REVIEW' | 'WAITLIST' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'ARCHIVED';
export type Vertical = 'BOYS' | 'GIRLS' | 'DHARAMSHALA';
export type DecisionType = 'SHORTLIST' | 'APPROVE' | 'REJECT';

export interface Application {
  id: string;
  trackingNumber: string;
  applicantName: string;
  vertical: Vertical;
  status: ApplicationStatus;
  applicationDate: string;
  paymentStatus: string;
  interviewScheduled: boolean;
  flags?: string[];
  forwardedBy?: {
    superintendentId: string;
    superintendentName: string;
    forwardedOn: string;
    recommendation: 'RECOMMEND' | 'NOT_RECOMMEND' | 'NEUTRAL';
    remarks: string;
  };
  interview?: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    mode: 'ONLINE' | 'PHYSICAL';
    meetingLink?: string;
    location?: string;
    status: 'NOT_SCHEDULED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
    score?: number;
  };
}

interface ApplicationReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: Application | null;
  onShortlist?: (applicationId: string, remarks: string) => Promise<void>;
  onFinalApprove: (applicationId: string, remarks: string) => Promise<void>;
  onFinalReject: (applicationId: string, remarks: string) => Promise<void>;
  onSendMessage?: (applicationId: string) => void;
}

export function ApplicationReviewModal({
  isOpen,
  onClose,
  application,
  onShortlist,
  onFinalApprove,
  onFinalReject,
  onSendMessage,
}: ApplicationReviewModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'documents' | 'interview' | 'audit'>('summary');
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Fetch documents when application changes
  useEffect(() => {
    if (application && isOpen) {
      const fetchDocs = async () => {
        setDocsLoading(true);
        try {
          const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
          const response = await fetch(`/api/applications/${application.id}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          });
          if (response.ok) {
            const result = await response.json();
            const appData = result.data?.data || result.data;
            setDocuments(appData?.documents || appData?.data?.documents || []);
          }
        } catch {
          // Documents are optional, don't block
        } finally {
          setDocsLoading(false);
        }
      };
      fetchDocs();
    }
  }, [application?.id, isOpen]);

  const getStatusVariant = (status: ApplicationStatus): BadgeVariant => {
    switch (status) {
      case 'TRUSTEE_REVIEW':
      case 'TRUSTEE_FINAL_REVIEW': return 'info';
      case 'SHORTLISTED':
      case 'INTERVIEW': return 'warning';
      case 'WAITLIST': return 'warning';
      case 'APPROVED': return 'success';
      case 'REJECTED':
      case 'WITHDRAWN': return 'error';
      default: return 'default';
    }
  };

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft', SUBMITTED: 'Submitted', REVIEW: 'Under Review',
    TRUSTEE_REVIEW: 'Pending Trustee Review',
    SHORTLISTED: 'Shortlisted',
    INTERVIEW: 'Interview Scheduled',
    TRUSTEE_FINAL_REVIEW: 'Pending Trustee Final Review',
    WAITLIST: 'Waitlisted',
    APPROVED: 'Approved',
    REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn', ARCHIVED: 'Archived',
  };

  const handleDecision = async (type: DecisionType) => {
    if (!application || !decisionRemarks.trim()) {
      setError('Please provide remarks for your decision');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      switch (type) {
        case 'SHORTLIST':
          if (onShortlist) await onShortlist(application.id, decisionRemarks);
          break;
        case 'APPROVE':
          await onFinalApprove(application.id, decisionRemarks);
          break;
        case 'REJECT':
          await onFinalReject(application.id, decisionRemarks);
          break;
      }
      setDecisionRemarks('');
      onClose();
    } catch {
      setError('Failed to process decision. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!application) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${application.trackingNumber} - ${application.applicantName}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b pb-4" style={{ borderColor: 'var(--border-gray-200)' }}>
          {(['summary', 'documents', 'interview', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              className={`py-2 px-4 text-sm font-medium rounded transition-colors ${
                activeTab === tab
                  ? 'bg-navy-900 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Applicant Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Name</label>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {application.applicantName}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Tracking Number</label>
                  <p className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    {application.trackingNumber}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Vertical</label>
                  <Badge
                    variant={application.vertical === 'BOYS' ? 'success' : application.vertical === 'GIRLS' ? 'warning' : 'info'}
                    size="md"
                  >
                    {application.vertical}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Application Date</label>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {application.applicationDate}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Application Status</label>
                <Badge variant={getStatusVariant(application.status)} size="md" className="mt-2">
                  {STATUS_LABELS[application.status] || application.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div>
                <label className="text-sm text-gray-600">Payment Status</label>
                <Badge
                  variant={application.paymentStatus === 'PAID' ? 'success' : application.paymentStatus === 'PENDING' ? 'warning' : 'error'}
                  size="md"
                  className="mt-2"
                >
                  {application.paymentStatus}
                </Badge>
              </div>
            </div>

            {application.forwardedBy && (
              <div className="p-4 rounded border" style={{ background: 'var(--bg-page)', borderColor: 'var(--border-gray-200)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Superintendent Review
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Forwarded By:</span>
                    <span className="font-medium">{application.forwardedBy.superintendentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Forwarded On:</span>
                    <span className="font-medium">{application.forwardedBy.forwardedOn}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Recommendation:</span>
                    <Badge
                      variant={
                        application.forwardedBy.recommendation === 'RECOMMEND'
                          ? 'success'
                          : application.forwardedBy.recommendation === 'NOT_RECOMMEND'
                          ? 'error'
                          : 'info'
                      }
                      size="sm"
                    >
                      {application.forwardedBy.recommendation}
                    </Badge>
                  </div>
                  {application.forwardedBy.remarks && (
                    <div>
                      <span className="text-gray-600">Remarks:</span>
                      <p className="mt-1 font-medium">{application.forwardedBy.remarks}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {application.flags && application.flags.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Flags</h4>
                <div className="flex gap-2">
                  {application.flags.map((flag, index) => (
                    <Chip key={index} variant="warning" size="sm">
                      {flag}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons - status-driven */}
            {(application.status === 'TRUSTEE_REVIEW' || application.status === 'TRUSTEE_FINAL_REVIEW') && (
              <div className="pt-4 border-t space-y-3" style={{ borderColor: 'var(--border-gray-200)' }}>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Remarks <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    placeholder="Enter your remarks for this decision..."
                    className="w-full rounded border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[80px]"
                    style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                  />
                </div>
                {error && (
                  <div className="p-3 rounded border-l-4 bg-red-50 border-red-500">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {application.status === 'TRUSTEE_REVIEW' ? (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => handleDecision('SHORTLIST')}
                        loading={isProcessing}
                      >
                        Shortlist
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleDecision('REJECT')}
                        loading={isProcessing}
                      >
                        Reject
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => handleDecision('APPROVE')}
                        loading={isProcessing}
                      >
                        Override &amp; Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleDecision('REJECT')}
                        loading={isProcessing}
                      >
                        Confirm Reject
                      </Button>
                    </>
                  )}
                </div>
                {application.status === 'TRUSTEE_REVIEW' && (
                  <div className="p-3 rounded border-l-4 bg-blue-50 border-blue-500">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> Shortlisting sends the application back to the Superintendent to schedule the interview.
                    </p>
                  </div>
                )}
                {application.status === 'TRUSTEE_FINAL_REVIEW' && (
                  <div className="p-3 rounded border-l-4 bg-yellow-50 border-yellow-500">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> Superintendent rejected this candidate after interview. Override to approve and create a student account, or confirm the rejection.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
              <Button variant="secondary" onClick={() => {
                const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
                if (!token) {
                  alert('Please login again');
                  return;
                }
                window.open(`/api/applications/${application.id}/pdf?token=${encodeURIComponent(token)}`, '_blank');
              }}>
                Download PDF
              </Button>
              {onSendMessage && (
                <Button variant="secondary" onClick={() => onSendMessage(application.id)}>
                  Send Message
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Uploaded Documents
            </h3>
            {docsLoading ? (
              <p className="text-sm text-gray-500 py-4 text-center">Loading documents...</p>
            ) : documents.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {documents.map((doc: any, index: number) => {
                  const typeLabels: Record<string, string> = {
                    'PHOTOGRAPH': 'Passport Photo',
                    'BIRTH_CERTIFICATE': 'Birth Certificate',
                    'EDUCATION_CERTIFICATE': 'Academic Document',
                    'AADHAAR_CARD': 'Aadhaar Card',
                    'INCOME_CERTIFICATE': 'Income Certificate',
                    'OTHER': 'Other Document',
                    'photoFile': 'Passport Photo',
                    'birthCertificate': 'Birth Certificate',
                    'marksheet': 'Academic Marksheet',
                  };
                  const label = typeLabels[doc.documentType || doc.type] || doc.documentType || doc.type || 'Document';
                  const fileName = doc.originalFileName || doc.file_name || 'Unknown';
                  const fileExt = fileName.split('.').pop()?.toUpperCase() || 'PDF';

                  return (
                    <div
                      key={index}
                      className="p-3 rounded border cursor-pointer hover:shadow-md transition-shadow"
                      style={{ borderColor: 'var(--border-gray-200)', background: 'var(--bg-page)' }}
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem('authToken');
                          const res = await fetch(`/api/applications/documents/url?path=${encodeURIComponent(doc.storagePath || doc.file_path)}`, {
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                          });
                          const data = await res.json();
                          if (data.url) window.open(data.url, '_blank');
                          else alert('Failed to open document');
                        } catch {
                          alert('Failed to open document');
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-blue-600 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{label}</p>
                          <p className="text-xs text-gray-500">{fileExt} • {fileName}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 border rounded" style={{ borderColor: 'var(--border-gray-200)' }}>
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No documents uploaded for this application</p>
              </div>
            )}
          </div>
        )}

        {/* Interview Tab */}
        {activeTab === 'interview' && (
          <div className="space-y-6">
            {application.interview ? (
              <>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Interview Details
                </h3>
                <div className="p-4 rounded border" style={{ background: 'var(--bg-page)', borderColor: 'var(--border-gray-200)' }}>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Scheduled For:</span>
                      <span className="font-medium">
                        {application.interview.scheduledDate} at {application.interview.scheduledTime}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mode:</span>
                      <Badge variant={application.interview.mode === 'ONLINE' ? 'info' : 'success'} size="sm">
                        {application.interview.mode}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <Badge
                        variant={
                          application.interview.status === 'COMPLETED'
                            ? 'success'
                            : application.interview.status === 'SCHEDULED'
                            ? 'warning'
                            : 'default'
                        }
                        size="sm"
                      >
                        {application.interview.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    {application.interview.score && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Score:</span>
                        <span className="font-medium">{application.interview.score}/20</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">Interviews are scheduled and conducted by the Superintendent after shortlisting.</p>
              </div>
            )}
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Audit Trail
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Application ID: {application.id} | Current Status: {application.status.replace(/_/g, ' ')}
            </p>

            <div className="space-y-3">
              {[
                {
                  date: 'Loading...',
                  event: 'Application history will be loaded from API',
                  user: 'System',
                  details: 'Audit trail data',
                },
              ].map((entry, index) => (
                <div
                  key={index}
                  className="p-3 rounded border"
                  style={{ background: 'var(--bg-page)', borderColor: 'var(--border-gray-200)' }}
                >
                  <div className="text-xs text-gray-500 mb-1">{entry.date}</div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {entry.event}
                  </div>
                  <div className="text-sm text-gray-600">By: {entry.user}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
