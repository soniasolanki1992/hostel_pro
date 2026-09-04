'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/shadcn/badge-extended';
import { Button } from '@/components/shadcn/button-extended';
import { Table } from '@/components/data/Table';
import { Spinner } from '@/components/feedback/Spinner';
import { FileText } from 'lucide-react';
import type { TableColumn } from '@/components/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmergencyInfoModal } from '@/components/EmergencyInfoModal';

interface Resident {
  id: string;
  name: string;
  mobile: string;
  email: string;
  vertical: string;
  roomNumber: string;
  checkedInAt: string;
  status: string;
  allocationId: string;
}

export default function ResidentsPage() {
  const { t } = useLanguage();
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [residentDocs, setResidentDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [resetPasswordState, setResetPasswordState] = useState<{
    loading: boolean;
    tempPassword: string | null;
    error: string | null;
  }>({ loading: false, tempPassword: null, error: null });
  const [emergencyResident, setEmergencyResident] = useState<Resident | null>(null);

  const handleResetPassword = async (resident: Resident) => {
    setResetPasswordState({ loading: true, tempPassword: null, error: null });
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/superintendent/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: resident.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetPasswordState({ loading: false, tempPassword: data.data.tempPassword, error: null });
      } else {
        setResetPasswordState({ loading: false, tempPassword: null, error: data.error || 'Failed to reset password' });
      }
    } catch {
      setResetPasswordState({ loading: false, tempPassword: null, error: 'Failed to reset password' });
    }
  };

  const openResidentDetails = async (resident: Resident) => {
    setSelectedResident(resident);
    setResidentDocs([]);
    setResetPasswordState({ loading: false, tempPassword: null, error: null });
    setDocsLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/student/documents?studentId=${resident.id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const docs = Array.isArray(data) ? data : (data.data || []);
        setResidentDocs(docs);
      }
    } catch {
      // Documents are optional
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    fetchResidents();
  }, []);

  const fetchResidents = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Fetch allocations and rooms
      const [allocRes, roomsRes] = await Promise.all([
        fetch('/api/allocations', { headers }),
        fetch('/api/rooms', { headers }),
      ]);

      if (!allocRes.ok || !roomsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const allocData = await allocRes.json();
      const roomsData = await roomsRes.json();

      const allocations = allocData.data || allocData || [];
      const rooms = roomsData.data || roomsData || [];

      // Build room lookup
      const roomMap: Record<string, string> = {};
      for (const room of (Array.isArray(rooms) ? rooms : [])) {
        roomMap[room.id] = room.room_number;
      }

      // Get active allocations with check-in confirmed
      const activeAllocations = (Array.isArray(allocations) ? allocations : [])
        .filter((a: any) => a.status === 'ACTIVE');

      // Fetch user details for each allocation
      const residentList: Resident[] = [];
      for (const alloc of activeAllocations) {
        try {
          const userRes = await fetch(`/api/users/profile?user_id=${alloc.student_id}`, { headers });
          if (userRes.ok) {
            const userData = await userRes.json();
            const user = userData.data || userData;
            residentList.push({
              id: user.id || alloc.student_id,
              allocationId: alloc.id,
              name: user.full_name || 'Unknown',
              mobile: user.mobile || '',
              email: user.email || '',
              vertical: user.vertical || '',
              roomNumber: roomMap[alloc.room_id] || 'N/A',
              checkedInAt: alloc.check_in_confirmed_at
                ? new Date(alloc.check_in_confirmed_at).toLocaleDateString('en-IN')
                : alloc.allocated_at
                  ? new Date(alloc.allocated_at).toLocaleDateString('en-IN')
                  : 'N/A',
              status: alloc.check_in_confirmed ? 'CHECKED_IN' : 'ALLOCATED',
            });
          }
        } catch {
          // Skip failed user lookups
        }
      }

      setResidents(residentList);
    } catch (err: any) {
      setError(err.message || 'Failed to load residents');
    } finally {
      setLoading(false);
    }
  };

  const filteredResidents = residents.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.mobile.includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.roomNumber.toLowerCase().includes(q)
    );
  });

  const columns: TableColumn<Resident>[] = [
    {
      key: 'name',
      header: t('Name', 'नाम'),
      sortable: true,
      render: (_: any, row: Resident) => (
        <div>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.name}</p>
          <p className="text-xs text-gray-500">{row.email || row.mobile}</p>
        </div>
      ),
    },
    {
      key: 'roomNumber',
      header: t('Room', 'कमरा'),
      sortable: true,
      render: (_: any, row: Resident) => (
        <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
          {row.roomNumber}
        </span>
      ),
    },
    {
      key: 'mobile',
      header: t('Mobile', 'मोबाइल'),
    },
    {
      key: 'checkedInAt',
      header: t('Checked In', 'चेक इन'),
    },
    {
      key: 'status',
      header: t('Status', 'स्थिति'),
      render: (_: any, row: Resident) => (
        <Badge
          variant={row.status === 'CHECKED_IN' ? 'success' : 'warning'}
          size="sm"
        >
          {row.status === 'CHECKED_IN' ? t('Checked In', 'चेक इन') : t('Allocated', 'आवंटित')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('Actions', 'कार्रवाई'),
      render: (_: any, row: Resident) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openResidentDetails(row)}
          >
            {t('View Details', 'विवरण देखें')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEmergencyResident(row)}
            style={{ background: '#dc2626', borderColor: '#dc2626' }}
            aria-label={`Emergency info for ${row.name}`}
          >
            🚨 {t('Emergency', 'आपातकाल')}
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
        <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>
          {t('Loading residents...', 'निवासी लोड हो रहे हैं...')}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <Button variant="secondary" size="sm" onClick={fetchResidents}>
          {t('Retry', 'पुनः प्रयास')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Current Residents', 'वर्तमान निवासी')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('Students currently allocated and checked into rooms', 'वर्तमान में कमरों में आवंटित और चेक इन किए गए छात्र')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            {filteredResidents.length} {t('residents', 'निवासी')}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)' }}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Total Residents', 'कुल निवासी')}</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{residents.length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)' }}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Checked In', 'चेक इन')}</p>
          <p className="text-2xl font-bold text-green-600">
            {residents.filter(r => r.status === 'CHECKED_IN').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)' }}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('Pending Check-in', 'चेक-इन लंबित')}</p>
          <p className="text-2xl font-bold text-amber-600">
            {residents.filter(r => r.status === 'ALLOCATED').length}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('Search by name, mobile, email, or room...', 'नाम, मोबाइल, ईमेल, या कमरे से खोजें...')}
          className="w-full px-4 py-2 border rounded-lg text-sm"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Table */}
      <Table
        data={filteredResidents}
        columns={columns}
        emptyMessage={t('No residents found', 'कोई निवासी नहीं मिला')}
      />

      {/* Emergency Info Modal */}
      {emergencyResident && (
        <EmergencyInfoModal
          studentId={emergencyResident.id}
          studentName={emergencyResident.name}
          onClose={() => setEmergencyResident(null)}
        />
      )}

      {/* Resident Detail Panel */}
      {selectedResident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('Resident Details', 'निवासी विवरण')}
              </h2>
              <button onClick={() => setSelectedResident(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('Name', 'नाम')}</p>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedResident.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('Room', 'कमरा')}</p>
                  <p className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{selectedResident.roomNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('Mobile', 'मोबाइल')}</p>
                  <p style={{ color: 'var(--text-primary)' }}>{selectedResident.mobile || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('Email', 'ईमेल')}</p>
                  <p style={{ color: 'var(--text-primary)' }}>{selectedResident.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('Checked In', 'चेक इन')}</p>
                  <p style={{ color: 'var(--text-primary)' }}>{selectedResident.checkedInAt}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t('Status', 'स्थिति')}</p>
                  <Badge variant={selectedResident.status === 'CHECKED_IN' ? 'success' : 'warning'} size="sm">
                    {selectedResident.status === 'CHECKED_IN' ? t('Checked In', 'चेक इन') : t('Allocated', 'आवंटित')}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Documents Section */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                {t('Documents', 'दस्तावेज़')}
              </h3>
              {docsLoading ? (
                <p className="text-sm text-gray-500">{t('Loading documents...', 'दस्तावेज़ लोड हो रहे हैं...')}</p>
              ) : residentDocs.length > 0 ? (
                <div className="space-y-2">
                  {residentDocs.map((doc: any, index: number) => {
                    const typeLabels: Record<string, string> = {
                      'AADHAAR_CARD': 'Aadhaar Card',
                      'PHOTOGRAPH': 'Passport Photo',
                      'BIRTH_CERTIFICATE': 'Birth Certificate',
                      'EDUCATION_CERTIFICATE': 'Academic Document',
                      'INCOME_CERTIFICATE': 'Income Certificate',
                      'OTHER': 'Other Document',
                    };
                    const label = typeLabels[doc.category] || doc.title || doc.category || 'Document';
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-2 rounded border cursor-pointer hover:shadow-sm transition-shadow"
                        style={{ borderColor: 'var(--border-primary)' }}
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('authToken');
                            const res = await fetch(`/api/student/documents/${doc.id}/url`, {
                              headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
                            });
                            const data = await res.json();
                            if (data.success && data.url) window.open(data.url, '_blank');
                            else alert('Failed to open document');
                          } catch {
                            alert('Failed to open document');
                          }
                        }}
                      >
                        <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</p>
                          <p className="text-xs text-gray-500">{doc.type || doc.size || ''}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">{t('No documents uploaded', 'कोई दस्तावेज़ अपलोड नहीं किए गए')}</p>
              )}
            </div>

            {/* Reset Password Section */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                {t('Account Management', 'खाता प्रबंधन')}
              </h3>

              {resetPasswordState.tempPassword ? (
                <div className="p-3 rounded border bg-green-50" style={{ borderColor: '#bbf7d0' }}>
                  <p className="text-sm font-medium text-green-800 mb-1">
                    {t('Password reset successfully!', 'पासवर्ड सफलतापूर्वक रीसेट हो गया!')}
                  </p>
                  <p className="text-xs text-green-700 mb-2">
                    {t('Share this temporary password with the resident. They will be asked to set a new password on next login.', 'यह अस्थायी पासवर्ड निवासी को दें। अगले लॉगिन पर वे नया पासवर्ड सेट करेंगे।')}
                  </p>
                  <div className="flex items-center gap-2 p-2 bg-white rounded border font-mono text-sm" style={{ borderColor: '#bbf7d0' }}>
                    <span className="flex-1 font-bold tracking-wider">{resetPasswordState.tempPassword}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(resetPasswordState.tempPassword!)}
                      className="text-xs text-green-700 hover:text-green-900 underline"
                    >
                      {t('Copy', 'कॉपी')}
                    </button>
                  </div>
                </div>
              ) : resetPasswordState.error ? (
                <div className="p-3 rounded border bg-red-50 mb-3" style={{ borderColor: '#fca5a5' }}>
                  <p className="text-sm text-red-700">{resetPasswordState.error}</p>
                </div>
              ) : null}

              {!resetPasswordState.tempPassword && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={resetPasswordState.loading}
                  disabled={resetPasswordState.loading}
                  onClick={() => {
                    if (confirm(t(
                      `Reset password for ${selectedResident?.name}? A temporary password will be generated.`,
                      `${selectedResident?.name} का पासवर्ड रीसेट करें? एक अस्थायी पासवर्ड बनाया जाएगा।`
                    ))) {
                      handleResetPassword(selectedResident!);
                    }
                  }}
                >
                  {t('Reset Password', 'पासवर्ड रीसेट करें')}
                </Button>
              )}
            </div>

            <div className="mt-4 pt-4 border-t flex justify-end" style={{ borderColor: 'var(--border-primary)' }}>
              <Button variant="secondary" onClick={() => setSelectedResident(null)}>
                {t('Close', 'बंद करें')}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
