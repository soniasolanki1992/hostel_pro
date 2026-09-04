'use client';

import { useState, useMemo, useEffect } from 'react';
import { Badge, type BadgeVariant } from '@/components/shadcn/badge-extended';
import { Card } from '@/components/data/Card';
import { Button } from '@/components/shadcn/button-extended';
import { Table } from '@/components/data/Table';
import type { TableColumn } from '@/components/types';
import { Select, type SelectOption } from '@/components/forms/Select';
import { cn } from '@/components/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { FeeStructureTab } from '@/components/accounts/FeeStructureTab';
import { GenerateMonthlyMessModal } from '@/components/accounts/GenerateMonthlyMessModal';
import { FEE_HEAD_LABELS } from '@/lib/fees/feeHeads';
import { downloadCsv, downloadXls, isWithinPeriod } from '@/lib/accounts/exportUtils';

type Vertical = 'ALL' | 'BOYS' | 'GIRLS' | 'DHARAMSHALA';
type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'THIS_YEAR' | 'ALL_TIME';
type Status = 'ALL' | 'PAID' | 'PENDING' | 'OVERDUE' | 'PARTIAL';
type FeeComponent = 'ALL' | 'PROCESSING_FEE' | 'HOSTEL_FEES' | 'SECURITY_DEPOSIT' | 'KEY_DEPOSIT' | 'MESS_ADVANCE' | 'MESS_MONTHLY_FEE' | 'PARTIAL_PAYMENT';
type UserRole = 'ALL' | 'SUPERINTENDENT' | 'ACCOUNTS' | 'TRUSTEE';

interface Receivable {
  id: string;
  studentName: string;
  studentId: string;
  vertical: 'BOYS' | 'GIRLS' | 'DHARAMSHALA';
  amount: number;
  dueDate: string;
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'PARTIAL';
  feeComponent: 'PROCESSING_FEE' | 'HOSTEL_FEES' | 'SECURITY_DEPOSIT' | 'KEY_DEPOSIT' | 'MESS_ADVANCE' | 'MESS_MONTHLY_FEE' | 'PARTIAL_PAYMENT';
  contact: {
    phone: string;
    email: string;
    parentPhone?: string;
  };
  audit: {
    createdBy: string;
    createdByRole: UserRole;
    createdAt: string;
    modifiedBy?: string;
    modifiedAt?: string;
  };
  communicationLogs?: number;
}

