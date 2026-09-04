'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '@/contexts/LanguageContext';

interface Application {
  id: string;
  tracking_number: string;
  type: string;
  applicant_mobile: string;
  current_status: string;
  vertical: string;
  data: any;
  submitted_at: string;
  created_at: string;
}

interface Document {
  id: string;
  document_type: string;
  verification_status: string;
  uploaded_at: string;
}

interface Interview {
  id: string;
  schedule_time: string;
  mode: string;
  status: string;
  internal_remarks?: string;
}

const statusConfig: Record<string, { label: string; color: string; description: string }> = {
  DRAFT: { label: 'Draft', color: 'gray', description: 'Application is being prepared' },
  SUBMITTED: { label: 'Submitted', color: 'blue', description: 'Application submitted and under initial review' },
  REVIEW: { label: 'Under Review', color: 'yellow', description: 'Application is being reviewed by the superintendent' },
  TRUSTEE_REVIEW: { label: 'Trustee Review', color: 'yellow', description: 'Application is under review by the trustee committee' },
  SHORTLISTED: { label: 'Shortlisted', color: 'blue', description: 'Trustee shortlisted you — awaiting interview scheduling' },
  INTERVIEW: { label: 'Interview Scheduled', color: 'blue', description: 'An interview has been scheduled for your application' },
  TRUSTEE_FINAL_REVIEW: { label: 'Trustee Final Review', color: 'yellow', description: 'Awaiting trustee final decision' },
  WAITLIST: { label: 'Waitlisted', color: 'amber', description: 'Approved by trustee — currently on the waitlist; you will be admitted as soon as a room becomes available' },
  APPROVED: { label: 'Approved', color: 'green', description: 'Application approved — student account created' },
  REJECTED: { label: 'Rejected', color: 'red', description: 'Application has been rejected' },
  WITHDRAWN: { label: 'Withdrawn', color: 'gray', description: 'Application has been withdrawn by applicant' },
  ARCHIVED: { label: 'Archived', color: 'gray', description: 'Application has been archived' },
};

const statusSteps = [
  { status: 'DRAFT', label: 'Draft', order: 1 },
  { status: 'SUBMITTED', label: 'Submitted', order: 2 },
  { status: 'REVIEW', label: 'Under Review', order: 3 },
  { status: 'TRUSTEE_REVIEW', label: 'Trustee Review', order: 4 },
  { status: 'SHORTLISTED', label: 'Shortlisted', order: 5 },
  { status: 'INTERVIEW', label: 'Interview', order: 6 },
  { status: 'TRUSTEE_FINAL_REVIEW', label: 'Final Review', order: 7 },
  { status: 'APPROVED', label: 'Approved', order: 8 },
];

// Helper function to get the order of current status in the application flow
function getCurrentStepOrder(status: string): number {
  const statusOrder: { [key: string]: number } = {
    'DRAFT': 1,
    'SUBMITTED': 2,
    'REVIEW': 3,
    'TRUSTEE_REVIEW': 4,
    'SHORTLISTED': 5,
    'INTERVIEW': 6,
    'TRUSTEE_FINAL_REVIEW': 7,
    'APPROVED': 8,
    'REJECTED': 8,
    'WITHDRAWN': 0,
    'ARCHIVED': 0,
  };
  return statusOrder[status] || 0;
}

// Helper function to map color names to Tailwind classes
function getStatusColor(color: string | undefined): string {
  const colorMap: { [key: string]: string } = {
    'gray': 'bg-gray-100 text-gray-700',
    'blue': 'bg-blue-100 text-blue-700',
    'yellow': 'bg-yellow-100 text-yellow-700',
    'amber': 'bg-amber-100 text-amber-800',
    'green': 'bg-green-100 text-green-700',
    'red': 'bg-red-100 text-red-700'
  };
  return colorMap[color || 'gray'] || colorMap.gray;
}

