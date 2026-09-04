'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/shadcn/button-extended';
import { Spinner } from '@/components/feedback/Spinner';
import { useLanguage } from '@/contexts/LanguageContext';

interface ContactBlock {
  name?: string | null;
  mobile?: string | null;
  relationship?: string | null;
  occupation?: string | null;
  email?: string | null;
}

interface EmergencyData {
  student: {
    id: string;
    name: string;
    mobile: string | null;
    email: string | null;
    vertical: string | null;
    bloodGroup: string | null;
    dateOfBirth: string | null;
    gender: string | null;
  };
  father: ContactBlock;
  mother: ContactBlock;
  localGuardian: ContactBlock;
  emergencyContact: ContactBlock;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    pinCode: string | null;
  };
  medicalNotes: string | null;
  application: { id: string; trackingNumber: string; status: string } | null;
}

interface Props {
  studentId?: string;
  applicationId?: string;
  studentName: string;
  onClose: () => void;
}

export function EmergencyInfoModal({ studentId, applicationId, studentName, onClose }: Props) {
  const { t } = useLanguage();
  const [data, setData] = useState<EmergencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('authToken');
        const url = applicationId
          ? `/api/applications/${applicationId}/emergency`
          : `/api/students/${studentId}/emergency`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load emergency info');
        }
        if (!cancelled) setData(json.data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load emergency info');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [studentId, applicationId]);

  const renderContact = (label: string, c: ContactBlock | undefined) => {
    if (!c || (!c.name && !c.mobile)) return null;
    return (
      <div className="rounded border p-3" style={{ borderColor: 'var(--border-primary)' }}>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">{label}</p>
        {c.name && (
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
        )}
        {c.relationship && (
          <p className="text-xs text-gray-500">{c.relationship}</p>
        )}
        {c.occupation && (
          <p className="text-xs text-gray-500">{c.occupation}</p>
        )}
        {c.mobile && (
          <p className="text-sm mt-1">
            <a href={`tel:${c.mobile}`} className="text-blue-600 hover:underline">
              📞 {c.mobile}
            </a>
          </p>
        )}
        {c.email && (
          <p className="text-xs text-gray-500 mt-1">
            <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-red-600 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              🚨 {t('Emergency Information', 'आपातकालीन जानकारी')}
            </h2>
            <p className="text-sm opacity-90 mt-1">{studentName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white text-2xl hover:opacity-80"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
              <span className="ml-3 text-gray-600">{t('Loading...', 'लोड हो रहा है...')}</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-5">
              {/* Critical info banner */}
              <div className="rounded-lg p-4 border-2 border-red-200 bg-red-50">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700 font-medium">{t('Blood Group', 'रक्त समूह')}</p>
                    <p className="text-2xl font-bold text-red-700 mt-1">
                      {data.student.bloodGroup || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700 font-medium">{t('Student Mobile', 'छात्र मोबाइल')}</p>
                    {data.student.mobile ? (
                      <a href={`tel:${data.student.mobile}`} className="text-lg font-semibold text-red-700 hover:underline mt-1 block">
                        {data.student.mobile}
                      </a>
                    ) : (
                      <p className="text-lg font-semibold text-red-700 mt-1">—</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Emergency Contact (highlighted) */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Emergency Contact', 'आपातकालीन संपर्क')}</h3>
                {data.emergencyContact.name || data.emergencyContact.mobile ? (
                  renderContact(t('Emergency Contact', 'आपातकालीन संपर्क'), data.emergencyContact)
                ) : (
                  <p className="text-sm text-gray-400 italic">{t('Not provided', 'प्रदान नहीं किया गया')}</p>
                )}
              </div>

              {/* Parents */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Parents', 'माता-पिता')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {renderContact(t('Father', 'पिता'), data.father) || (
                    <div className="text-sm text-gray-400 italic p-3">{t('Father info not provided', 'पिता की जानकारी नहीं')}</div>
                  )}
                  {renderContact(t('Mother', 'माता'), data.mother) || (
                    <div className="text-sm text-gray-400 italic p-3">{t('Mother info not provided', 'माता की जानकारी नहीं')}</div>
                  )}
                </div>
              </div>

              {/* Local Guardian */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Local Guardian', 'स्थानीय अभिभावक')}</h3>
                {renderContact(t('Local Guardian', 'स्थानीय अभिभावक'), data.localGuardian) || (
                  <p className="text-sm text-gray-400 italic">{t('Not provided', 'प्रदान नहीं किया गया')}</p>
                )}
              </div>

              {/* Medical/Special notes */}
              {data.medicalNotes && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Medical / Special Notes', 'चिकित्सा / विशेष नोट्स')}</h3>
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 whitespace-pre-wrap">
                    {data.medicalNotes}
                  </div>
                </div>
              )}

              {/* Address */}
              {(data.address.line1 || data.address.city) && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Permanent Address', 'स्थायी पता')}</h3>
                  <div className="rounded border p-3 text-sm" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
                    {[data.address.line1, data.address.line2, data.address.city, data.address.state, data.address.pinCode]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-6 py-3 flex justify-end" style={{ borderColor: 'var(--border-primary)' }}>
          <Button variant="secondary" onClick={onClose}>{t('Close', 'बंद करें')}</Button>
        </div>
      </div>
    </div>
  );
}
