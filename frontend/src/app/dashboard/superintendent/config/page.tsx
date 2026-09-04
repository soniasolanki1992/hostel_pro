'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/forms/Input';
import { DatePicker } from '@/components/forms/DatePicker';
import { Select, type SelectOption } from '@/components/forms/Select';
import { Toggle } from '@/components/forms/Toggle';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/shadcn/button-extended';
import { Badge } from '@/components/shadcn/badge-extended';
import { Chip } from '@/components/shadcn/chip';
import { Modal } from '@/components/feedback/Modal';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/components/utils';
import { useLanguage } from '@/contexts/LanguageContext';

// Types
type Vertical = 'BOYS' | 'GIRLS' | 'DHARAMSHALA';

interface LeaveType {
  id: string;
  name: string;
  maxDaysPerMonth: number;
  maxDaysPerSemester: number;
  requiresApproval: boolean;
  allowedVerticals: Vertical[];
  active: boolean;
}

interface BlackoutDate {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  verticals: Vertical[];
  reason: string;
}

interface NotificationRule {
  id: string;
  eventType: 'LEAVE_APPLICATION' | 'LEAVE_APPROVAL' | 'LEAVE_REJECTION' | 'EMERGENCY' | 'ARRIVAL' | 'DEPARTURE';
  timing: 'IMMEDIATE' | 'BEFORE_1H' | 'BEFORE_6H' | 'BEFORE_24H' | 'DAILY';
  channels: {
    sms: boolean;
    whatsapp: boolean;
    email: boolean;
  };
  verticals: Vertical[];
  template: string;
  active: boolean;
}

// API <-> frontend shape mappers for leave types
const VERTICAL_FROM_DB: Record<string, Vertical> = {
  BOYS_HOSTEL: 'BOYS', GIRLS_ASHRAM: 'GIRLS', DHARAMSHALA: 'DHARAMSHALA',
  BOYS: 'BOYS', GIRLS: 'GIRLS',
};
const VERTICAL_TO_DB: Record<Vertical, string> = {
  BOYS: 'BOYS_HOSTEL', GIRLS: 'GIRLS_ASHRAM', DHARAMSHALA: 'DHARAMSHALA',
};

function mapLeaveTypeFromApi(lt: any): LeaveType {
  const allowedVerticals: Vertical[] = lt.vertical
    ? [VERTICAL_FROM_DB[lt.vertical] || 'BOYS']
    : ['BOYS', 'GIRLS', 'DHARAMSHALA'];
  return {
    id: lt.id,
    name: lt.name,
    maxDaysPerMonth: lt.maxDays || lt.maxDaysPerMonth || 0,
    maxDaysPerSemester: lt.maxDaysPerSemester || (lt.maxDays ? lt.maxDays * 6 : 0),
    requiresApproval: lt.requiresApproval ?? true,
    allowedVerticals,
    active: lt.active ?? true,
  };
}

// Generic single-vertical mappers (used for blackout dates and notification rules)
function verticalsToDbValue(verticals: Vertical[]): string | null {
  return verticals.length === 1 ? VERTICAL_TO_DB[verticals[0]] : null;
}

function dbValueToVerticals(vertical: string | null | undefined): Vertical[] {
  if (!vertical) return ['BOYS', 'GIRLS', 'DHARAMSHALA'];
  return [VERTICAL_FROM_DB[vertical] || 'BOYS'];
}

// Normalize any date value (Date object / ISO string / plain YYYY-MM-DD) to YYYY-MM-DD
function toYmd(value: any): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  // If it's already YYYY-MM-DD, keep as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Parse ISO / other format
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function mapBlackoutFromApi(bd: any): BlackoutDate {
  return {
    id: bd.id,
    name: bd.name || '',
    startDate: toYmd(bd.startDate || bd.start_date),
    endDate: toYmd(bd.endDate || bd.end_date),
    verticals: dbValueToVerticals(bd.vertical),
    reason: bd.reason || '',
  };
}

function mapBlackoutToApi(bd: BlackoutDate): any {
  return {
    id: bd.id,
    name: bd.name,
    startDate: bd.startDate,
    endDate: bd.endDate,
    vertical: verticalsToDbValue(bd.verticals),
    reason: bd.reason,
  };
}

