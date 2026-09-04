'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/forms/Input';
import { DatePicker } from '@/components/forms/DatePicker';
import { TimePicker } from '@/components/forms/TimePicker';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/shadcn/button-extended';
import { Badge } from '@/components/shadcn/badge-extended';
import { useLanguage } from '@/contexts/LanguageContext';

type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

interface LeaveType {
  id: string;
  name: string;
  code: string;
  maxDays: number | null;
  requiresApproval: boolean;
  active: boolean;
}

interface LeaveRequest {
  id: string;
  leaveTypeLabel: string;
  leaveTypeOriginal: string;
  fromDate: string;
  toDate: string;
  fromTime?: string;
  toTime?: string;
  reason: string;
  destination?: string;
  contactNumber?: string;
  status: LeaveStatus;
  appliedDate: string;
  remarks?: string;
}

// Leave types that need time selection
const TIME_BASED_CODES = ['SHORT_LEAVE', 'NIGHT_OUT'];

// Only these leave types are offered to students.
const ALLOWED_LEAVE_CODES = ['NIGHT_OUT', 'MULTI_DAY'];

// Icons per leave type code
const LEAVE_ICONS: Record<string, string> = {
  SHORT_LEAVE: '📋',
  NIGHT_OUT: '🌙',
  MULTI_DAY: '📅',
  HOME_VISIT: '🏠',
  MEDICAL: '🏥',
  EMERGENCY: '🚨',
  EXTENDED: '📆',
};

