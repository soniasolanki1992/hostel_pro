'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge, Card, Tooltip } from '@/components';
import { useLanguage } from '@/contexts/LanguageContext';

interface StudentData {
  id: string;
  name: string;
  photo: string | null;
  vertical: string;
  room: string;
  joiningDate: string;
  status: string;
  trackingNumber?: string;
}

interface FeeSummary {
  totalFees: number;
  totalPaid: number;
  outstanding: number;
  nextDueDate: string;
  status: string;
}

interface FeeItem {
  id: string;
  name: string;
  amount: number;
  status: string;
  paidDate: string | null;
  dueDate: string | null;
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  appliedDate: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  type: string;
}

interface Roommate {
  id: string;
  name: string;
  mobile: string;
}

interface RoommatesData {
  room: { roomNumber: string; vertical?: string; floor?: number; building?: string } | null;
  roommates: Roommate[];
  message?: string;
}

// Helper to format student data
const formatStudent = (student: Partial<StudentData> & Record<string, unknown>): StudentData => ({
  id: student.id || '',
  name: student.name || 'Unknown',
  photo: student.photo || null,
  vertical: student.vertical || 'N/A',
  room: student.room || 'Not Allocated',
  joiningDate: student.joiningDate
    ? new Date(student.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A',
  status: student.status || 'UNKNOWN',
  trackingNumber: student.trackingNumber,
});

export default function ParentDashboard() {
  const { t } = useLanguage();
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // All students from API (for parents with multiple children)
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  // Currently selected student index
  const [selectedStudentIndex, setSelectedStudentIndex] = useState(0);

  // Fee and leave data
  const [feeSummary, setFeeSummary] = useState<FeeSummary>({
    totalFees: 0,
    totalPaid: 0,
    outstanding: 0,
    nextDueDate: 'N/A',
    status: 'LOADING',
  });
  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [roommatesData, setRoommatesData] = useState<RoommatesData>({ room: null, roommates: [] });
  const [roommatesLoading, setRoommatesLoading] = useState(false);

  // Current student data (derived from selection)
  const studentData = allStudents[selectedStudentIndex] || {
    id: '',
    name: 'Loading...',
    photo: null,
    vertical: '-',
    room: '-',
    joiningDate: '-',
    status: 'LOADING',
  };

  useEffect(() => {
    const fetchStudentData = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        let sessionToken = urlParams.get('sessionToken');

        if (!sessionToken) {
          sessionToken = localStorage.getItem('parentSessionToken');
        }

        if (!sessionToken) {
          setError('Session expired. Please login again.');
          setLoading(false);
          return;
        }

        localStorage.setItem('parentSessionToken', sessionToken);

        if (urlParams.has('sessionToken')) {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('sessionToken');
          window.history.replaceState({}, '', newUrl.pathname);
        }

        const response = await fetch(`/api/parent/student?sessionToken=${encodeURIComponent(sessionToken)}`);
        const result = await response.json();

        if (response.ok && result.success) {
          if (result.data) {
            const students = Array.isArray(result.data) ? result.data : [result.data];
            setAllStudents(students.map(formatStudent));
            setSelectedStudentIndex(0);
          } else {
            setError(result.message || 'No student records found for this mobile number.');
          }
        } else {
          setError(result.message || 'Failed to load student data.');
        }
      } catch (err) {
        console.error('Error fetching student data:', err);
        setError('Failed to connect. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, []);

  // Fetch fee and leave data when student changes
  useEffect(() => {
    const fetchAdditionalData = async () => {
      if (allStudents.length === 0) return;

      const urlParams = new URLSearchParams(window.location.search);
      let sessionToken = urlParams.get('sessionToken') || localStorage.getItem('parentSessionToken');
      if (!sessionToken) return;

      // Get the currently selected student's ID
      const currentStudent = allStudents[selectedStudentIndex];
      if (!currentStudent) return;

      try {
        // Fetch fees for the selected student
        const feesResponse = await fetch(`/api/parent/fees?sessionToken=${encodeURIComponent(sessionToken)}&studentId=${encodeURIComponent(currentStudent.id)}`);
        const feesResult = await feesResponse.json();
        if (feesResult.success && feesResult.data) {
          if (feesResult.data.summary) {
            setFeeSummary({
              totalFees: feesResult.data.summary.totalFees ?? 0,
              totalPaid: feesResult.data.summary.totalPaid ?? 0,
              outstanding: feesResult.data.summary.outstanding ?? 0,
              nextDueDate: feesResult.data.summary.nextDueDate ?? 'N/A',
              status: feesResult.data.summary.status ?? 'PAID',
            });
          }
          setFeeItems(feesResult.data.items || []);
        }

        // Fetch leave requests for the selected student
        const leaveResponse = await fetch(`/api/parent/leave?sessionToken=${encodeURIComponent(sessionToken)}&studentId=${encodeURIComponent(currentStudent.id)}`);
        const leaveResult = await leaveResponse.json();
        if (leaveResult.success && leaveResult.data) {
          setLeaveRequests(leaveResult.data.items || []);
        }

        // Fetch roommates for the selected student
        setRoommatesLoading(true);
        try {
          const mateResponse = await fetch(`/api/parent/roommates?sessionToken=${encodeURIComponent(sessionToken)}&studentId=${encodeURIComponent(currentStudent.id)}`);
          const mateResult = await mateResponse.json();
          if (mateResponse.ok && mateResult.success && mateResult.data) {
            setRoommatesData({
              room: mateResult.data.room,
              roommates: mateResult.data.roommates || [],
              message: mateResult.message,
            });
          } else {
            setRoommatesData({ room: null, roommates: [], message: mateResult.message });
          }
        } finally {
          setRoommatesLoading(false);
        }
      } catch (err) {
        console.error('Error fetching additional data:', err);
      }
    };

    fetchAdditionalData();
  }, [allStudents, selectedStudentIndex]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
      case 'APPROVED':
      case 'CHECKED_IN':
        return <Badge variant="success" size="sm">{status.replace('_', ' ')}</Badge>;
      case 'PENDING':
        return <Badge variant="warning" size="sm">Pending</Badge>;
      case 'OVERDUE':
      case 'REJECTED':
        return <Badge variant="error" size="sm">{status}</Badge>;
      default:
        return <Badge variant="default" size="sm">{status}</Badge>;
    }
  };

  const toggleTooltip = (id: string) => {
    setActiveTooltip(activeTooltip === id ? null : id);
  };

  const notifications: Notification[] = feeItems.filter(f => f.status === 'PENDING').map(f => ({
    id: `fee-${f.id}`,
    title: 'Fee Payment Due',
    message: `${f.name} of ₹${f.amount.toLocaleString()} is due.`,
    date: f.dueDate || 'N/A',
    type: 'fee',
  }));

  return (
    <div role="main" aria-label="Parent Dashboard Content">
          {/* Loading State */}
          {loading && (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">{t('Loading student information...', 'छात्र जानकारी लोड हो रही है...')}</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-semibold text-red-900 mb-2">{t('Unable to Load Data', 'डेटा लोड करने में असमर्थ')}</h3>
              <p className="text-red-700 mb-4">{error}</p>
              <button
                onClick={() => window.location.href = '/login/parent'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                {t('Return to Login', 'लॉगिन पर वापस जाएं')}
              </button>
            </div>
          )}

          {/* Main Content - Only show when loaded and no error */}
          {!loading && !error && (
            <>
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">{t('Welcome, Parent', 'स्वागत है, अभिभावक')}</h2>
            <p className="text-gray-600">
              {t(`View ${studentData.name}'s hostel information, fees, and leave status.`, `${studentData.name} की छात्रावास जानकारी, शुल्क और अवकाश स्थिति देखें।`)}
            </p>
          </div>

          {/* DPDP Compliance Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg 
                className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-900 mb-1">{t('Data Protection & Privacy (DPDP Act, 2023)', 'डेटा संरक्षण और गोपनीयता (DPDP अधिनियम, 2023)')}</h4>
                <p className="text-sm text-blue-700 mb-2">
                  {t("This dashboard displays your ward's information in compliance with DPDP Act, 2023. All data is encrypted and access is logged for audit purposes.", "यह डैशबोर्ड DPDP अधिनियम, 2023 के अनुपालन में आपके वार्ड की जानकारी प्रदर्शित करता है। सभी डेटा एन्क्रिप्टेड है और लेखा परीक्षा उद्देश्यों के लिए एक्सेस लॉग किया जाता है।")}
                </p>
                <Link 
                  href="/dpdp-policy" 
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium underline"
                  aria-label="Read full DPDP policy document"
                >
                  {t('Read Full DPDP Policy', 'पूर्ण DPDP नीति पढ़ें')} →
                </Link>
              </div>
            </div>
          </div>

          {/* View-Only Access Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-amber-900 mb-1">{t('View-Only Access', 'केवल देखने की पहुंच')}</h4>
                <p className="text-sm text-amber-700">
                  {t("This dashboard provides read-only access to view your ward's information.", "यह डैशबोर्ड आपके वार्ड की जानकारी देखने के लिए केवल-पठन पहुंच प्रदान करता है।")}
                  <strong>{t('You cannot make changes or approve requests through this portal.', 'आप इस पोर्टल के माध्यम से बदलाव नहीं कर सकते या अनुरोध स्वीकृत नहीं कर सकते।')}</strong>
                  {t('For any changes, please contact hostel administration.', 'किसी भी बदलाव के लिए, कृपया छात्रावास प्रशासन से संपर्क करें।')}
                </p>
              </div>
            </div>
          </div>

          {/* Student Selector - Only show if parent has multiple children */}
          {allStudents.length > 1 && (
            <Card className="p-4 mb-6" role="region" aria-label="Select ward to view">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">
                    You have {allStudents.length} wards registered
                  </span>
                </div>
                <div className="flex gap-2">
                  {allStudents.map((student, index) => (
                    <button
                      key={student.id}
                      onClick={() => setSelectedStudentIndex(index)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedStudentIndex === index
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      aria-pressed={selectedStudentIndex === index}
                      aria-label={`View ${student.name}'s information`}
                    >
                      {student.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Student Overview Card */}
          <Card className="p-6 mb-6" role="region" aria-labelledby="student-overview-heading">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 id="student-overview-heading" className="text-xl font-semibold text-gray-900">
                  {t('Student Overview', 'छात्र अवलोकन')}
                </h3>
                <Tooltip 
                  content="View-only: Cannot edit student information"
                  position="top"
                >
                  <button
                    onClick={() => toggleTooltip('student-overview')}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="Information about view-only access"
                    aria-expanded={activeTooltip === 'student-overview'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
              {getStatusBadge(studentData.status)}
            </div>
            <div className="flex items-start gap-6">
              {studentData.photo ? (
                <img
                  src={studentData.photo}
                  alt={studentData.name}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">{studentData.name}</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('Vertical', 'वर्टिकल')}</p>
                    <p className="text-sm font-medium text-gray-900">{studentData.vertical}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('Room', 'कमरा')}</p>
                    <p className="text-sm font-medium text-gray-900">{studentData.room}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('Joining Date', 'प्रवेश तिथि')}</p>
                    <p className="text-sm font-medium text-gray-900">{studentData.joiningDate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('Status', 'स्थिति')}</p>
                    <div className="mt-1">{getStatusBadge(studentData.status)}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Roommates Section */}
          <Card className="p-6 mb-6" role="region" aria-labelledby="roommates-heading">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 id="roommates-heading" className="text-xl font-semibold text-gray-900">
                  {t('Roommates', 'रूममेट्स')}
                </h3>
                {roommatesData.room?.roomNumber && (
                  <span className="text-sm text-gray-500">
                    {t('Room', 'कमरा')} {roommatesData.room.roomNumber}
                    {roommatesData.room.floor != null && ` · ${t('Floor', 'मंज़िल')} ${roommatesData.room.floor}`}
                    {roommatesData.room.building && ` · ${roommatesData.room.building}`}
                  </span>
                )}
              </div>
            </div>

            {roommatesLoading ? (
              <p className="text-sm text-gray-500">{t('Loading roommates...', 'रूममेट्स लोड हो रहे हैं...')}</p>
            ) : !roommatesData.room ? (
              <p className="text-sm text-gray-500">
                {t('Room not allocated yet. Roommate information will appear once your ward is checked in.', 'अभी कमरा आवंटित नहीं हुआ है। चेक-इन के बाद रूममेट जानकारी दिखाई देगी।')}
              </p>
            ) : roommatesData.roommates.length === 0 ? (
              <p className="text-sm text-gray-500">
                {t('Currently no other roommates allocated to this room.', 'इस कमरे में फिलहाल कोई अन्य रूममेट आवंटित नहीं है।')}
              </p>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Roommates list">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Name', 'नाम')}</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Mobile', 'मोबाइल')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roommatesData.roommates.map((mate) => (
                      <tr key={mate.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <p className="text-sm font-medium text-gray-900">{mate.name}</p>
                        </td>
                        <td className="py-3 px-4">
                          <a href={`tel:${mate.mobile}`} className="text-sm text-blue-600 hover:underline">
                            {mate.mobile}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Fee Status Section */}
          <Card className="p-6 mb-6" role="region" aria-labelledby="fee-status-heading">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 id="fee-status-heading" className="text-xl font-semibold text-gray-900">
                  {t('Fee Status', 'शुल्क स्थिति')}
                </h3>
                <Tooltip content="View-only: Can view and download receipts, cannot process payments">
                  <button
                    onClick={() => toggleTooltip('fee-status')}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="Information about fee access"
                    aria-expanded={activeTooltip === 'fee-status'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
            
            <div className="grid gap-3 grid-cols-3 mb-6">
              <div className="bg-gray-50 rounded-lg p-3" role="status" aria-label={`Total fees: ₹${feeSummary.totalFees.toLocaleString()}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Total Fees', 'कुल शुल्क')}</p>
                <p className="text-base sm:text-xl font-bold text-gray-900 truncate">₹{feeSummary.totalFees.toLocaleString()}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3" role="status" aria-label={`Paid: ₹${feeSummary.totalPaid.toLocaleString()}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Paid', 'भुगतान किया')}</p>
                <p className="text-base sm:text-xl font-bold text-green-700 truncate">₹{feeSummary.totalPaid.toLocaleString()}</p>
              </div>
              <div className={feeSummary.outstanding > 0 ? "bg-amber-50 rounded-lg p-3" : "bg-green-50 rounded-lg p-3"} role="status" aria-label={`Outstanding: ₹${feeSummary.outstanding.toLocaleString()}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Outstanding', 'बकाया')}</p>
                <p className={feeSummary.outstanding > 0 ? "text-base sm:text-xl font-bold text-amber-700 truncate" : "text-base sm:text-xl font-bold text-green-700 truncate"}>
                  ₹{feeSummary.outstanding.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mb-6" role="progressbar" aria-label={`Payment progress: ${Math.round((feeSummary.totalPaid / feeSummary.totalFees) * 100)}%`}>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">{t('Payment Progress', 'भुगतान प्रगति')}</span>
                <span className="font-medium text-gray-900">
                  {Math.round((feeSummary.totalPaid / feeSummary.totalFees) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2" role="presentation">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(feeSummary.totalPaid / feeSummary.totalFees) * 100}%` }}
                  role="presentation"
                />
              </div>
            </div>

            <div className="overflow-x-auto" role="region" aria-label="Fee items list">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Fee Name', 'शुल्क नाम')}</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Amount', 'राशि')}</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Date', 'तिथि')}</th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Status', 'स्थिति')}</th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Receipt', 'रसीद')}</th>
                  </tr>
                </thead>
                <tbody>
                  {feeItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <p className="text-sm text-gray-900">₹{item.amount.toLocaleString()}</p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <p className="text-sm text-gray-600">
                          {item.status === 'PAID' ? item.paidDate : `Due: ${item.dueDate}`}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.status === 'PAID' && (
                          <button 
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                            aria-label={`Download receipt for ${item.name}`}
                          >
                            {t('Download', 'डाउनलोड')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {feeSummary.outstanding > 0 && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4" role="alert" aria-label="Outstanding payment reminder">
                <div className="flex items-start gap-3">
                  <svg 
                    className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-amber-900">
                      Next payment of <strong>₹{feeSummary.outstanding.toLocaleString()}</strong> is due on{' '}
                      <strong>{feeSummary.nextDueDate}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Leave Summary Section */}
          <Card className="p-6 mb-6" role="region" aria-labelledby="leave-summary-heading">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 id="leave-summary-heading" className="text-xl font-semibold text-gray-900">
                  {t('Leave Summary', 'अवकाश सारांश')}
                </h3>
                <Tooltip content="View-only: Can view leave history, cannot submit new requests">
                  <button
                    onClick={() => toggleTooltip('leave-summary')}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="Information about leave access"
                    aria-expanded={activeTooltip === 'leave-summary'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <div className="bg-blue-50 rounded-lg p-4" role="status" aria-label={`Upcoming leaves: ${leaveRequests.filter(l => l.status === 'PENDING').length}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Upcoming', 'आगामी')}</p>
                <p className="text-2xl font-bold text-blue-700">
                  {leaveRequests.filter(l => l.status === 'PENDING').length}
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-4" role="status" aria-label={`Approved leaves: ${leaveRequests.filter(l => l.status === 'APPROVED').length}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Approved', 'स्वीकृत')}</p>
                <p className="text-2xl font-bold text-green-700">
                  {leaveRequests.filter(l => l.status === 'APPROVED').length}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-4" role="status" aria-label={`Rejected leaves: ${leaveRequests.filter(l => l.status === 'REJECTED').length}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Rejected', 'अस्वीकृत')}</p>
                <p className="text-2xl font-bold text-red-700">
                  {leaveRequests.filter(l => l.status === 'REJECTED').length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto" role="region" aria-label="Leave requests list">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Type', 'प्रकार')}</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4 whitespace-nowrap">{t('From', 'से')}</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4 whitespace-nowrap">{t('To', 'तक')}</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Reason', 'कारण')}</th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wide py-3 px-4">{t('Status', 'स्थिति')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.map((request) => (
                    <tr key={request.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {request.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900">{request.startDate}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="text-sm text-gray-900">{request.endDate}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-900">{request.reason}</p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(request.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Notifications Center */}
          <Card className="p-6" role="region" aria-labelledby="notifications-heading">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 id="notifications-heading" className="text-xl font-semibold text-gray-900">
                  {t('Notifications', 'सूचनाएं')}
                </h3>
                <Tooltip content="View-only: Can view notifications, cannot send messages">
                  <button
                    onClick={() => toggleTooltip('notifications')}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="Information about notifications access"
                    aria-expanded={activeTooltip === 'notifications'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
            
            <div className="space-y-4" role="list" aria-label="Notification items">
              {notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className="flex gap-4 p-4 rounded-lg hover:bg-gray-50 transition-colors border-l-4"
                  style={{
                    borderColor: notification.type === 'fee' ? '#f59e0b' : notification.type === 'leave' ? '#10b981' : '#3b82f6'
                  }}
                  role="listitem"
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    notification.type === 'fee' ? 'bg-amber-100' : notification.type === 'leave' ? 'bg-green-100' : 'bg-blue-100'
                  }`}>
                    {notification.type === 'fee' && (
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {notification.type === 'leave' && (
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {notification.type === 'general' && (
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-sm font-medium text-gray-900">{notification.title}</h4>
                      <span className="text-xs text-gray-500">{notification.date}</span>
                    </div>
                    <p className="text-sm text-gray-600">{notification.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Help Section */}
          <div className="mt-8 text-center" role="complementary" aria-label="Help and contact information">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
              <p className="text-sm text-gray-600 mb-2">
                {t('Need help? Contact hostel administration', 'मदद चाहिए? छात्रावास प्रशासन से संपर्क करें')}
              </p>
              <a 
                href="tel:+912224141234" 
                className="text-lg text-blue-600 hover:underline font-medium"
                aria-label="Call hostel administration at +91 22 2414 1234"
              >
                +91 22 2414 1234
              </a>
              <div className="mt-4 text-xs text-gray-500">
                <p>Available Monday to Saturday, 9:00 AM to 6:00 PM IST</p>
                <p className="mt-1">Email: <a href="mailto:info@shgjaintrust.org" className="text-blue-600 hover:underline">info@shgjaintrust.org</a></p>
              </div>
            </div>
            
            {/* Additional Compliance Information */}
            <div className="mt-6 text-xs text-gray-500 space-y-2">
              <p><strong>Session:</strong> Read-only view access expires after 24 hours</p>
              <p><strong>Data:</strong> All data transmission encrypted per DPDP Act, 2023</p>
              <p><strong>Audit:</strong> All access logged for security and compliance</p>
            </div>
          </div>
            </>
          )}
    </div>
  );
}