export default function AccountsDashboard() {
  const { t } = useLanguage();
  const [selectedTab, setSelectedTab] = useState<'overview' | 'receivables' | 'payment-logs' | 'fee-structure' | 'receipts' | 'clearance' | 'data-export'>('overview');
  const [generateMessOpen, setGenerateMessOpen] = useState(false);
  const [selectedVertical, setSelectedVertical] = useState<Vertical>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('THIS_MONTH');
  const [statusFilter, setStatusFilter] = useState<Status>('ALL');
  const [feeComponentFilter, setFeeComponentFilter] = useState<FeeComponent>('ALL');
  const [userRoleFilter, setUserRoleFilter] = useState<UserRole>('ALL');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [paymentLogsPage, setPaymentLogsPage] = useState(1);
  const [exportPage, setExportPage] = useState(1);

  // View Details modal
  const [detailsModal, setDetailsModal] = useState<{ open: boolean; row: Receivable | null }>({ open: false, row: null });

  // Reminder modal (single + bulk)
  const [reminderModal, setReminderModal] = useState<{
    open: boolean;
    targetIds: string[];
    channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
    message: string;
    loading: boolean;
    error: string | null;
  }>({ open: false, targetIds: [], channel: 'SMS', message: '', loading: false, error: null });

  // Communication logs modal
  const [commLogsModal, setCommLogsModal] = useState<{
    open: boolean;
    receivable: Receivable | null;
    logs: any[];
    loading: boolean;
    error: string | null;
  }>({ open: false, receivable: null, logs: [], loading: false, error: null });

  // Clearance tab data
  const [clearanceItems, setClearanceItems] = useState<any[]>([]);
  const [clearanceLoading, setClearanceLoading] = useState(false);
  const [clearanceError, setClearanceError] = useState<string | null>(null);

  const verticalOptions: SelectOption[] = [
    { value: 'ALL', label: 'All Verticals' },
    { value: 'BOYS', label: 'Boys Hostel' },
    { value: 'GIRLS', label: 'Girls Ashram' },
    { value: 'DHARAMSHALA', label: 'Dharamshala' }
  ];

  const periodOptions: SelectOption[] = [
    { value: 'THIS_MONTH', label: 'This Month' },
    { value: 'LAST_MONTH', label: 'Last Month' },
    { value: 'LAST_3_MONTHS', label: 'Last 3 Months' },
    { value: 'LAST_6_MONTHS', label: 'Last 6 Months' },
    { value: 'THIS_YEAR', label: 'This Year' },
    { value: 'ALL_TIME', label: 'All Time' }
  ];

  const feeComponentOptions: SelectOption[] = [
    { value: 'ALL', label: 'All Fee Components' },
    { value: 'PROCESSING_FEE', label: FEE_HEAD_LABELS.PROCESSING_FEE },
    { value: 'SECURITY_DEPOSIT', label: FEE_HEAD_LABELS.SECURITY_DEPOSIT },
    { value: 'HOSTEL_FEES', label: FEE_HEAD_LABELS.HOSTEL_FEES },
    { value: 'MESS_ADVANCE', label: FEE_HEAD_LABELS.MESS_ADVANCE },
    { value: 'MESS_MONTHLY_FEE', label: FEE_HEAD_LABELS.MESS_MONTHLY_FEE },
    { value: 'KEY_DEPOSIT', label: FEE_HEAD_LABELS.KEY_DEPOSIT },
    { value: 'PARTIAL_PAYMENT', label: 'Partial Payment' }
  ];

  const userRoleOptions: SelectOption[] = [
    { value: 'ALL', label: 'All User Roles' },
    { value: 'SUPERINTENDENT', label: 'Superintendent' },
    { value: 'ACCOUNTS', label: 'Accounts' },
    { value: 'TRUSTEE', label: 'Trustee' }
  ];

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Record Payment modal state
  const [recordPayment, setRecordPayment] = useState<{
    open: boolean;
    feeId: string;
    amount: string;
    paymentMethod: string;
    transactionRef: string;
    receiptNumber: string;
    notes: string;
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    feeId: '',
    amount: '',
    paymentMethod: 'CASH',
    transactionRef: '',
    receiptNumber: '',
    notes: '',
    loading: false,
    error: null,
  });

  const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('authToken');
        const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
        const [receivablesRes, transactionsRes] = await Promise.all([
          fetch('/api/receivables', { headers }),
          fetch('/api/transactions', { headers })
        ]);

        if (!receivablesRes.ok || !transactionsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const receivablesJson = await receivablesRes.json();
        const transactionsJson = await transactionsRes.json();

        // Unwrap standard API response format { success, data }
        const receivablesData = receivablesJson?.data ?? receivablesJson;
        const transactionsData = transactionsJson?.data ?? transactionsJson;

        // Transform receivables data to match the expected format
        const mapVertical = (v: string): 'BOYS' | 'GIRLS' | 'DHARAMSHALA' => {
          if (!v) return 'BOYS';
          const upper = v.toUpperCase();
          if (upper.includes('GIRLS')) return 'GIRLS';
          if (upper.includes('DHARAMSHALA')) return 'DHARAMSHALA';
          return 'BOYS';
        };
        const transformedReceivables: Receivable[] = (Array.isArray(receivablesData) ? receivablesData : []).map((rec: any) => ({
          id: rec.id,
          studentName: rec.student_name || 'Unknown',
          studentId: rec.student_id,
          vertical: mapVertical(rec.vertical),
          amount: parseFloat(rec.amount) || 0,
          dueDate: rec.due_date
            ? (rec.due_date instanceof Date ? rec.due_date.toISOString().split('T')[0] : String(rec.due_date).split('T')[0])
            : '',
          status: rec.status || 'PENDING',
          feeComponent: rec.fee_component || rec.fee_head || 'HOSTEL_FEES',
          contact: {
            phone: rec.contact_phone || '',
            email: rec.contact_email || '',
            parentPhone: rec.parent_phone
          },
          audit: {
            createdBy: rec.created_by || 'system',
            createdByRole: rec.created_by_role || 'ACCOUNTS',
            createdAt: rec.created_at || new Date().toISOString(),
            modifiedBy: rec.modified_by,
            modifiedAt: rec.modified_at
          },
          communicationLogs: rec.communication_logs || 0
        }));

        // Transform transactions data to payment logs format
        const transformedPaymentLogs = (Array.isArray(transactionsData) ? transactionsData : []).map((txn: any) => ({
          id: txn.id,
          transactionId: txn.transaction_id,
          studentName: txn.student_name,
          studentId: txn.student_id,
          amount: txn.amount,
          paymentDate: txn.payment_date,
          method: txn.method,
          status: txn.status,
          feeHead: txn.fee_head,
          vertical: txn.vertical
        }));

        setReceivables(transformedReceivables);
        setPaymentLogs(transformedPaymentLogs);
        setError(null);
      } catch (err) {
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => { fetchData(); }, []);

  const submitRecordPayment = async () => {
    if (!recordPayment.feeId) {
      setRecordPayment(s => ({ ...s, error: 'Please select a pending fee' }));
      return;
    }
    const amt = parseFloat(recordPayment.amount);
    if (!amt || amt <= 0) {
      setRecordPayment(s => ({ ...s, error: 'Please enter a valid amount' }));
      return;
    }
    setRecordPayment(s => ({ ...s, loading: true, error: null }));
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fee_id: recordPayment.feeId,
          amount: amt,
          payment_method: recordPayment.paymentMethod,
          transaction_ref: recordPayment.transactionRef || undefined,
          receipt_number: recordPayment.receiptNumber || undefined,
          payment_notes: recordPayment.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to record payment');

      setRecordPayment({
        open: false, feeId: '', amount: '', paymentMethod: 'CASH',
        transactionRef: '', receiptNumber: '', notes: '', loading: false, error: null,
      });
      await fetchData();
      alert('Payment recorded successfully');
    } catch (e: any) {
      setRecordPayment(s => ({ ...s, loading: false, error: e.message || 'Failed to record payment' }));
    }
  };

  const fetchClearance = async () => {
    try {
      setClearanceLoading(true);
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
      const params = new URLSearchParams();
      if (selectedVertical !== 'ALL') params.set('vertical', selectedVertical);
      const res = await fetch(`/api/clearance-items?${params.toString()}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to fetch clearance');
      setClearanceItems(Array.isArray(json?.data) ? json.data : []);
      setClearanceError(null);
    } catch (e: any) {
      setClearanceError(e?.message || 'Failed to load clearance items');
    } finally {
      setClearanceLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTab === 'clearance') fetchClearance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, selectedVertical]);

  const openReminder = (ids: string[]) => {
    if (ids.length === 0) return;
    const first = receivables.find(r => r.id === ids[0]);
    const defaultMsg = first
      ? `This is a reminder that your ${first.feeComponent.replace(/_/g, ' ')} of ₹${first.amount.toLocaleString('en-IN')} is due on ${first.dueDate}.`
      : 'Reminder: a fee payment is due. Please clear it at your earliest convenience.';
    setReminderModal({ open: true, targetIds: ids, channel: 'SMS', message: defaultMsg, loading: false, error: null });
  };

  const submitReminder = async () => {
    setReminderModal(s => ({ ...s, loading: true, error: null }));
    try {
      const token = localStorage.getItem('authToken');
      const targets = reminderModal.targetIds
        .map(id => receivables.find(r => r.id === id))
        .filter((r): r is Receivable => !!r);
      if (targets.length === 0) throw new Error('No valid recipients');

      const channel = reminderModal.channel;
      const recipients = targets.map(r => {
        const contact = channel === 'EMAIL' ? r.contact.email : (r.contact.phone || r.contact.parentPhone || '');
        return { contact };
      }).filter(r => r.contact);
      if (recipients.length === 0) throw new Error(`No ${channel} contact available for selected recipients`);

      // One row per recipient — record against each receivable so logs stay scoped
      let total = 0;
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const contact = channel === 'EMAIL' ? t.contact.email : (t.contact.phone || t.contact.parentPhone || '');
        if (!contact) continue;
        const res = await fetch('/api/communications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            recipients: [{ contact }],
            channel,
            purpose: 'FEE_REMINDER',
            subject: 'Fee payment reminder',
            message_body: reminderModal.message,
            related_entity_type: 'FEE',
            related_entity_id: t.id,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message || 'Failed to record reminder');
        total += Array.isArray(j?.data) ? j.data.length : 0;
      }

      setReminderModal({ open: false, targetIds: [], channel: 'SMS', message: '', loading: false, error: null });
      setSelectedRows(new Set());
      alert(`Recorded ${total} reminder(s)`);
    } catch (e: any) {
      setReminderModal(s => ({ ...s, loading: false, error: e?.message || 'Failed to send' }));
    }
  };

  const openCommLogs = async (receivable: Receivable) => {
    setCommLogsModal({ open: true, receivable, logs: [], loading: true, error: null });
    try {
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/communications?related_entity_id=${receivable.id}&related_entity_type=FEE&limit=200`, { headers });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || 'Failed to fetch logs');
      setCommLogsModal(s => ({ ...s, logs: Array.isArray(j?.data) ? j.data : [], loading: false }));
    } catch (e: any) {
      setCommLogsModal(s => ({ ...s, loading: false, error: e?.message || 'Failed to load logs' }));
    }
  };

  const exportReceivablesCsv = (rows: Receivable[], filename: string, useXls = false) => {
    const flat = rows.map(r => ({
      id: r.id,
      studentName: r.studentName,
      studentId: r.studentId,
      vertical: r.vertical,
      amount: r.amount,
      dueDate: r.dueDate,
      status: r.status,
      feeComponent: r.feeComponent.replace(/_/g, ' '),
      phone: r.contact.phone,
      email: r.contact.email,
      parentPhone: r.contact.parentPhone || '',
      createdBy: r.audit.createdByRole,
      createdAt: r.audit.createdAt.split('T')[0],
    }));
    const cols = [
      { key: 'id' as const, header: 'Voucher No' },
      { key: 'dueDate' as const, header: 'Voucher Date' },
      { key: 'status' as const, header: 'Status' },
      { key: 'studentName' as const, header: 'Party Ledger' },
      { key: 'studentId' as const, header: 'Student ID' },
      { key: 'amount' as const, header: 'Amount' },
      { key: 'feeComponent' as const, header: 'Fee Head' },
      { key: 'vertical' as const, header: 'Cost Center' },
      { key: 'phone' as const, header: 'Phone' },
      { key: 'email' as const, header: 'Email' },
      { key: 'parentPhone' as const, header: 'Parent Phone' },
      { key: 'createdBy' as const, header: 'Created By' },
      { key: 'createdAt' as const, header: 'Created Date' },
    ];
    (useXls ? downloadXls : downloadCsv)(flat, cols, filename);
  };

  const exportPaymentLogsCsv = (rows: any[], filename: string, useXls = false) => {
    const flat = rows.map(r => ({
      transactionId: r.transactionId || r.id,
      studentName: r.studentName || '',
      studentId: r.studentId || '',
      amount: r.amount,
      paymentDate: r.paymentDate ? String(r.paymentDate).split('T')[0] : '',
      method: r.method || '',
      status: r.status || '',
      feeHead: r.feeHead || '',
      vertical: r.vertical || '',
    }));
    const cols = [
      { key: 'transactionId' as const, header: 'Transaction ID' },
      { key: 'studentName' as const, header: 'Student Name' },
      { key: 'studentId' as const, header: 'Student ID' },
      { key: 'amount' as const, header: 'Amount' },
      { key: 'paymentDate' as const, header: 'Payment Date' },
      { key: 'method' as const, header: 'Payment Method' },
      { key: 'status' as const, header: 'Status' },
      { key: 'feeHead' as const, header: 'Fee Head' },
      { key: 'vertical' as const, header: 'Vertical' },
    ];
    (useXls ? downloadXls : downloadCsv)(flat, cols, filename);
  };

  const filteredReceivables = useMemo(() => {
    return receivables.filter(rec => {
      const matchesVertical = selectedVertical === 'ALL' || rec.vertical === selectedVertical;
      const matchesStatus = statusFilter === 'ALL' || rec.status === statusFilter;
      const matchesFeeComponent = feeComponentFilter === 'ALL' || rec.feeComponent === feeComponentFilter;
      const matchesUserRole = userRoleFilter === 'ALL' || rec.audit.createdByRole === userRoleFilter;
      const matchesDateRange = (!dateRange.from || rec.dueDate >= dateRange.from) && (!dateRange.to || rec.dueDate <= dateRange.to);
      const matchesPeriod = isWithinPeriod(rec.dueDate, selectedPeriod);
      return matchesVertical && matchesStatus && matchesFeeComponent && matchesUserRole && matchesDateRange && matchesPeriod;
    });
  }, [receivables, selectedVertical, statusFilter, feeComponentFilter, userRoleFilter, dateRange, selectedPeriod]);

  const filteredPaymentLogs = useMemo(() => {
    return paymentLogs.filter(log => {
      const matchesVertical = selectedVertical === 'ALL' || log.vertical === selectedVertical;
      const matchesPeriod = isWithinPeriod(log.paymentDate, selectedPeriod);
      return matchesVertical && matchesPeriod;
    });
  }, [paymentLogs, selectedVertical, selectedPeriod]);

  const kpis = calculateKPIs();
  const kpiData = [
    { title: t('Total Receivables', 'कुल प्राप्य'), value: kpis.totalReceivables, icon: '💰', color: 'blue' },
    { title: t('Collected', 'संग्रहित'), value: kpis.collected, icon: '✅', color: 'green' },
    { title: t('Overdue', 'अतिदेय'), value: kpis.overdue, icon: '⚠️', color: 'red' },
    { title: t('Upcoming This Month', 'इस महीने आगामी'), value: kpis.upcomingThisMonth, icon: '📅', color: 'yellow' }
  ];

  function calculateKPIs() {
    const totalReceivables = receivables.reduce((sum, rec) => sum + rec.amount, 0);
    const collected = receivables
      .filter(rec => rec.status === 'PAID')
      .reduce((sum, rec) => sum + rec.amount, 0);
    const overdue = receivables
      .filter(rec => rec.status === 'OVERDUE')
      .reduce((sum, rec) => sum + rec.amount, 0);

    const upcomingThisMonth = receivables
      .filter(rec => {
        const dueDate = new Date(rec.dueDate);
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear && rec.status === 'PENDING';
      })
      .reduce((sum, rec) => sum + rec.amount, 0);

    return {
      totalReceivables: `₹${totalReceivables.toLocaleString('en-IN')}`,
      collected: `₹${collected.toLocaleString('en-IN')}`,
      overdue: `₹${overdue.toLocaleString('en-IN')}`,
      upcomingThisMonth: `₹${upcomingThisMonth.toLocaleString('en-IN')}`
    };
  }

  const getStatusVariant = (status: string): BadgeVariant => {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'PENDING':
        return 'warning';
      case 'OVERDUE':
        return 'error';
      case 'PARTIAL':
        return 'info';
      default:
        return 'default';
    }
  };

  const getVerticalColor = (vertical: string) => {
    switch (vertical) {
      case 'BOYS': return 'bg-blue-100 text-blue-700';
      case 'GIRLS': return 'bg-pink-100 text-pink-700';
      case 'DHARAMSHALA': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleRowSelect = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = filteredReceivables.map(r => r.id);
    setSelectedRows(new Set(allIds));
  };

  const handleClearSelection = () => {
    setSelectedRows(new Set());
  };

  const handleBulkReminders = () => {
    openReminder(Array.from(selectedRows));
  };

  const handleExportSelected = () => {
    const rows = filteredReceivables.filter(r => selectedRows.has(r.id));
    exportReceivablesCsv(rows, `receivables-selected-${Date.now()}.csv`);
    setSelectedRows(new Set());
  };

  const receivablesColumns: TableColumn<Receivable>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={selectedRows.size === filteredReceivables.length && filteredReceivables.length > 0}
          onChange={(e) => e.target.checked ? handleSelectAll() : handleClearSelection()}
          className="w-4 h-4"
        />
      ),
      render: (_: any, row: Receivable) => (
        <input
          type="checkbox"
          checked={selectedRows.has(row.id)}
          onChange={() => handleRowSelect(row.id)}
          className="w-4 h-4"
        />
      )
    },
    {
      key: 'studentName',
      header: 'Student Name',
      sortable: true,
      render: (value: string) => <span className="font-medium">{value}</span>
    },
    {
      key: 'studentId',
      header: 'Student ID',
      sortable: true,
      render: (value: string) => <span className="font-mono text-xs">{value}</span>
    },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      render: (value: string) => (
        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getVerticalColor(value))}>
          {value}
        </span>
      )
    },
    {
      key: 'amount',
      header: 'Amount (₹)',
      sortable: true,
      render: (value: number) => (
        <span className="font-medium">₹{value.toLocaleString('en-IN')}</span>
      )
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      sortable: true,
      render: (value: string) => <span>{value}</span>
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (value: string) => (
        <Badge variant={getStatusVariant(value as any)} size="sm">{value}</Badge>
      )
    },
    {
      key: 'feeComponent',
      header: 'Fee Component',
      sortable: true,
      render: (value: string) => (
        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
          {value.replace(/_/g, ' ')}
        </span>
      )
    },
    {
      key: 'contact',
      header: 'Contact Summary',
      sortable: false,
      render: (value: any) => (
        <div className="text-xs">
          <div className="flex items-center gap-1">
            <span>Phone: {value.phone}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Email: {value.email}</span>
          </div>
          {value.parentPhone && (
            <div className="flex items-center gap-1">
              <span>Parent Phone: {value.parentPhone}</span>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'communicationLogs',
      header: 'Communication',
      sortable: false,
      render: (_: any, row: Receivable) => (
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => openCommLogs(row)}
        >
          {row.communicationLogs && row.communicationLogs > 0 ? `View (${row.communicationLogs})` : 'View logs'}
        </button>
      )
    },
    {
      key: 'audit',
      header: 'Audit Info',
      sortable: false,
      render: (value: any) => (
        <div className="text-xs">
          <div>By: {value.createdByRole}</div>
          <div>{value.createdAt.split('T')[0]}</div>
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: Receivable) => (
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setDetailsModal({ open: true, row })}>
            View Details
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openReminder([row.id])}>
            Send Reminder
          </Button>
        </div>
      )
    }
  ];

  const paymentLogColumns: TableColumn<any>[] = [
    {
      key: 'transactionId',
      header: 'Transaction ID',
      sortable: true,
      render: (value: string) => <span className="font-mono text-xs">{value}</span>
    },
    {
      key: 'studentName',
      header: 'Student Name',
      sortable: true,
      render: (value: string) => <span className="font-medium">{value}</span>
    },
    {
      key: 'studentId',
      header: 'Student ID',
      sortable: true,
      render: (value: string) => (
        <span className="font-mono text-xs">{value}</span>
      )
    },
    {
      key: 'amount',
      header: 'Amount (₹)',
      sortable: true,
      render: (value: number) => (
        <span className="font-medium">₹{value.toLocaleString('en-IN')}</span>
      )
    },
    {
      key: 'paymentDate',
      header: 'Payment Date',
      sortable: true,
      render: (value: string) => <span>{value}</span>
    },
    {
      key: 'method',
      header: 'Payment Method',
      sortable: true,
      render: (value: string) => (
        <Badge variant="info" size="sm">{value}</Badge>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (value: string) => (
        <Badge variant={value === 'SUCCESS' ? 'success' : 'error'} size="sm">
          {value}
        </Badge>
      )
    },
    {
      key: 'feeHead',
      header: 'Fee Head',
      sortable: true,
      render: (value: string) => <span className="text-xs">{value}</span>
    },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      render: (value: string) => (
        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getVerticalColor(value))}>
          {value}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: any) => (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => exportPaymentLogsCsv([row], `receipt-${row.transactionId || row.id}.csv`)}
          >
            View Receipt
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportPaymentLogsCsv([row], `receipt-${row.transactionId || row.id}.xls`, true)}
          >
            Download
          </Button>
        </div>
      )
    }
  ];

  const pageSize = 15;
  const totalPages = Math.ceil(filteredReceivables.length / pageSize);
  const paginatedReceivables = filteredReceivables.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div style={{ background: 'var(--bg-page)' }} className="min-h-screen">
      <header className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('Accounts Dashboard', 'लेखा डैशबोर्ड')}
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'var(--bg-accent)', color: 'var(--text-on-accent)' }}>
              {selectedVertical === 'ALL' ? 'All Verticals' : selectedVertical}
            </span>
          </div>
          <Button variant="ghost" size="sm">
            {t('Logout', 'लॉगआउट')}
          </Button>
        </div>
      </header>

          <nav className="mx-auto max-w-7xl border-b" style={{ borderColor: 'var(--border-gray-200)' }}>
            <div className="flex gap-8 px-6">
              <button
                className={cn(
                  'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
                  selectedTab === 'overview'
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                )}
                style={{
                  borderColor: selectedTab === 'overview' ? 'var(--border-primary)' : 'transparent',
                  color: selectedTab === 'overview' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTab('overview')}
              >
                {t('Overview', 'अवलोकन')}
              </button>
              <button
                className={cn(
                  'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
                  selectedTab === 'receivables'
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                )}
                style={{
                  borderColor: selectedTab === 'receivables' ? 'var(--border-primary)' : 'transparent',
                  color: selectedTab === 'receivables' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTab('receivables')}
              >
                {t('Receivables', 'प्राप्य')}
              </button>
              <button
                className={cn(
                  'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
                  selectedTab === 'payment-logs'
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                )}
                style={{
                  borderColor: selectedTab === 'payment-logs' ? 'var(--border-primary)' : 'transparent',
                  color: selectedTab === 'payment-logs' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTab('payment-logs')}
              >
                {t('Payment Logs', 'भुगतान लॉग')}
              </button>
              <button
                className={cn(
                  'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
                  selectedTab === 'fee-structure'
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                )}
                style={{
                  borderColor: selectedTab === 'fee-structure' ? 'var(--border-primary)' : 'transparent',
                  color: selectedTab === 'fee-structure' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTab('fee-structure')}
              >
                {t('Fee Structure', 'शुल्क संरचना')}
              </button>
              <button
                className={cn(
                  'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
                  selectedTab === 'receipts'
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                )}
                style={{
                  borderColor: selectedTab === 'receipts' ? 'var(--border-primary)' : 'transparent',
                  color: selectedTab === 'receipts' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTab('receipts')}
              >
                {t('Receipts', 'रसीदें')}
              </button>
              <button
                className={cn(
                  'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
                  selectedTab === 'clearance'
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                )}
                style={{
                  borderColor: selectedTab === 'clearance' ? 'var(--border-primary)' : 'transparent',
                  color: selectedTab === 'clearance' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTab('clearance')}
              >
                {t('Clearance', 'मंजूरी')}
              </button>
              <button
                className={cn(
                  'py-4 px-2 border-b-2 font-medium text-sm transition-colors',
                  selectedTab === 'data-export'
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                )}
                style={{
                  borderColor: selectedTab === 'data-export' ? 'var(--border-primary)' : 'transparent',
                  color: selectedTab === 'data-export' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTab('data-export')}
              >
                {t('Export', 'निर्यात')}
              </button>
            </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {selectedTab === 'overview' && (
          <>
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Vertical:
                </label>
                <Select
                  options={verticalOptions}
                  value={selectedVertical}
                  onChange={(e) => setSelectedVertical(e.target.value as Vertical)}
                  size="sm"
                />

                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Period:
                </label>
                <Select
                  options={periodOptions}
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value as Period)}
                  size="sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {kpiData.map((kpi, idx) => (
                <Card
                  key={idx}
                  shadow="lg"
                  className="hover:shadow-xl transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{kpi.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-1">{kpi.title}</p>
                      <p className="text-2xl font-bold" style={{ color: kpi.color === 'blue' ? 'var(--color-blue-600)' : kpi.color === 'green' ? 'var(--color-green-600)' : kpi.color === 'red' ? 'var(--color-red-600)' : 'var(--color-yellow-600)' }}>
                        {kpi.value}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('Recent Receivables', 'हालिया प्राप्य')}
                  </h2>
                  <Button variant="primary" size="sm" onClick={() => setSelectedTab('receivables')}>
                    {t('View All', 'सभी देखें')}
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-gray-200)' }}>
                  <table className="w-full text-sm">
                    <thead style={{ background: 'var(--surface-primary)' }}>
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Student</th>
                        <th className="text-left px-3 py-2 font-medium">Fee</th>
                        <th className="text-right px-3 py-2 font-medium">Amount</th>
                        <th className="text-left px-3 py-2 font-medium">Due</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReceivables.slice(0, 5).map(rec => (
                        <tr key={rec.id} className="border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
                          <td className="px-3 py-2">{rec.studentName}</td>
                          <td className="px-3 py-2 text-xs">{rec.feeComponent.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-2 text-right">₹{rec.amount.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-xs">{rec.dueDate}</td>
                          <td className="px-3 py-2"><Badge variant={getStatusVariant(rec.status)} size="sm">{rec.status}</Badge></td>
                        </tr>
                      ))}
                      {filteredReceivables.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">No receivables</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('Recent Payment Activity', 'हालिया भुगतान गतिविधि')}
                  </h2>
                  <Button variant="primary" size="sm" onClick={() => setSelectedTab('payment-logs')}>
                    {t('View All', 'सभी देखें')}
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-gray-200)' }}>
                  <table className="w-full text-sm">
                    <thead style={{ background: 'var(--surface-primary)' }}>
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Student</th>
                        <th className="text-left px-3 py-2 font-medium">Method</th>
                        <th className="text-right px-3 py-2 font-medium">Amount</th>
                        <th className="text-left px-3 py-2 font-medium">Date</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPaymentLogs.slice(0, 5).map((log: any) => (
                        <tr key={log.id} className="border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
                          <td className="px-3 py-2">{log.studentName || '—'}</td>
                          <td className="px-3 py-2 text-xs">{log.method || '—'}</td>
                          <td className="px-3 py-2 text-right">₹{Number(log.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-xs">{log.paymentDate ? String(log.paymentDate).split('T')[0] : '—'}</td>
                          <td className="px-3 py-2"><Badge variant={log.status === 'SUCCESS' ? 'success' : 'error'} size="sm">{log.status || '—'}</Badge></td>
                        </tr>
                      ))}
                      {filteredPaymentLogs.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">No payments</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {selectedTab === 'receivables' && (
          <>
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Vertical:
                  </label>
                  <Select
                    options={verticalOptions}
                    value={selectedVertical}
                    onChange={(e) => setSelectedVertical(e.target.value as Vertical)}
                    size="sm"
                  />
                </div>

                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Status:
                  </label>
                  <Select
                    options={[
                      { value: 'ALL', label: 'All Statuses' },
                      { value: 'PAID', label: 'Paid' },
                      { value: 'PENDING', label: 'Pending' },
                      { value: 'OVERDUE', label: 'Overdue' },
                      { value: 'PARTIAL', label: 'Partial' }
                    ]}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as Status)}
                    size="sm"
                  />
                </div>

                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Fee Component:
                  </label>
                  <Select
                    options={feeComponentOptions}
                    value={feeComponentFilter}
                    onChange={(e) => setFeeComponentFilter(e.target.value as FeeComponent)}
                    size="sm"
                  />
                </div>

                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Created By Role:
                  </label>
                  <Select
                    options={userRoleOptions}
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value as UserRole)}
                    size="sm"
                  />
                </div>

                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    From:
                  </label>
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                    className="px-3 py-1.5 border rounded text-sm"
                    style={{ borderColor: 'var(--border-gray-300)' }}
                  />
                </div>

                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    To:
                  </label>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                    className="px-3 py-1.5 border rounded text-sm"
                    style={{ borderColor: 'var(--border-gray-300)' }}
                  />
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedVertical('ALL');
                    setStatusFilter('ALL');
                    setFeeComponentFilter('ALL');
                    setUserRoleFilter('ALL');
                    setDateRange({ from: '', to: '' });
                  }}
                >
                  Clear Filters
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setGenerateMessOpen(true)}
                >
                  Generate Monthly Mess Fees
                </Button>
              </div>
            </div>

            {selectedRows.size > 0 && (
              <div className="mb-4 p-4 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-accent-light)', borderColor: 'var(--border-primary)', borderWidth: 1 }}>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={handleBulkReminders}>
                    Send Reminder
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleExportSelected}>
                    Export Selected
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Receivables List
              </h2>
              <p className="text-sm text-gray-600">
                Showing {paginatedReceivables.length} of {filteredReceivables.length} records
              </p>
            </div>

            <Table<Receivable>
              data={paginatedReceivables}
              columns={receivablesColumns}
              pagination={{
                currentPage: currentPage,
                pageSize: pageSize,
                totalItems: filteredReceivables.length,
                totalPages: totalPages,
                onPageChange: setCurrentPage
              }}
              density="normal"
              striped={true}
              stickyHeader={true}
              emptyMessage="No receivables found matching current filters"
            />
          </>
        )}

        {selectedTab === 'payment-logs' && (
          <>
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Vertical:
                </label>
                  <Select
                    options={verticalOptions}
                    value={selectedVertical}
                    onChange={(e) => setSelectedVertical(e.target.value as Vertical)}
                    size="sm"
                  />

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setRecordPayment(s => ({
                    ...s, open: true, feeId: '', amount: '',
                    paymentMethod: 'CASH', transactionRef: '', receiptNumber: '',
                    notes: '', error: null,
                  }))}
                >
                  Record Payment
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => exportPaymentLogsCsv(filteredPaymentLogs, `payment-logs-${Date.now()}.csv`)}
                >
                  Export Logs
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Payment Logs
              </h2>
              <p className="text-sm text-gray-600">
                Showing {filteredPaymentLogs.length} transactions
              </p>
            </div>

            <Table<any>
              data={filteredPaymentLogs.slice((paymentLogsPage - 1) * 20, paymentLogsPage * 20)}
              columns={paymentLogColumns}
              pagination={{
                currentPage: paymentLogsPage,
                pageSize: 20,
                totalItems: filteredPaymentLogs.length,
                totalPages: Math.max(1, Math.ceil(filteredPaymentLogs.length / 20)),
                onPageChange: setPaymentLogsPage
              }}
              density="compact"
              striped={true}
              stickyHeader={true}
              emptyMessage="No payment logs found"
            />
          </>
        )}

        {selectedTab === 'fee-structure' && (
          <FeeStructureTab />
        )}

        {selectedTab === 'receipts' && (() => {
          const receipts = filteredPaymentLogs.filter((l: any) => l.status === 'SUCCESS');
          return (
            <>
              <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Vertical:</label>
                  <Select
                    options={verticalOptions}
                    value={selectedVertical}
                    onChange={(e) => setSelectedVertical(e.target.value as Vertical)}
                    size="sm"
                  />
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Period:</label>
                  <Select
                    options={periodOptions}
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value as Period)}
                    size="sm"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => exportPaymentLogsCsv(receipts, `receipts-${Date.now()}.csv`)}
                  >
                    Export Receipts
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Issued Receipts</h2>
                <p className="text-sm text-gray-600">{receipts.length} receipt(s)</p>
              </div>

              <Table<any>
                data={receipts}
                columns={[
                  { key: 'transactionId', header: 'Receipt / Txn', sortable: true, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
                  { key: 'studentName', header: 'Student', sortable: true },
                  { key: 'studentId', header: 'Student ID', sortable: true, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
                  { key: 'amount', header: 'Amount (₹)', sortable: true, render: (v: number) => `₹${Number(v).toLocaleString('en-IN')}` },
                  { key: 'paymentDate', header: 'Date', sortable: true, render: (v: string) => v ? String(v).split('T')[0] : '—' },
                  { key: 'method', header: 'Method', sortable: true },
                  { key: 'feeHead', header: 'Fee Head', sortable: true },
                  { key: 'vertical', header: 'Vertical', sortable: true },
                  {
                    key: 'actions',
                    header: 'Actions',
                    render: (_: any, row: any) => (
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => exportPaymentLogsCsv([row], `receipt-${row.transactionId || row.id}.csv`)}>
                          CSV
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => exportPaymentLogsCsv([row], `receipt-${row.transactionId || row.id}.xls`, true)}>
                          XLS
                        </Button>
                      </div>
                    )
                  }
                ]}
                pagination={{
                  currentPage: 1,
                  pageSize: 20,
                  totalItems: receipts.length,
                  totalPages: Math.max(1, Math.ceil(receipts.length / 20)),
                  onPageChange: () => {}
                }}
                density="compact"
                striped={true}
                stickyHeader={true}
                emptyMessage="No receipts found for current filters"
              />
            </>
          );
        })()}

        {selectedTab === 'clearance' && (
          <>
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Vertical:</label>
                <Select
                  options={verticalOptions}
                  value={selectedVertical}
                  onChange={(e) => setSelectedVertical(e.target.value as Vertical)}
                  size="sm"
                />
                <Button variant="secondary" size="sm" onClick={fetchClearance}>Refresh</Button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Exit Clearance — Outstanding Dues</h2>
              <p className="text-sm text-gray-600">{clearanceItems.length} request(s)</p>
            </div>

            {clearanceLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {clearanceError && <p className="text-sm text-red-600">{clearanceError}</p>}

            {!clearanceLoading && !clearanceError && (
              <Table<any>
                data={clearanceItems}
                columns={[
                  { key: 'studentName', header: 'Student', sortable: true },
                  { key: 'studentId', header: 'Student ID', sortable: true, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
                  { key: 'vertical', header: 'Vertical', sortable: true, render: (v: string) => (
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getVerticalColor(v))}>{v}</span>
                  )},
                  { key: 'roomNumber', header: 'Room', sortable: true },
                  { key: 'requestedExitDate', header: 'Requested Exit', sortable: true, render: (v: string) => v ? String(v).split('T')[0] : '—' },
                  { key: 'outstandingAmount', header: 'Outstanding (₹)', sortable: true, render: (v: number) => (
                    <span className={cn('font-medium', Number(v) > 0 ? 'text-red-600' : 'text-green-600')}>
                      ₹{Number(v).toLocaleString('en-IN')}
                    </span>
                  )},
                  { key: 'outstandingCount', header: 'Pending Fees', sortable: true },
                  { key: 'progress', header: 'Clearance', sortable: false, render: (p: any) => (
                    <span className="text-xs">{p?.completed || 0}/{p?.total || 0} done</span>
                  )},
                  { key: 'clearanceStatus', header: 'Status', sortable: true, render: (v: string) => (
                    <Badge variant={v === 'CLEARED' ? 'success' : 'warning'} size="sm">{v || 'PENDING'}</Badge>
                  )},
                  { key: 'agingDays', header: 'Aging', sortable: true, render: (v: number) => `${v}d` },
                ]}
                pagination={{
                  currentPage: 1,
                  pageSize: 20,
                  totalItems: clearanceItems.length,
                  totalPages: Math.max(1, Math.ceil(clearanceItems.length / 20)),
                  onPageChange: () => {}
                }}
                density="compact"
                striped={true}
                stickyHeader={true}
                emptyMessage="No clearance requests"
              />
            )}
          </>
        )}

        {selectedTab === 'data-export' && (
          <>
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Tally Export Layout
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Simplified columnar view optimized for Tally integration. Developers: use CSV/XLS export libraries (papaparse, xlsx) with these exact field mappings.
                </p>

                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                  <strong>DEV NOTE:</strong> Ensure frozen headers in generated files. Use sticky positioning for HTML exports or worksheet freeze for Excel exports.
                </div>
              </div>

              <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--surface-primary)' }}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Vertical:
                    </label>
                    <Select
                      options={verticalOptions}
                      value={selectedVertical}
                      onChange={(e) => setSelectedVertical(e.target.value as Vertical)}
                      size="sm"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Fee Component:
                    </label>
                    <Select
                      options={feeComponentOptions}
                      value={feeComponentFilter}
                      onChange={(e) => setFeeComponentFilter(e.target.value as FeeComponent)}
                      size="sm"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => exportReceivablesCsv(filteredReceivables, `tally-export-${Date.now()}.csv`)}
                    >
                      Download CSV
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => exportReceivablesCsv(filteredReceivables, `tally-export-${Date.now()}.xls`, true)}
                    >
                      Download XLS
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Export Preview (Tally-Ready Format)
                </h3>
                <p className="text-sm text-gray-600">
                  {filteredReceivables.length} records ready for export
                </p>
              </div>

              <Table<any>
                data={filteredReceivables.slice((exportPage - 1) * 20, exportPage * 20).map(rec => ({
                  voucherNo: rec.id,
                  voucherDate: rec.dueDate,
                  voucherType: rec.status === 'PAID' ? 'Receipt' : 'Payment',
                  partyLedger: rec.studentName,
                  amount: rec.amount,
                  narration: `${rec.feeComponent.replace(/_/g, ' ')} - ${rec.vertical} Hostel`,
                  costCenter: rec.vertical,
                  feeHead: rec.feeComponent.replace(/_/g, ' '),
                  studentId: rec.studentId,
                  createdBy: rec.audit.createdByRole,
                  createdDate: rec.audit.createdAt.split('T')[0]
                }))}
                columns={[
                  { key: 'voucherNo', header: 'Voucher No', sortable: true },
                  { key: 'voucherDate', header: 'Voucher Date', sortable: true },
                  { key: 'voucherType', header: 'Voucher Type', sortable: true },
                  { key: 'partyLedger', header: 'Party Ledger (Student)', sortable: true },
                  { key: 'amount', header: 'Amount (₹)', sortable: true, render: (v: number) => `₹${v.toLocaleString('en-IN')}` },
                  { key: 'narration', header: 'Narration', sortable: false, render: (v: string) => <span className="text-xs">{v}</span> },
                  { key: 'costCenter', header: 'Cost Center', sortable: true },
                  { key: 'feeHead', header: 'Fee Head', sortable: true },
                  { key: 'studentId', header: 'Student ID', sortable: true, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
                  { key: 'createdBy', header: 'Created By', sortable: true },
                  { key: 'createdDate', header: 'Created Date', sortable: true }
                ]}
                pagination={{
                  currentPage: exportPage,
                  pageSize: 20,
                  totalItems: filteredReceivables.length,
                  totalPages: Math.max(1, Math.ceil(filteredReceivables.length / 20)),
                  onPageChange: setExportPage
                }}
                density="compact"
                striped={true}
                stickyHeader={true}
                emptyMessage="No data matching current filters"
              />

              <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-gray-200)' }}>
                <h3 className="text-md font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Field Mappings for Tally Import
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-700">Mandatory Fields</h4>
                    <ul className="text-gray-600 space-y-1 list-disc list-inside">
                      <li><strong>Voucher No:</strong> Unique identifier from system</li>
                      <li><strong>Voucher Date:</strong> Payment due date (YYYY-MM-DD)</li>
                      <li><strong>Voucher Type:</strong> Receipt or Payment</li>
                      <li><strong>Party Ledger:</strong> Student name as ledger</li>
                      <li><strong>Amount:</strong> Numerical value in INR</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-700">Optional Fields</h4>
                    <ul className="text-gray-600 space-y-1 list-disc list-inside">
                      <li><strong>Narration:</strong> Fee component and vertical</li>
                      <li><strong>Cost Center:</strong> BOYS/GIRLS/DHARAMSHALA</li>
                      <li><strong>Fee Head:</strong> Processing/Hostel/Security/Key Deposit</li>
                      <li><strong>Student ID:</strong> Reference identifier</li>
                      <li><strong>Created By:</strong> User role who created entry</li>
                      <li><strong>Created Date:</strong> Entry creation timestamp</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                  <strong>IMPLEMENTATION NOTES:</strong><br/>
                  • Use <code>papaparse</code> for CSV exports, <code>xlsx</code> for Excel exports<br/>
                  • Apply <code>sheet_freeze</code> for Excel: <code>workbook.Sheets[sheetName]['!freeze'] = &#123; xSplit: 1, ySplit: 0 &#125;</code><br/>
                  • CSV should use comma delimiter, UTF-8 encoding with BOM for Excel compatibility<br/>
                  • Date format must be YYYY-MM-DD for Tally import
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <GenerateMonthlyMessModal
        open={generateMessOpen}
        onClose={() => setGenerateMessOpen(false)}
        onGenerated={fetchData}
      />

      {/* Record Manual Payment Modal */}
      {recordPayment.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setRecordPayment(s => ({ ...s, open: false }))}
        >
          <div
            className="w-full max-w-lg bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Record Payment
              </h2>
              <button
                onClick={() => setRecordPayment(s => ({ ...s, open: false }))}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Pending Fee <span className="text-red-500">*</span>
                </label>
                <select
                  value={recordPayment.feeId}
                  onChange={(e) => {
                    const feeId = e.target.value;
                    const rec = receivables.find(r => r.id === feeId);
                    setRecordPayment(s => ({
                      ...s,
                      feeId,
                      amount: rec ? String(rec.amount) : s.amount,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                >
                  <option value="">-- Select a pending fee --</option>
                  {receivables
                    .filter(r => r.status !== 'PAID')
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        {r.studentName} — {r.feeComponent.replace(/_/g, ' ')} — ₹{r.amount.toLocaleString('en-IN')} (Due {r.dueDate})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recordPayment.amount}
                    onChange={(e) => setRecordPayment(s => ({ ...s, amount: e.target.value }))}
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={recordPayment.paymentMethod}
                    onChange={(e) => setRecordPayment(s => ({ ...s, paymentMethod: e.target.value }))}
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                    <option value="ONLINE">Online</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Transaction Ref (optional)
                  </label>
                  <input
                    type="text"
                    value={recordPayment.transactionRef}
                    onChange={(e) => setRecordPayment(s => ({ ...s, transactionRef: e.target.value }))}
                    placeholder="UPI/cheque/UTR no."
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Receipt No. (optional)
                  </label>
                  <input
                    type="text"
                    value={recordPayment.receiptNumber}
                    onChange={(e) => setRecordPayment(s => ({ ...s, receiptNumber: e.target.value }))}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Notes (optional)
                </label>
                <textarea
                  value={recordPayment.notes}
                  onChange={(e) => setRecordPayment(s => ({ ...s, notes: e.target.value }))}
                  placeholder="Any remarks about this payment"
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm min-h-[60px]"
                />
              </div>

              {recordPayment.error && (
                <div className="p-3 rounded bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{recordPayment.error}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRecordPayment(s => ({ ...s, open: false }))}
                disabled={recordPayment.loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={submitRecordPayment}
                loading={recordPayment.loading}
                disabled={recordPayment.loading}
              >
                Record Payment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {detailsModal.open && detailsModal.row && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDetailsModal({ open: false, row: null })}
        >
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Receivable Details</h2>
              <button onClick={() => setDetailsModal({ open: false, row: null })} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {(() => {
              const r = detailsModal.row!;
              return (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><div className="text-gray-500 text-xs">Student</div><div className="font-medium">{r.studentName}</div></div>
                  <div><div className="text-gray-500 text-xs">Student ID</div><div className="font-mono text-xs">{r.studentId}</div></div>
                  <div><div className="text-gray-500 text-xs">Vertical</div><div>{r.vertical}</div></div>
                  <div><div className="text-gray-500 text-xs">Status</div><Badge variant={getStatusVariant(r.status)} size="sm">{r.status}</Badge></div>
                  <div><div className="text-gray-500 text-xs">Fee Component</div><div>{r.feeComponent.replace(/_/g, ' ')}</div></div>
                  <div><div className="text-gray-500 text-xs">Amount</div><div className="font-medium">₹{r.amount.toLocaleString('en-IN')}</div></div>
                  <div><div className="text-gray-500 text-xs">Due Date</div><div>{r.dueDate}</div></div>
                  <div><div className="text-gray-500 text-xs">Phone</div><div>{r.contact.phone || '—'}</div></div>
                  <div><div className="text-gray-500 text-xs">Email</div><div>{r.contact.email || '—'}</div></div>
                  <div><div className="text-gray-500 text-xs">Parent Phone</div><div>{r.contact.parentPhone || '—'}</div></div>
                  <div><div className="text-gray-500 text-xs">Created By</div><div>{r.audit.createdByRole}</div></div>
                  <div><div className="text-gray-500 text-xs">Created At</div><div>{r.audit.createdAt.split('T')[0]}</div></div>
                </div>
              );
            })()}
            <div className="flex gap-3 justify-end pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <Button variant="secondary" size="sm" onClick={() => { const row = detailsModal.row!; setDetailsModal({ open: false, row: null }); openCommLogs(row); }}>
                View Communications
              </Button>
              <Button variant="primary" size="sm" onClick={() => { const id = detailsModal.row!.id; setDetailsModal({ open: false, row: null }); openReminder([id]); }}>
                Send Reminder
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {reminderModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => !reminderModal.loading && setReminderModal(s => ({ ...s, open: false }))}
        >
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Send Reminder ({reminderModal.targetIds.length} recipient{reminderModal.targetIds.length !== 1 ? 's' : ''})
              </h2>
              <button onClick={() => !reminderModal.loading && setReminderModal(s => ({ ...s, open: false }))} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Channel</label>
                <select
                  value={reminderModal.channel}
                  onChange={e => setReminderModal(s => ({ ...s, channel: e.target.value as 'SMS' | 'WHATSAPP' | 'EMAIL' }))}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                >
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Message</label>
                <textarea
                  value={reminderModal.message}
                  onChange={e => setReminderModal(s => ({ ...s, message: e.target.value }))}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm min-h-[120px]"
                />
              </div>
              {reminderModal.error && (
                <div className="p-3 rounded bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{reminderModal.error}</p>
                </div>
              )}
              <p className="text-xs text-gray-500">
                The reminder is recorded in the communications log. Actual SMS/WhatsApp/Email delivery is handled by the notification gateway and may be processed asynchronously.
              </p>
            </div>
            <div className="flex gap-3 justify-end pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <Button variant="secondary" size="sm" onClick={() => setReminderModal(s => ({ ...s, open: false }))} disabled={reminderModal.loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={submitReminder} loading={reminderModal.loading} disabled={reminderModal.loading || !reminderModal.message.trim()}>
                Send
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Communication Logs Modal */}
      {commLogsModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setCommLogsModal({ open: false, receivable: null, logs: [], loading: false, error: null })}
        >
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Communication Logs {commLogsModal.receivable ? `— ${commLogsModal.receivable.studentName}` : ''}
              </h2>
              <button onClick={() => setCommLogsModal({ open: false, receivable: null, logs: [], loading: false, error: null })} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {commLogsModal.loading && <p className="text-sm text-gray-500">Loading…</p>}
            {commLogsModal.error && <p className="text-sm text-red-600">{commLogsModal.error}</p>}
            {!commLogsModal.loading && !commLogsModal.error && (
              commLogsModal.logs.length === 0 ? (
                <p className="text-sm text-gray-500">No communications recorded for this receivable.</p>
              ) : (
                <ul className="space-y-3">
                  {commLogsModal.logs.map((log: any) => (
                    <li key={log.id} className="border rounded p-3 text-sm" style={{ borderColor: 'var(--border-gray-200)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{log.purpose} — {log.channel}</span>
                        <Badge variant={log.status === 'SENT' || log.status === 'DELIVERED' ? 'success' : log.status === 'FAILED' ? 'error' : 'warning'} size="sm">
                          {log.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mb-1">
                        To {log.recipient_contact} · {new Date(log.created_at).toLocaleString()}
                      </div>
                      {log.subject && <div className="text-xs font-medium mb-1">{log.subject}</div>}
                      <div className="text-xs whitespace-pre-wrap">{log.message_body}</div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