function mapNotificationRuleFromApi(nr: any): NotificationRule {
  return {
    id: nr.id,
    eventType: nr.eventType || nr.event_type,
    timing: nr.timing || 'IMMEDIATE',
    channels: nr.channels || { sms: true, whatsapp: true, email: false },
    verticals: dbValueToVerticals(nr.vertical),
    template: nr.template || '',
    active: nr.active ?? nr.enabled ?? true,
  };
}

function mapNotificationRuleToApi(nr: NotificationRule): any {
  return {
    id: nr.id,
    eventType: nr.eventType,
    timing: nr.timing,
    channels: nr.channels,
    vertical: verticalsToDbValue(nr.verticals),
    template: nr.template,
    active: nr.active,
  };
}

function mapLeaveTypeToApi(lt: LeaveType): any {
  // DB has a single `vertical` column: pick one if restricted to one, otherwise null (all verticals)
  const vertical = lt.allowedVerticals.length === 1
    ? VERTICAL_TO_DB[lt.allowedVerticals[0]]
    : null;
  return {
    id: lt.id,
    name: lt.name,
    // Derive a leave_type_enum code from the name for new types; defaults to MULTI_DAY
    code: /night/i.test(lt.name) ? 'NIGHT_OUT' :
          /short/i.test(lt.name) ? 'SHORT_LEAVE' :
          /home/i.test(lt.name) ? 'HOME_VISIT' :
          /medical/i.test(lt.name) ? 'MEDICAL' :
          /emergency/i.test(lt.name) ? 'EMERGENCY' :
          /extended/i.test(lt.name) ? 'EXTENDED' : 'MULTI_DAY',
    maxDays: lt.maxDaysPerMonth,
    requiresApproval: lt.requiresApproval,
    vertical,
    active: lt.active,
  };
}