export default function LeaveManagementPage() {
  const { t } = useLanguage();
  const [studentId, setStudentId] = useState<string | null>(null);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);

  const [selectedType, setSelectedType] = useState<LeaveType | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [leaveHistory, setLeaveHistory] = useState<LeaveRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [formData, setFormData] = useState({
    fromDate: '',
    toDate: '',
    fromTime: '',
    toTime: '',
    reason: '',
    destination: '',
    contactNumber: '',
  });

  const [formErrors, setFormErrors] = useState({
    fromDate: '',
    toDate: '',
    reason: '',
    destination: '',
  });

  // Fetch student ID from localStorage
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('authToken');
    if (userId) {
      setStudentId(userId);
    } else if (token?.includes('.')) {
      try {
        const payload = token.split('.')[1];
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const data = JSON.parse(atob(base64));
        setStudentId(data.sub);
      } catch {}
    }
  }, []);

  // Fetch leave types from API
  useEffect(() => {
    const fetchLeaveTypes = async () => {
      try {
        setTypesLoading(true);
        const token = localStorage.getItem('authToken');
        const res = await fetch('/api/config/leave-types?active=true', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const result = await res.json();
          const data: LeaveType[] = Array.isArray(result.data) ? result.data : [];
          setLeaveTypes(data.filter((lt) => ALLOWED_LEAVE_CODES.includes(lt.code)));
        }
      } catch {}
      finally {
        setTypesLoading(false);
      }
    };
    fetchLeaveTypes();
  }, []);

  // Fetch leave history when studentId is available
  useEffect(() => {
    if (studentId) fetchLeaveHistory();
  }, [studentId]);

  const fetchLeaveHistory = async () => {
    if (!studentId) return;
    try {
      setHistoryLoading(true);
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/leaves?student_id=${studentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const result = await res.json();
        const data = Array.isArray(result.data) ? result.data : [];
        setLeaveHistory(data);
      }
    } catch {}
    finally {
      setHistoryLoading(false);
    }
  };

  const handleTypeSelect = (type: LeaveType) => {
    setSelectedType(type);
    setShowForm(true);
    setFormData({ fromDate: '', toDate: '', fromTime: '', toTime: '', reason: '', destination: '', contactNumber: '' });
    setFormErrors({ fromDate: '', toDate: '', reason: '', destination: '' });
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateForm = () => {
    const errors = { fromDate: '', toDate: '', reason: '', destination: '' };
    if (!formData.fromDate) errors.fromDate = 'From date is required';
    if (!formData.toDate) errors.toDate = 'To date is required';
    if (formData.fromDate && formData.toDate && new Date(formData.fromDate) > new Date(formData.toDate))
      errors.toDate = 'To date must be after from date';
    if (!formData.reason.trim()) errors.reason = 'Reason is required';
    if (formData.reason.trim().length < 10) errors.reason = 'Reason must be at least 10 characters';
    if (!formData.destination?.trim()) errors.destination = 'Destination is required';
    setFormErrors(errors);
    return Object.values(errors).every(e => e === '');
  };

  const handleSubmit = async () => {
    if (!studentId) { alert('Unable to identify student. Please login again.'); return; }
    if (!selectedType) return;
    if (!validateForm()) return;

    try {
      const token = localStorage.getItem('authToken');
      const fromDateTime = TIME_BASED_CODES.includes(selectedType.code)
        ? `${formData.fromDate}T${formData.fromTime || '09:00'}:00`
        : `${formData.fromDate}T00:00:00`;
      const toDateTime = TIME_BASED_CODES.includes(selectedType.code)
        ? `${formData.toDate}T${formData.toTime || '18:00'}:00`
        : `${formData.toDate}T23:59:00`;

      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          student_id: studentId,
          type: selectedType.code,
          start_time: fromDateTime,
          end_time: toDateTime,
          reason: formData.reason,
          destination: formData.destination || undefined,
          contact_number: formData.contactNumber || undefined,
        }),
      });

      if (res.ok) {
        alert('Leave request submitted successfully!');
        setShowForm(false);
        setSelectedType(null);
        fetchLeaveHistory();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Failed to submit: ' + (err.error || err.message || `Error ${res.status}`));
      }
    } catch {
      alert('Failed to submit leave request');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setSelectedType(null);
    setFormData({ fromDate: '', toDate: '', fromTime: '', toTime: '', reason: '', destination: '', contactNumber: '' });
  };

  const getStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'PENDING': return <Badge variant="warning">{t('Pending', 'लंबित')}</Badge>;
      case 'APPROVED': return <Badge variant="success">{t('Approved', 'स्वीकृत')}</Badge>;
      case 'REJECTED': return <Badge variant="error">{t('Rejected', 'अस्वीकृत')}</Badge>;
      case 'CANCELLED': return <Badge variant="default">{t('Cancelled', 'रद्द')}</Badge>;
      default: return <Badge variant="default">{status}</Badge>;
    }
  };

  const isTimeBased = selectedType ? TIME_BASED_CODES.includes(selectedType.code) : false;

  return (
    <div style={{ background: 'var(--bg-page)' }} className="min-h-screen">
      <div className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 style={{ color: 'var(--text-primary)' }} className="text-3xl font-bold mb-2">
              {t('Leave Management', 'अवकाश प्रबंधन')}
            </h1>
            <p style={{ color: 'var(--text-secondary)' }} className="text-body">
              {t('Request leave, view history, and check approval status', 'अवकाश का अनुरोध करें, इतिहास देखें, और अनुमोदन स्थिति जांचें')}
            </p>
          </div>

          {/* Leave type selection */}
          {!showForm && (
            <div className="space-y-6">
              <h2 style={{ color: 'var(--text-primary)' }} className="text-2xl font-semibold mb-4">
                {t('Select Leave Type', 'अवकाश प्रकार चुनें')}
              </h2>

              {typesLoading ? (
                <p style={{ color: 'var(--text-secondary)' }} className="text-sm">{t('Loading leave types...', 'अवकाश प्रकार लोड हो रहे हैं...')}</p>
              ) : leaveTypes.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }} className="text-sm">{t('No leave types configured.', 'कोई अवकाश प्रकार कॉन्फ़िगर नहीं किए गए।')}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
                  {leaveTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleTypeSelect(type)}
                      className="card p-5 text-left transition-all hover:shadow-lg"
                      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius-lg)' }}
                    >
                      <div className="text-3xl mb-2">{LEAVE_ICONS[type.code] || '📄'}</div>
                      <h3 style={{ color: 'var(--text-primary)' }} className="text-base font-semibold mb-1">{type.name}</h3>
                      <p style={{ color: 'var(--text-secondary)' }} className="text-xs">
                        {type.requiresApproval ? t('Requires approval', 'अनुमोदन आवश्यक') : t('No prior approval needed', 'पूर्व अनुमोदन आवश्यक नहीं')}
                      </p>
                      {type.maxDays != null && (
                        <p style={{ color: 'var(--color-blue-600)' }} className="text-xs font-medium mt-1">
                          {t(`Max ${type.maxDays} days`, `अधिकतम ${type.maxDays} दिन`)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Leave application form */}
          {showForm && selectedType && (
            <div className="mb-6">
              <button
                onClick={handleCancel}
                className="text-sm mb-4"
                style={{ color: 'var(--text-link)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {t('← Back to Leave Types', '← अवकाश प्रकारों पर वापस जाएं')}
              </button>

              <h2 style={{ color: 'var(--text-primary)' }} className="text-2xl font-bold mb-1">
                {selectedType.name} {t('Application', 'आवेदन')}
              </h2>
              {selectedType.maxDays != null && (
                <p style={{ color: 'var(--text-secondary)' }} className="text-sm mb-4">
                  {t(`Maximum ${selectedType.maxDays} days allowed`, `अधिकतम ${selectedType.maxDays} दिन की अनुमति`)}
                </p>
              )}

              <div className="card p-6 rounded-lg" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-primary)' }}>
                {/* Date row */}
                <div className="grid gap-6 md:grid-cols-2 mb-6">
                  <DatePicker
                    label={t('From Date', 'तारीख से')}
                    value={formData.fromDate}
                    onChange={(e) => handleInputChange('fromDate', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    error={formErrors.fromDate}
                    required
                  />
                  <DatePicker
                    label={t('To Date', 'तारीख तक')}
                    value={formData.toDate}
                    onChange={(e) => handleInputChange('toDate', e.target.value)}
                    min={formData.fromDate || new Date().toISOString().split('T')[0]}
                    error={formErrors.toDate}
                    required
                  />
                </div>

                {/* Time row — shown for all leave types */}
                <div className="grid gap-6 md:grid-cols-2 mb-6">
                  <TimePicker
                    label={t('Departure Time', 'प्रस्थान समय')}
                    value={formData.fromTime}
                    onChange={(e) => handleInputChange('fromTime', e.target.value)}
                    helperText={isTimeBased ? t('Time you will leave the hostel', 'हॉस्टल छोड़ने का समय') : t('Optional', 'वैकल्पिक')}
                  />
                  <TimePicker
                    label={t('Return Time', 'वापसी समय')}
                    value={formData.toTime}
                    onChange={(e) => handleInputChange('toTime', e.target.value)}
                    helperText={isTimeBased ? t('Expected return time', 'अपेक्षित वापसी समय') : t('Optional', 'वैकल्पिक')}
                  />
                </div>

                {/* Destination — always required */}
                <div className="mb-6">
                  <Input
                    type="text"
                    label={t('Destination', 'गंतव्य')}
                    placeholder={t('City or place you will be visiting', 'आप जिस शहर या स्थान पर जाएंगे')}
                    value={formData.destination}
                    onChange={(e) => handleInputChange('destination', e.target.value)}
                    error={formErrors.destination}
                    required
                  />
                </div>

                <div className="mb-6">
                  <Textarea
                    label={t('Reason for Leave', 'अवकाश का कारण')}
                    placeholder={t('Please provide a detailed reason for your leave request', 'कृपया अपने अवकाश अनुरोध का विस्तृत कारण बताएं')}
                    value={formData.reason}
                    onChange={(e) => handleInputChange('reason', e.target.value)}
                    error={formErrors.reason}
                    helperText={t('Minimum 10 characters required', 'न्यूनतम 10 अक्षर आवश्यक')}
                    required
                    rows={4}
                  />
                </div>

                <div className="mb-6">
                  <Input
                    type="tel"
                    label={t('Emergency Contact Number (Optional)', 'आपातकालीन संपर्क नंबर (वैकल्पिक)')}
                    placeholder="+91 XXXXX XXXXX"
                    value={formData.contactNumber}
                    onChange={(e) => handleInputChange('contactNumber', e.target.value)}
                  />
                </div>

                <div className="flex gap-4 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                  <Button variant="secondary" onClick={handleCancel}>{t('Cancel', 'रद्द करें')}</Button>
                  <Button variant="primary" onClick={handleSubmit}>{t('Submit Leave Request', 'अवकाश अनुरोध जमा करें')}</Button>
                </div>
              </div>
            </div>
          )}

          {/* Leave history — shown when not in form mode */}
          {!showForm && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 style={{ color: 'var(--text-primary)' }} className="text-2xl font-semibold">
                  {t('Leave History', 'अवकाश इतिहास')}
                </h2>
                <Button variant="ghost" size="sm" onClick={fetchLeaveHistory} disabled={historyLoading}>
                  {historyLoading ? t('Loading...', 'लोड हो रहा है...') : t('Refresh', 'रिफ्रेश')}
                </Button>
              </div>

              <div className="card" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-primary)' }}>
                <div className="overflow-x-auto">
                  {historyLoading ? (
                    <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>{t('Loading...', 'लोड हो रहा है...')}</div>
                  ) : leaveHistory.length === 0 ? (
                    <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                      {t('No leave requests found.', 'कोई अवकाश अनुरोध नहीं मिला।')}
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                          <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-primary)' }}>{t('Type', 'प्रकार')}</th>
                          <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-primary)' }}>{t('Dates', 'तारीखें')}</th>
                          <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-primary)' }}>{t('Reason', 'कारण')}</th>
                          <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-primary)' }}>{t('Status', 'स्थिति')}</th>
                          <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--text-primary)' }}>{t('Remarks', 'टिप्पणियां')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaveHistory.map((leave) => (
                          <tr key={leave.id} className="border-b hover:bg-gray-50" style={{ borderColor: 'var(--border-primary)' }}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span>{LEAVE_ICONS[leave.leaveTypeOriginal] || '📄'}</span>
                                <span style={{ color: 'var(--text-primary)' }}>{leave.leaveTypeLabel || leave.leaveTypeOriginal}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                              {leave.fromDate} → {leave.toDate}
                              {leave.fromTime && (
                                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  {leave.fromTime} – {leave.toTime}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                              {leave.reason}
                              {leave.destination && (
                                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>to {leave.destination}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">{getStatusBadge(leave.status)}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{leave.remarks || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