export default function TrackingDetailPage() {
  const { t } = useLanguage();
  // Status label translations
  const statusLabels: Record<string, string> = {
    'Draft': 'प्रारूप', 'Submitted': 'जमा किया गया', 'Under Review': 'समीक्षाधीन',
    'Approved': 'स्वीकृत', 'Rejected': 'अस्वीकृत', 'Withdrawn': 'वापस लिया गया',
  };
  const statusDescriptions: Record<string, string> = {
    'Application is being prepared': 'आवेदन तैयार किया जा रहा है',
    'Application submitted and under initial review': 'आवेदन जमा किया गया और प्रारंभिक समीक्षाधीन',
    'Application is being reviewed by superintendent': 'अधीक्षक द्वारा आवेदन की समीक्षा की जा रही है',
    'Application approved, awaiting final processing': 'आवेदन स्वीकृत, अंतिम प्रक्रिया की प्रतीक्षा',
    'Application has been rejected': 'आवेदन अस्वीकृत किया गया है',
    'Application has been withdrawn by applicant': 'आवेदक द्वारा आवेदन वापस लिया गया',
  };
  const tStatus = (label: string) => t(label, statusLabels[label] || label);
  const tDesc = (desc: string) => t(desc, statusDescriptions[desc] || desc);
  const params = useParams();
  const trackingId = params.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReuploadModal, setShowReuploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [uploading, setUploading] = useState(false);
  const [timeUntilInterview, setTimeUntilInterview] = useState<{ days: number; hours: number; minutes: number } | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Handle application withdrawal
  const handleWithdraw = async () => {
    if (!application) return;

    setWithdrawing(true);
    try {
      const response = await fetch(`/api/applications/${application.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'WITHDRAWN',
          current_status: 'WITHDRAWN'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to withdraw application');
      }

      // Update local state
      setApplication(prev => prev ? { ...prev, current_status: 'WITHDRAWN' } : null);
      setShowWithdrawModal(false);
      alert('Application withdrawn successfully');
    } catch (err) {
      console.error('Error withdrawing application:', err);
      alert(err instanceof Error ? err.message : 'Failed to withdraw application');
    } finally {
      setWithdrawing(false);
    }
  };

  // Fetch application data on mount
  useEffect(() => {
    async function fetchApplicationData() {
      try {
        setLoading(true);
        setError('');

        // Fetch application by tracking number (public track endpoint)
        const response = await fetch(`/api/applications/track/${trackingId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch application');
        }

        const result = await response.json();
        // Track API returns { success, data: { data: application } }
        const appData = result.data?.data || result.data;

        if (!appData) {
          throw new Error('Application not found');
        }

        // Transform data to match component structure
        const personalInfo = appData.data?.personal_info || {};
        const transformedApp: Application = {
          id: appData.id || trackingId,
          tracking_number: appData.tracking_number || appData.trackingNumber || trackingId,
          type: appData.type || 'NEW',
          applicant_mobile: appData.applicant_mobile || personalInfo.mobile || '',
          current_status: appData.current_status || appData.status || 'SUBMITTED',
          vertical: appData.vertical || 'BOYS_HOSTEL',
          data: {
            personal_info: {
              full_name: appData.applicant_name || personalInfo.full_name || '',
              email: appData.applicant_email || personalInfo.email || '',
              mobile: appData.applicant_mobile || personalInfo.mobile || '',
            }
          },
          submitted_at: appData.submitted_at || appData.created_at || new Date().toISOString(),
          created_at: appData.created_at || new Date().toISOString(),
        };

        setApplication(transformedApp);

        // Set documents if available
        if (appData.documents && Array.isArray(appData.documents)) {
          setDocuments(appData.documents);
        }

        // Set interview if available
        if (appData.interviewDetails) {
          const interviewData: Interview = {
            id: appData.interviewDetails.id || '1',
            schedule_time: appData.interviewDetails.date
              ? new Date(`${appData.interviewDetails.date} ${appData.interviewDetails.time || '00:00'}`).toISOString()
              : new Date().toISOString(),
            mode: appData.interviewDetails.mode === 'In-Person' ? 'IN_PERSON' : 'ONLINE',
            status: appData.interviewDetails.status === 'upcoming' || appData.interviewDetails.status === 'scheduled'
              ? 'SCHEDULED'
              : appData.interviewDetails.status === 'completed'
                ? 'COMPLETED'
                : 'SCHEDULED',
            internal_remarks: appData.interviewDetails.internal_remarks,
          };
          setInterview(interviewData);

          // Calculate time until interview if scheduled
          if (interviewData.status === 'SCHEDULED') {
            const now = new Date();
            const interviewTime = new Date(interviewData.schedule_time);
            const diffMs = interviewTime.getTime() - now.getTime();

            if (diffMs > 0) {
              const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
              setTimeUntilInterview({ days, hours, minutes });
            }
          }
        }
      } catch (err) {
        console.error('Error fetching application:', err);
        setError(err instanceof Error ? err.message : 'Failed to load application');
      } finally {
        setLoading(false);
      }
    }

    if (trackingId) {
      fetchApplicationData();
    }
  }, [trackingId]);

  // Get current status safely (returns default status if application is null)
  const currentStepOrder = getCurrentStepOrder(application?.current_status || '');

  const hasPendingDocuments = documents.some(d => d.verification_status === 'PENDING');
  const isAwaitingDocuments = application?.current_status === 'REVIEW' && hasPendingDocuments;

  const getStatusAlert = () => {
    if (!application) return null;

    switch (application.current_status) {
      case 'SUBMITTED':
        return (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-blue-900 mb-1">{t('Application Submitted', 'आवेदन जमा किया गया')}</h4>
                <p className="text-sm text-blue-700">
                  Your application has been received and is under initial review. We will notify you when it moves to the next stage.
                </p>
              </div>
            </div>
          </div>
        );

      case 'REVIEW':
        if (hasPendingDocuments) {
          return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-yellow-900 mb-1">Action Required: Documents Pending</h4>
                  <p className="text-sm text-yellow-700 mb-2">
                    Some of your documents need attention. Please re-upload the documents marked as pending below to continue with your application.
                  </p>
                  <button
                    className="text-sm font-medium text-yellow-800 hover:underline"
                    onClick={() => setShowReuploadModal(true)}
                  >
                    Re-upload Documents →
                  </button>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-yellow-900 mb-1">{t('Under Review', 'समीक्षाधीन')}</h4>
                <p className="text-sm text-yellow-700">
                  Your application is currently under review by the superintendent. We will update you on any further steps.
                </p>
              </div>
            </div>
          </div>
        );

      case 'APPROVED':
        return (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-green-900 mb-1">Congratulations! Application Approved</h4>
                <p className="text-sm text-green-700">
                  Your application has been approved. Please download your provisional letter and complete the admission formalities.
                </p>
              </div>
            </div>
          </div>
        );

      case 'REJECTED':
        return (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-red-900 mb-1">Application Rejected</h4>
                <p className="text-sm text-red-700">
                  Your application could not be approved. For more information, please contact our admissions team.
                </p>
              </div>
            </div>
          </div>
        );

      case 'WITHDRAWN':
        return (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Application Withdrawn</h4>
                <p className="text-sm text-gray-700">
                  You have withdrawn this application. If you wish to apply again, please submit a new application.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Show loading state while application data is being fetched
  if (loading || !application) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('Loading application details...', 'आवेदन विवरण लोड हो रहा है...')}</p>
        </div>
      </div>
    );
  }

  const currentStatus = statusConfig[application.current_status as keyof typeof statusConfig] || statusConfig.DRAFT;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Hirachand Gumanji Family Charitable Trust" width={48} height={48} className="h-12 w-auto" />
            <div>
              <h1 className="text-lg font-semibold">{t('Hirachand Gumanji Family', 'हीराचंद गुमानजी परिवार')}</h1>
              <p className="text-caption">{t('Charitable Trust', 'चैरिटेबल ट्रस्ट')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/track" className="text-sm text-blue-600 hover:underline">{t('← Back to Tracking', '← ट्रैकिंग पर वापस')}</Link>
            <Link href="/" className="text-sm text-gray-600 hover:underline">{t('Home', 'होम')}</Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Status-specific Alert Banner */}
          {getStatusAlert()}

          {/* Application Summary */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start gap-6 mb-4">
              <img
                src={`/api/applications/${application.id || application.tracking_number}/photo`}
                alt={application.data?.personal_info?.full_name || 'Applicant photo'}
                className="w-28 h-36 object-cover rounded border border-gray-200 bg-gray-100 flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
              />
              <div className="flex-1 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Application #{application.tracking_number}</h2>
                  <p className="text-gray-600">{application.vertical.replace('_', ' ')} • {application.type}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(currentStatus?.color)}`}>
                  {tStatus(currentStatus.label)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">{t('Applicant', 'आवेदक')}</p>
                <p className="font-medium">{application.data?.personal_info?.full_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('Submitted', 'जमा किया गया')}</p>
                <p className="font-medium">{new Date(application.submitted_at || application.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('Mobile', 'मोबाइल')}</p>
                <p className="font-medium">{application.applicant_mobile}</p>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <p className="mb-2"><strong>{t('Status Description:', 'स्थिति विवरण:')}</strong> {tDesc(currentStatus.description)}</p>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-xl font-semibold mb-6">{t('Application Timeline', 'आवेदन समयरेखा')}</h3>
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              {statusSteps.map((step, index) => {
                const isCompleted = step.order <= currentStepOrder;
                const isCurrent = step.order === currentStepOrder;
                const isRejected = application.current_status === 'REJECTED' && step.status === 'REJECTED';

                return (
                  <div key={step.status} className="relative flex items-center mb-6">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      isCompleted ? 'bg-blue-600 text-white' :
                      isCurrent ? 'bg-blue-100 text-blue-600 border-2 border-blue-600' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {isCompleted ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-sm font-medium">{step.order}</span>
                      )}
                    </div>
                    <div className="ml-4">
                      <h4 className="font-medium">{tStatus(step.label)}</h4>
                      {isCurrent && (
                        <p className="text-sm text-gray-600 mt-1">{tDesc(statusConfig[step.status as keyof typeof statusConfig].description)}</p>
                      )}
                      {isRejected && (
                        <p className="text-sm text-red-600 mt-1">{t('Application has been rejected', 'आवेदन अस्वीकृत किया गया है')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interview Details */}
          {interview && interview.status === 'SCHEDULED' && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold mb-4">{t('Interview Details', 'साक्षात्कार विवरण')}</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">{t('Date & Time', 'तिथि और समय')}</p>
                    <p className="font-medium">{new Date(interview.schedule_time).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{t('Mode', 'माध्यम')}</p>
                    <p className="font-medium">{interview.mode === 'IN_PERSON' ? 'In Person' : 'Online'}</p>
                  </div>
                </div>
                {timeUntilInterview && (
                  <div className="mt-4 pt-4 border-t border-blue-300">
                    <p className="text-sm text-gray-500 mb-2">{t('Time until interview', 'साक्षात्कार तक का समय')}</p>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <div className="bg-blue-600 text-white rounded-lg p-2 min-w-[60px]">
                          <span className="text-2xl font-bold">{timeUntilInterview.days}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{t('Days', 'दिन')}</p>
                      </div>
                      <div className="text-center">
                        <div className="bg-blue-600 text-white rounded-lg p-2 min-w-[60px]">
                          <span className="text-2xl font-bold">{timeUntilInterview.hours}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{t('Hours', 'घंटे')}</p>
                      </div>
                      <div className="text-center">
                        <div className="bg-blue-600 text-white rounded-lg p-2 min-w-[60px]">
                          <span className="text-2xl font-bold">{timeUntilInterview.minutes}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{t('Minutes', 'मिनट')}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-4">
                  <p className="text-sm text-gray-500">{t('Status', 'स्थिति')}</p>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {t('Scheduled', 'निर्धारित')}</span>
                </div>
              </div>
            </div>
          )}

          {interview && interview.status === 'COMPLETED' && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold mb-4">{t('Interview Details', 'साक्षात्कार विवरण')}</h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">{t('Date & Time', 'तिथि और समय')}</p>
                    <p className="font-medium">{new Date(interview.schedule_time).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{t('Mode', 'माध्यम')}</p>
                    <p className="font-medium">{interview.mode === 'IN_PERSON' ? 'In Person' : 'Online'}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-gray-500">{t('Status', 'स्थिति')}</p>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {t('Completed', 'पूर्ण')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Documents */}
          {documents.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold mb-4">{t('Documents', 'दस्तावेज़')}</h3>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">{doc.document_type.replace('_', ' ')}</p>
                        <p className="text-sm text-gray-500">Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      doc.verification_status === 'VERIFIED' ? 'bg-green-100 text-green-800' :
                      doc.verification_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {doc.verification_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold mb-4">{t('Actions', 'कार्रवाई')}</h3>
            <div className="space-y-3">
              {isAwaitingDocuments && (
                <button
                  className="w-full bg-yellow-500 text-white py-3 px-4 rounded-md hover:bg-yellow-600 font-medium border-2 border-yellow-600"
                  onClick={() => setShowReuploadModal(true)}
                >
                  📎 Re-upload Pending Documents
                </button>
              )}
              {interview && interview.status === 'SCHEDULED' && (
                <button className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
                  {t('Confirm Interview Attendance', 'साक्षात्कार उपस्थिति की पुष्टि करें')}</button>
              )}
              {application.current_status === 'APPROVED' && (
                <button className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 font-medium">
                  {t('Download Provisional Letter', 'अनंतिम पत्र डाउनलोड करें')}</button>
              )}
              <button
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
                onClick={() => window.open(`/api/applications/${trackingId}/pdf`, '_blank')}
              >
                {t('Download Application PDF', 'आवेदन पीडीएफ डाउनलोड करें')}</button>
              {application.current_status !== 'APPROVED' && application.current_status !== 'REJECTED' && application.current_status !== 'WITHDRAWN' && (
                <button
                  className="w-full border-2 border-red-500 text-red-600 py-2 px-4 rounded-md hover:bg-red-50"
                  onClick={() => setShowWithdrawModal(true)}
                >
                  {t('Withdraw Application', 'आवेदन वापस लें')}</button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Privacy Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-blue-900 mb-1">{t('Privacy & Data Protection', 'गोपनीयता और डेटा सुरक्षा')}</h4>
            <p className="text-sm text-blue-700">
              Your application data is processed in compliance with the Digital Personal Data Protection Act, 2023.
              We use your information solely for hostel admission processing and maintain strict confidentiality.
              For more details, please refer to our{' '}
              <a href="#" className="text-blue-600 underline hover:text-blue-800">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Re-upload Modal */}
      {showReuploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{t('Re-upload Documents', 'दस्तावेज़ पुनः अपलोड करें')}</h3>
                <button
                  onClick={() => setShowReuploadModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('Select Document Type', 'दस्तावेज़ प्रकार चुनें')}</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="">Choose document type...</option>
                    <option value="AADHAR_CARD">Aadhar Card</option>
                    <option value="PHOTO">Passport Size Photo</option>
                    <option value="BIRTH_CERTIFICATE">{t('Birth Certificate', 'जन्म प्रमाण पत्र')}</option>
                    <option value="CASTE_CERTIFICATE">Caste Certificate</option>
                    <option value="COLLEGE_LETTER">College Admission Letter</option>
                    <option value="ACADEMIC_RECORDS">Academic Records</option>
                    <option value="RECOMMENDATION">Jain Sangh Recommendation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('Upload File', 'फ़ाइल अपलोड करें')}</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                    <div className="text-center">
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="mt-4">
                        <label htmlFor="file-upload" className="cursor-pointer">
                          <span className="mt-2 block text-sm font-medium text-gray-900">
                            {t('Click to upload or drag and drop', 'अपलोड करने के लिए क्लिक करें या ड्रैग और ड्रॉप करें')}</span>
                          <span className="mt-1 block text-xs text-gray-500">
                            PDF, JPG, JPEG up to 10MB
                          </span>
                        </label>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpg,.jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSelectedFiles([file]);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-gray-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm text-gray-700">{selectedFiles[0].name}</span>
                      </div>
                      <button
                        onClick={() => setSelectedFiles([])}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowReuploadModal(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  {t('Cancel', 'रद्द करें')}</button>
                <button
                  onClick={async () => {
                    if (selectedFiles.length === 0) {
                      alert('Please select a file to upload');
                      return;
                    }

                    setUploading(true);
                    // Simulate upload
                    setUploadProgress({ [selectedFiles[0].name]: 0 });
                    const interval = setInterval(() => {
                      setUploadProgress(prev => {
                        const current = prev[selectedFiles[0].name] || 0;
                        if (current >= 100) {
                          clearInterval(interval);
                          setTimeout(() => {
                            setShowReuploadModal(false);
                            setSelectedFiles([]);
                            setUploadProgress({});
                            alert('Document uploaded successfully!');
                          }, 500);
                          return { [selectedFiles[0].name]: 100 };
                        }
                        return { [selectedFiles[0].name]: current + 10 };
                      });
                    }, 200);
                    setUploading(false);
                  }}
                  disabled={uploading || selectedFiles.length === 0}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>

              {Object.keys(uploadProgress).length > 0 && (
                <div className="mt-4">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress[Object.keys(uploadProgress)[0]]}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 text-center">
                    {uploadProgress[Object.keys(uploadProgress)[0]]}% uploaded
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Confirmation Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-center mb-2">{t('Withdraw Application?', 'आवेदन वापस लें?')}</h3>
              <p className="text-gray-600 text-center mb-6">
                Are you sure you want to withdraw your application <strong>{application?.tracking_number}</strong>? This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  disabled={withdrawing}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  {t('Cancel', 'रद्द करें')}</button>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {withdrawing ? 'Withdrawing...' : 'Yes, Withdraw'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}