'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/forms/Input';
import { Button } from '@/components/shadcn/button-extended';
import { useLanguage } from '@/contexts/LanguageContext';

interface DraftSummary {
  id: string;
  trackingNumber: string;
  vertical: 'BOYS_HOSTEL' | 'GIRLS_ASHRAM' | 'DHARAMSHALA';
  createdAt: string;
}

const VERTICAL_PATH: Record<string, string> = {
  BOYS_HOSTEL: 'boys-hostel',
  GIRLS_ASHRAM: 'girls-ashram',
  DHARAMSHALA: 'dharamshala',
};

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function ResumeApplicationPanel() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState<'mobile' | 'otp' | 'list'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalizedMobile(): string {
    return mobile.replace(/\D/g, '').slice(-10);
  }

  async function handleSendOtp() {
    setError(null);
    const m = normalizedMobile();
    if (m.length !== 10 || !/^[6-9]/.test(m)) {
      setError(t('Enter a valid 10-digit mobile starting 6-9.', 'कृपया 6-9 से शुरू होने वाला 10 अंकों का मोबाइल दर्ज करें।'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: m, vertical: 'resume' }),
      });
      const json = await res.json();
      if (!res.ok || !json?.token) {
        throw new Error(json?.message || 'Failed to send OTP');
      }
      setOtpToken(json.token);
      setStep('otp');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    if (!/^\d{4,6}$/.test(otp)) {
      setError(t('Enter the OTP you received.', 'प्राप्त ओटीपी दर्ज करें।'));
      return;
    }
    setBusy(true);
    try {
      const verifyRes = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp, token: otpToken }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok || !verifyJson?.sessionToken) {
        throw new Error(verifyJson?.message || 'OTP verification failed');
      }
      const session: string = verifyJson.sessionToken;

      const draftsRes = await fetch('/api/applications/drafts-by-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: normalizedMobile(), sessionToken: session }),
      });
      const draftsJson = await draftsRes.json();
      if (!draftsRes.ok) {
        throw new Error(draftsJson?.error || 'Could not look up your application');
      }
      const list: DraftSummary[] = draftsJson?.data || [];
      if (list.length === 0) {
        setStep('list');
        setDrafts([]);
        return;
      }
      if (list.length === 1) {
        const d = list[0];
        router.push(`/apply/${VERTICAL_PATH[d.vertical]}/form?appId=${d.id}&tracking=${d.trackingNumber}`);
        return;
      }
      setDrafts(list);
      setStep('list');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function gotoDraft(d: DraftSummary) {
    router.push(`/apply/${VERTICAL_PATH[d.vertical]}/form?appId=${d.id}&tracking=${d.trackingNumber}`);
  }

  return (
    <div className="card">
      <div className="p-6 md:p-8">
        <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('Resume your application', 'अपना आवेदन फिर से शुरू करें')}
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t(
            'Already submitted but did not pay? Verify your mobile to jump back to the payment step.',
            'पहले आवेदन कर चुके हैं पर भुगतान नहीं किया? भुगतान पर लौटने के लिए अपना मोबाइल सत्यापित करें।',
          )}
        </p>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg border-l-4"
            style={{ backgroundColor: 'var(--color-red-50, #fef2f2)', borderLeftColor: 'var(--color-red-500, #ef4444)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--color-red-700, #b91c1c)' }}>{error}</p>
          </div>
        )}

        {step === 'mobile' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label={t('Mobile number', 'मोबाइल नंबर')}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9876543210"
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <Button variant="primary" onClick={handleSendOtp} disabled={busy} loading={busy}>
              {t('Send OTP', 'ओटीपी भेजें')}
            </Button>
          </div>
        )}

        {step === 'otp' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label={t(`OTP sent to ${normalizedMobile()}`, `${normalizedMobile()} पर भेजा गया OTP`)}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <Button variant="primary" onClick={handleVerifyOtp} disabled={busy} loading={busy}>
              {t('Verify & resume', 'सत्यापित करें')}
            </Button>
          </div>
        )}

        {step === 'list' && drafts.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('No saved application found for this mobile. Start a new one above.', 'इस मोबाइल के लिए कोई सहेजा हुआ आवेदन नहीं मिला। ऊपर नया प्रारंभ करें।')}
          </p>
        )}

        {step === 'list' && drafts.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('Pick the application you want to pay for:', 'जिस आवेदन का भुगतान करना है उसे चुनें:')}
            </p>
            {drafts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => gotoDraft(d)}
                className="text-left p-3 rounded-lg border hover:bg-gray-50"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {d.vertical === 'BOYS_HOSTEL'
                    ? t('Boys Hostel', 'बालक छात्रावास')
                    : d.vertical === 'GIRLS_ASHRAM'
                    ? t('Girls Ashram', 'बालिका आश्रम')
                    : t('Dharamshala', 'धर्मशाला')}
                  {' — '}
                  <span className="font-mono">{d.trackingNumber}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t(`Started ${relativeDays(d.createdAt)}`, `${relativeDays(d.createdAt)} शुरू किया गया`)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