export default function SuperintendentConfig() {
  const { t } = useLanguage();
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  const [selectedTab, setSelectedTab] = useState<'leave' | 'notification'>('leave');
  const [selectedVertical] = useState<Vertical | 'ALL'>('ALL');

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([]);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);

  // Modal states
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);
  const [editingBlackoutDate, setEditingBlackoutDate] = useState<BlackoutDate | null>(null);
  const [editingNotificationRule, setEditingNotificationRule] = useState<NotificationRule | null>(null);

  // Fetch all configuration data
  const fetchConfigData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : undefined;
      const [leaveTypesRes, blackoutDatesRes, notificationRulesRes] = await Promise.all([
        fetch('/api/config/leave-types', { headers: authHeaders }),
        fetch('/api/config/blackout-dates', { headers: authHeaders }),
        fetch('/api/config/notification-rules', { headers: authHeaders }),
      ]);

      if (!leaveTypesRes.ok || !blackoutDatesRes.ok || !notificationRulesRes.ok) {
        throw new Error('Failed to fetch configuration data');
      }

      const [leaveTypesData, blackoutDatesData, notificationRulesData] = await Promise.all([
        leaveTypesRes.json(),
        blackoutDatesRes.json(),
        notificationRulesRes.json(),
      ]);

      const rawLeaveTypes = leaveTypesData.data || leaveTypesData || [];
      const mappedLeaveTypes: LeaveType[] = (Array.isArray(rawLeaveTypes) ? rawLeaveTypes : []).map(mapLeaveTypeFromApi);
      setLeaveTypes(mappedLeaveTypes);

      const rawBlackoutDates = blackoutDatesData.data || blackoutDatesData || [];
      setBlackoutDates((Array.isArray(rawBlackoutDates) ? rawBlackoutDates : []).map(mapBlackoutFromApi));

      const rawNotificationRules = notificationRulesData.data || notificationRulesData || [];
      setNotificationRules((Array.isArray(rawNotificationRules) ? rawNotificationRules : []).map(mapNotificationRuleFromApi));
    } catch (err: any) {
      console.error('Error fetching config data:', err);
      setError(err.message || 'Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigData();
  }, [fetchConfigData]);

  // Save leave type
  const saveLeaveType = async () => {
    if (!editingLeaveType) return;

    try {
      setIsSaving(true);
      const isNew = !editingLeaveType.id;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch('/api/config/leave-types', {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify(mapLeaveTypeToApi(editingLeaveType)),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save leave type');
      }

      const result = await response.json();
      const savedLeaveType = mapLeaveTypeFromApi(result.data || result);

      if (isNew) {
        setLeaveTypes([...leaveTypes, savedLeaveType]);
      } else {
        setLeaveTypes(leaveTypes.map(lt => lt.id === savedLeaveType.id ? savedLeaveType : lt));
      }

      setEditingLeaveType(null);
    } catch (err: any) {
      console.error('Error saving leave type:', err);
      alert(err.message || 'Failed to save leave type');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle leave type active status
  const toggleLeaveTypeActive = async (leaveType: LeaveType) => {
    try {
      const response = await fetch('/api/config/leave-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: leaveType.id, active: !leaveType.active }),
      });

      if (!response.ok) {
        throw new Error('Failed to update leave type');
      }

      setLeaveTypes(leaveTypes.map(lt =>
        lt.id === leaveType.id ? { ...lt, active: !lt.active } : lt
      ));
    } catch (err: any) {
      console.error('Error toggling leave type:', err);
      alert(err.message || 'Failed to update leave type');
    }
  };

  // Save blackout date
  const saveBlackoutDate = async () => {
    if (!editingBlackoutDate) return;

    try {
      setIsSaving(true);
      const isNew = !editingBlackoutDate.id;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch('/api/config/blackout-dates', {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify(mapBlackoutToApi(editingBlackoutDate)),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save blackout date');
      }

      const result = await response.json();
      const savedBlackoutDate = mapBlackoutFromApi(result.data || result);

      if (isNew) {
        setBlackoutDates([...blackoutDates, savedBlackoutDate]);
      } else {
        setBlackoutDates(blackoutDates.map(bd => bd.id === savedBlackoutDate.id ? savedBlackoutDate : bd));
      }

      setEditingBlackoutDate(null);
    } catch (err: any) {
      console.error('Error saving blackout date:', err);
      alert(err.message || 'Failed to save blackout date');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete blackout date
  const deleteBlackoutDate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this blackout period?')) return;

    try {
      const response = await fetch(`/api/config/blackout-dates?id=${id}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error('Failed to delete blackout date');
      }

      setBlackoutDates(blackoutDates.filter(bd => bd.id !== id));
    } catch (err: any) {
      console.error('Error deleting blackout date:', err);
      alert(err.message || 'Failed to delete blackout date');
    }
  };

  // Save notification rule
  const saveNotificationRule = async () => {
    if (!editingNotificationRule) return;

    try {
      setIsSaving(true);
      const isNew = !editingNotificationRule.id;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch('/api/config/notification-rules', {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify(mapNotificationRuleToApi(editingNotificationRule)),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save notification rule');
      }

      const result = await response.json();
      const savedRule = mapNotificationRuleFromApi(result.data || result);

      if (isNew) {
        setNotificationRules([...notificationRules, savedRule]);
      } else {
        setNotificationRules(notificationRules.map(nr => nr.id === savedRule.id ? savedRule : nr));
      }

      setEditingNotificationRule(null);
    } catch (err: any) {
      console.error('Error saving notification rule:', err);
      alert(err.message || 'Failed to save notification rule');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle notification rule active status
  const toggleNotificationRuleActive = async (rule: NotificationRule) => {
    try {
      const response = await fetch('/api/config/notification-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: rule.id, active: !rule.active }),
      });

      if (!response.ok) {
        throw new Error('Failed to update notification rule');
      }

      setNotificationRules(notificationRules.map(nr =>
        nr.id === rule.id ? { ...nr, active: !nr.active } : nr
      ));
    } catch (err: any) {
      console.error('Error toggling notification rule:', err);
      alert(err.message || 'Failed to update notification rule');
    }
  };

  // Event type options
  const eventTypeOptions: SelectOption[] = [
    { value: 'LEAVE_APPLICATION', label: 'Leave Application' },
    { value: 'LEAVE_APPROVAL', label: 'Leave Approval' },
    { value: 'LEAVE_REJECTION', label: 'Leave Rejection' },
    { value: 'EMERGENCY', label: 'Emergency' },
    { value: 'ARRIVAL', label: 'Arrival' },
    { value: 'DEPARTURE', label: 'Departure' }
  ];

  const timingOptions: SelectOption[] = [
    { value: 'IMMEDIATE', label: 'Immediate' },
    { value: 'BEFORE_1H', label: '1 Hour Before' },
    { value: 'BEFORE_6H', label: '6 Hours Before' },
    { value: 'BEFORE_24H', label: '24 Hours Before' },
    { value: 'DAILY', label: 'Daily Summary' }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-500">{t('Loading configuration...', 'विन्यास लोड हो रहा है...')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="secondary" onClick={fetchConfigData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Page Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Settings', 'सेटिंग्स')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('Configure leave policies, notifications, and blackout dates', 'अवकाश नीतियां, सूचनाएं, और ब्लैकआउट तिथियां कॉन्फ़िगर करें')}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'var(--bg-accent)', color: 'var(--text-on-accent)' }}>
          {selectedVertical === 'ALL' ? 'All Verticals' : selectedVertical}
        </span>
      </div>

      {/* Admissions open/close */}
      <AdmissionsStatusCard />

      {/* Tabs */}
      <nav className="mx-auto max-w-7xl border-b" style={{ borderColor: 'var(--border-gray-200)' }}>
        <div className="flex gap-8 px-6">
          <button
            className={cn(
              'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
              selectedTab === 'leave'
                ? 'border-navy-900 text-navy-900'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
            style={{
              borderColor: selectedTab === 'leave' ? 'var(--border-primary)' : 'transparent',
              color: selectedTab === 'leave' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
            onClick={() => setSelectedTab('leave')}
          >
            {t('Leave Configuration', 'अवकाश विन्यास')}
          </button>
          <button
            className={cn(
              'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
              selectedTab === 'notification'
                ? 'border-navy-900 text-navy-900'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
            style={{
              borderColor: selectedTab === 'notification' ? 'var(--border-primary)' : 'transparent',
              color: selectedTab === 'notification' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
            onClick={() => setSelectedTab('notification')}
          >
            {t('Parent Notification Rules', 'अभिभावक सूचना नियम')}
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {selectedTab === 'leave' && (
          <div className="space-y-8">
            {/* Leave Types Configuration */}
            <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('Leave Types', 'अवकाश प्रकार')}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('Configure different types of leaves with approval rules and duration limits', 'अनुमोदन नियमों और अवधि सीमाओं के साथ विभिन्न प्रकार के अवकाश कॉन्फ़िगर करें')}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setEditingLeaveType({
                    id: '',
                    name: '',
                    maxDaysPerMonth: 0,
                    maxDaysPerSemester: 0,
                    requiresApproval: false,
                    allowedVerticals: ['BOYS', 'GIRLS', 'DHARAMSHALA'],
                    active: true
                  })}
                >
                  {t('Add Leave Type', 'अवकाश प्रकार जोड़ें')}
                </Button>
              </div>

              <div className="grid gap-4">
                {leaveTypes.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No leave types configured yet.</p>
                ) : (
                  leaveTypes.map((leaveType) => (
                    <div
                      key={leaveType.id}
                      className="p-4 rounded border"
                      style={{
                        borderColor: 'var(--border-gray-200)',
                        background: 'var(--bg-page)',
                        opacity: leaveType.active ? 1 : 0.5
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {leaveType.name}
                            </h3>
                            {!leaveType.active && (
                              <Badge variant="warning" size="sm">Inactive</Badge>
                            )}
                            {leaveType.requiresApproval && (
                              <Badge variant="info" size="sm">Requires Approval</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <label className="text-gray-600">Max Days/Month</label>
                              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {leaveType.maxDaysPerMonth}
                              </p>
                            </div>
                            <div>
                              <label className="text-gray-600">Max Days/Semester</label>
                              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {leaveType.maxDaysPerSemester}
                              </p>
                            </div>
                            <div>
                              <label className="text-gray-600">Approval Required</label>
                              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {leaveType.requiresApproval ? 'Yes' : 'No'}
                              </p>
                            </div>
                            <div>
                              <label className="text-gray-600">Allowed Verticals</label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {leaveType.allowedVerticals.map((v) => (
                                  <Chip
                                    key={v}
                                    variant="default"
                                    size="sm"
                                  >
                                    {v}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingLeaveType(leaveType)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => toggleLeaveTypeActive(leaveType)}
                          >
                            {leaveType.active ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Blackout Dates Configuration */}
            <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('Blackout Dates', 'ब्लैकआउट तिथियां')}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('Periods when leaves are not allowed (e.g., exam periods, festivals)', 'वे अवधि जब अवकाश की अनुमति नहीं है (जैसे, परीक्षा अवधि, त्योहार)')}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setEditingBlackoutDate({
                    id: '',
                    name: '',
                    startDate: '',
                    endDate: '',
                    verticals: ['BOYS', 'GIRLS', 'DHARAMSHALA'],
                    reason: ''
                  })}
                >
                  {t('Add Blackout Period', 'ब्लैकआउट अवधि जोड़ें')}
                </Button>
              </div>

              <div className="grid gap-4">
                {blackoutDates.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No blackout dates configured yet.</p>
                ) : (
                  blackoutDates.map((blackoutDate) => (
                    <div
                      key={blackoutDate.id}
                      className="p-4 rounded border"
                      style={{
                        borderColor: 'var(--border-gray-200)',
                        background: 'var(--bg-page)'
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                            {blackoutDate.name}
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <label className="text-gray-600">Start Date</label>
                              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {blackoutDate.startDate
                                  ? new Date(blackoutDate.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                  : '-'}
                              </p>
                            </div>
                            <div>
                              <label className="text-gray-600">End Date</label>
                              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {blackoutDate.endDate
                                  ? new Date(blackoutDate.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                  : '-'}
                              </p>
                            </div>
                            <div>
                              <label className="text-gray-600">Applies To</label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {blackoutDate.verticals.map((v) => (
                                  <Chip
                                    key={v}
                                    variant="default"
                                    size="sm"
                                  >
                                    {v}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-gray-600">Reason</label>
                              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {blackoutDate.reason}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingBlackoutDate(blackoutDate)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteBlackoutDate(blackoutDate.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'notification' && (
          <div className="space-y-8">
            {/* Notification Rules Configuration */}
            <div className="p-6 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Parent Notification Rules
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Configure when and how parents are notified about student activities
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setEditingNotificationRule({
                    id: '',
                    eventType: 'LEAVE_APPLICATION',
                    timing: 'IMMEDIATE',
                    channels: { sms: true, whatsapp: true, email: false },
                    verticals: ['BOYS', 'GIRLS', 'DHARAMSHALA'],
                    template: '',
                    active: true
                  })}
                >
                  Add Notification Rule
                </Button>
              </div>

              <div className="grid gap-4">
                {notificationRules.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No notification rules configured yet.</p>
                ) : (
                  notificationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-4 rounded border"
                      style={{
                        borderColor: 'var(--border-gray-200)',
                        background: 'var(--bg-page)',
                        opacity: rule.active ? 1 : 0.5
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {eventTypeOptions.find(opt => opt.value === rule.eventType)?.label || rule.eventType}
                            </h3>
                            {!rule.active && (
                              <Badge variant="warning" size="sm">Inactive</Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                            <div>
                              <label className="text-gray-600">Timing</label>
                              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {timingOptions.find(opt => opt.value === rule.timing)?.label || rule.timing}
                              </p>
                            </div>
                            <div>
                              <label className="text-gray-600">Channels</label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {rule.channels.sms && <Chip variant="success" size="sm">SMS</Chip>}
                                {rule.channels.whatsapp && <Chip variant="success" size="sm">WhatsApp</Chip>}
                                {rule.channels.email && <Chip variant="success" size="sm">Email</Chip>}
                              </div>
                            </div>
                            <div>
                              <label className="text-gray-600">Applies To</label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {rule.verticals.map((v) => (
                                  <Chip
                                    key={v}
                                    variant="default"
                                    size="sm"
                                  >
                                    {v}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-gray-600">Status</label>
                              <Badge
                                variant={rule.active ? 'success' : 'warning'}
                                size="sm"
                                className="mt-1"
                              >
                                {rule.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm text-gray-600">Message Template</label>
                            <div className="p-3 rounded mt-1 text-sm font-mono" style={{
                              background: 'var(--bg-page)',
                              color: 'var(--text-primary)'
                            }}>
                              {rule.template}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingNotificationRule(rule)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => toggleNotificationRuleActive(rule)}
                          >
                            {rule.active ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Leave Type Modal */}
      <Modal
        isOpen={editingLeaveType !== null}
        onClose={() => setEditingLeaveType(null)}
        title={editingLeaveType?.id ? 'Edit Leave Type' : 'Add Leave Type'}
        size="lg"
        variant="confirmation"
        onConfirm={saveLeaveType}
        confirmText={isSaving ? 'Saving...' : 'Save'}
      >
        {editingLeaveType && (
          <div className="space-y-4">
            <Input
              label="Leave Type Name"
              value={editingLeaveType.name}
              onChange={(e) => setEditingLeaveType({ ...editingLeaveType, name: e.target.value })}
              placeholder="e.g., Sick Leave"
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                type="number"
                label="Max Days Per Month"
                value={String(editingLeaveType.maxDaysPerMonth)}
                onChange={(e) => setEditingLeaveType({ ...editingLeaveType, maxDaysPerMonth: Number(e.target.value) })}
                required
              />
              <Input
                type="number"
                label="Max Days Per Semester"
                value={String(editingLeaveType.maxDaysPerSemester)}
                onChange={(e) => setEditingLeaveType({ ...editingLeaveType, maxDaysPerSemester: Number(e.target.value) })}
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Applies To</label>
              <div className="flex flex-wrap gap-4">
                {([
                  { value: 'ALL', label: 'All Verticals' },
                  { value: 'BOYS', label: 'Boys Hostel' },
                  { value: 'GIRLS', label: 'Girls Ashram' },
                  { value: 'DHARAMSHALA', label: 'Dharamshala' },
                ] as const).map((opt) => {
                  const currentLength = editingLeaveType.allowedVerticals.length;
                  const isAllSelected = currentLength === 3;
                  const isChecked =
                    opt.value === 'ALL'
                      ? isAllSelected
                      : !isAllSelected && currentLength === 1 && editingLeaveType.allowedVerticals[0] === opt.value;
                  return (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="leave-type-vertical"
                        className="w-4 h-4"
                        checked={isChecked}
                        onChange={() => {
                          const newVerticals: Vertical[] =
                            opt.value === 'ALL'
                              ? ['BOYS', 'GIRLS', 'DHARAMSHALA']
                              : [opt.value as Vertical];
                          setEditingLeaveType({ ...editingLeaveType, allowedVerticals: newVerticals });
                        }}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">A leave type applies to one specific vertical or all three.</p>
            </div>

            <Toggle
              label="Requires Approval"
              checked={editingLeaveType.requiresApproval}
              onChange={(checked) => setEditingLeaveType({ ...editingLeaveType, requiresApproval: checked })}
              helperText="If enabled, leave applications of this type require superintendent approval"
            />
          </div>
        )}
      </Modal>

      {/* Blackout Date Modal */}
      <Modal
        isOpen={editingBlackoutDate !== null}
        onClose={() => setEditingBlackoutDate(null)}
        title={editingBlackoutDate?.id ? 'Edit Blackout Period' : 'Add Blackout Period'}
        size="lg"
        variant="confirmation"
        onConfirm={saveBlackoutDate}
        confirmText={isSaving ? 'Saving...' : 'Save'}
      >
        {editingBlackoutDate && (
          <div className="space-y-4">
            <Input
              label="Period Name"
              value={editingBlackoutDate.name}
              onChange={(e) => setEditingBlackoutDate({ ...editingBlackoutDate, name: e.target.value })}
              placeholder="e.g., Exam Period - Semester 2"
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <DatePicker
                label="Start Date"
                value={editingBlackoutDate.startDate}
                onChange={(e) => setEditingBlackoutDate({ ...editingBlackoutDate, startDate: e.target.value })}
                required
              />
              <DatePicker
                label="End Date"
                value={editingBlackoutDate.endDate}
                onChange={(e) => setEditingBlackoutDate({ ...editingBlackoutDate, endDate: e.target.value })}
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Applies To</label>
              <div className="flex flex-wrap gap-4">
                {([
                  { value: 'ALL', label: 'All Verticals' },
                  { value: 'BOYS', label: 'Boys Hostel' },
                  { value: 'GIRLS', label: 'Girls Ashram' },
                  { value: 'DHARAMSHALA', label: 'Dharamshala' },
                ] as const).map((opt) => {
                  const currentLength = editingBlackoutDate.verticals.length;
                  const isAllSelected = currentLength === 3;
                  const isChecked =
                    opt.value === 'ALL'
                      ? isAllSelected
                      : !isAllSelected && currentLength === 1 && editingBlackoutDate.verticals[0] === opt.value;
                  return (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="blackout-vertical"
                        className="w-4 h-4"
                        checked={isChecked}
                        onChange={() => {
                          const newVerticals: Vertical[] =
                            opt.value === 'ALL'
                              ? ['BOYS', 'GIRLS', 'DHARAMSHALA']
                              : [opt.value as Vertical];
                          setEditingBlackoutDate({ ...editingBlackoutDate, verticals: newVerticals });
                        }}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Textarea
              label="Reason"
              value={editingBlackoutDate.reason}
              onChange={(e) => setEditingBlackoutDate({ ...editingBlackoutDate, reason: e.target.value })}
              placeholder="e.g., Final examinations, festival period, etc."
              required
            />
          </div>
        )}
      </Modal>

      {/* Notification Rule Modal */}
      <Modal
        isOpen={editingNotificationRule !== null}
        onClose={() => setEditingNotificationRule(null)}
        title={editingNotificationRule?.id ? 'Edit Notification Rule' : 'Add Notification Rule'}
        size="xl"
        variant="confirmation"
        onConfirm={saveNotificationRule}
        confirmText={isSaving ? 'Saving...' : 'Save'}
      >
        {editingNotificationRule && (
          <div className="space-y-4">
            <Select
              label="Event Type"
              options={eventTypeOptions}
              value={editingNotificationRule.eventType}
              onChange={(e) => setEditingNotificationRule({
                ...editingNotificationRule,
                eventType: e.target.value as any
              })}
              required
            />

            <Select
              label="Notification Timing"
              options={timingOptions}
              value={editingNotificationRule.timing}
              onChange={(e) => setEditingNotificationRule({
                ...editingNotificationRule,
                timing: e.target.value as any
              })}
              required
              helperText="When should the notification be sent?"
            />

            <div className="space-y-3">
              <label className="text-sm font-medium">Notification Channels</label>
              <div className="flex gap-6">
                <Toggle
                  label="SMS"
                  checked={editingNotificationRule.channels.sms}
                  onChange={(checked) => setEditingNotificationRule({
                    ...editingNotificationRule,
                    channels: { ...editingNotificationRule.channels, sms: checked }
                  })}
                />
                <Toggle
                  label="WhatsApp"
                  checked={editingNotificationRule.channels.whatsapp}
                  onChange={(checked) => setEditingNotificationRule({
                    ...editingNotificationRule,
                    channels: { ...editingNotificationRule.channels, whatsapp: checked }
                  })}
                />
                <Toggle
                  label="Email"
                  checked={editingNotificationRule.channels.email}
                  onChange={(checked) => setEditingNotificationRule({
                    ...editingNotificationRule,
                    channels: { ...editingNotificationRule.channels, email: checked }
                  })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Applies To</label>
              <div className="flex flex-wrap gap-4">
                {([
                  { value: 'ALL', label: 'All Verticals' },
                  { value: 'BOYS', label: 'Boys Hostel' },
                  { value: 'GIRLS', label: 'Girls Ashram' },
                  { value: 'DHARAMSHALA', label: 'Dharamshala' },
                ] as const).map((opt) => {
                  const currentLength = editingNotificationRule.verticals.length;
                  const isAllSelected = currentLength === 3;
                  const isChecked =
                    opt.value === 'ALL'
                      ? isAllSelected
                      : !isAllSelected && currentLength === 1 && editingNotificationRule.verticals[0] === opt.value;
                  return (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="notification-rule-vertical"
                        className="w-4 h-4"
                        checked={isChecked}
                        onChange={() => {
                          const newVerticals: Vertical[] =
                            opt.value === 'ALL'
                              ? ['BOYS', 'GIRLS', 'DHARAMSHALA']
                              : [opt.value as Vertical];
                          setEditingNotificationRule({ ...editingNotificationRule, verticals: newVerticals });
                        }}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Textarea
              label="Message Template"
              value={editingNotificationRule.template}
              onChange={(e) => setEditingNotificationRule({
                ...editingNotificationRule,
                template: e.target.value
              })}
              placeholder="Use {{variable_name}} for dynamic content. Available: {{student_name}}, {{start_date}}, {{end_date}}, {{reason}}, {{emergency_type}}"
              required
              helperText="Variables will be replaced with actual data when sending notifications"
            />

            <Toggle
              label="Active"
              checked={editingNotificationRule.active}
              onChange={(checked) => setEditingNotificationRule({ ...editingNotificationRule, active: checked })}
              helperText="Enable or disable this notification rule"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

type AdmissionsVertical = 'boys-hostel' | 'girls-ashram' | 'dharamshala';

const ADMISSIONS_VERTICAL_LABELS: Record<AdmissionsVertical, string> = {
  'boys-hostel': 'Boys Hostel',
  'girls-ashram': 'Girls Ashram',
  'dharamshala': 'Dharamshala',
};

const ADMISSIONS_DB_TO_SLUG: Record<string, AdmissionsVertical> = {
  BOYS_HOSTEL: 'boys-hostel',
  GIRLS_ASHRAM: 'girls-ashram',
  DHARAMSHALA: 'dharamshala',
};

function AdmissionsStatusCard() {
  const [status, setStatus] = useState<Record<AdmissionsVertical, boolean> | null>(null);
  const [userVertical, setUserVertical] = useState<AdmissionsVertical | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingVertical, setSavingVertical] = useState<AdmissionsVertical | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [statusRes, sessionRes] = await Promise.all([
          fetch('/api/config/applications-status'),
          token ? fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } }) : null,
        ]);
        const statusData = await statusRes.json();
        if (!cancelled && statusData?.success) setStatus(statusData.data);
        if (sessionRes && sessionRes.ok) {
          const sess = await sessionRes.json();
          if (!cancelled) {
            setUserRole(sess.role || null);
            const slug = sess.vertical ? ADMISSIONS_DB_TO_SLUG[sess.vertical] : null;
            setUserVertical(slug || null);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load admissions status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  const toggle = async (vertical: AdmissionsVertical, open: boolean) => {
    if (!token) {
      setError('Not authenticated');
      return;
    }
    setSavingVertical(vertical);
    setError(null);
    try {
      const res = await fetch('/api/config/applications-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vertical, open }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to update');
      setStatus((prev) => ({ ...(prev as any), [vertical]: open }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingVertical(null);
    }
  };

  const verticals: AdmissionsVertical[] = ['boys-hostel', 'girls-ashram', 'dharamshala'];
  const isTrustee = userRole === 'TRUSTEE';

  return (
    <div className="mb-4 p-6 rounded-lg" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-primary)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Admissions Status
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Open or close the public application form. When closed, the apply page is disabled and new submissions are rejected.
          </p>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {verticals.map((v) => {
            const isOpen = status?.[v] ?? true;
            const canEdit = isTrustee || userVertical === v;
            return (
              <div key={v} className="flex items-center justify-between p-3 rounded" style={{ background: 'var(--surface-secondary)' }}>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {ADMISSIONS_VERTICAL_LABELS[v]}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {isOpen ? 'Accepting new applications' : 'Closed — applicants cannot submit'}
                    {!canEdit && ' · Read-only (managed by another superintendent)'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={isOpen ? 'success' : 'destructive'}>
                    {isOpen ? 'Open' : 'Closed'}
                  </Badge>
                  <Toggle
                    checked={isOpen}
                    onChange={(checked) => toggle(v, checked)}
                    disabled={!canEdit || savingVertical === v}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="text-sm mt-3" style={{ color: 'var(--color-red-600)' }}>{error}</p>
      )}
    </div>
  );
}
