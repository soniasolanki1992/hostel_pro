'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Input } from '../../components/forms/Input';
import { Button } from '@/components/shadcn/button-extended';
import { cn } from '../../components/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function TrackingPage() {
  const { t } = useLanguage();
  const [trackingId, setTrackingId] = useState('');
  const [mobile, setMobile] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [step, setStep] = useState<'input' | 'otp' | 'loading'>('input');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [otpToken, setOtpToken] = useState('');

  const handleTrackingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingId.trim() || !mobile.trim()) {
      setError('Please enter both tracking ID and mobile number');
      return;
    }

    setError('');
    setStep('loading');

    try {
      const response = await fetch('/api/applications/track/' + trackingId);
      const result = await response.json();

      if (!response.ok || !result.data) {
        setError('Application not found with this tracking ID');
        setStep('input');
        return;
      }

      const appData = result.data.data || result.data;
      const normalize = (m: string) => (m || '').replace(/[\s+\-]/g, '').slice(-10);
      const normalizedMobile = normalize(mobile);

      // Check all possible mobile fields in the application
      const mobilesToCheck = [
        appData.applicant_mobile,
        appData.data?.guardian_info?.father_mobile,
        appData.data?.guardian_info?.mother_mobile,
        appData.data?.guardian_info?.guardian_mobile,
        appData.data?.emergency_contact?.mobile,
      ].map(normalize);

      if (!mobilesToCheck.includes(normalizedMobile)) {
        setError('Mobile number does not match the application');
        setStep('input');
        return;
      }

      // Send OTP (use 10-digit number without +91)
      // Map vertical values to expected format
      const verticalMap: Record<string, string> = {
        'BOYS_HOSTEL': 'boys-hostel',
        'GIRLS_ASHRAM': 'girls-ashram',
        'DHARAMSHA': 'dharamshala'
      };
      const verticalKey = appData.vertical?.toUpperCase() || 'BOYS_HOSTEL';
      const vertical = verticalMap[verticalKey] || 'boys-hostel';

      const otpResponse = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedMobile, channel, vertical })
      });

      const otpData = await otpResponse.json();
      
      if (otpData.token) {
        setOtpToken(otpData.token);
      }

      setStep('otp');
      setResendTimer(60);
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      setError('Failed to verify application. Please try again.');
      setStep('input');
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setError('');
    setStep('loading');

    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp, token: otpToken })
      });

      if (response.ok) {
        window.location.href = `/track/${trackingId}`;
      } else {
        setError('Invalid OTP. Please try again.');
        setStep('otp');
      }
    } catch (err) {
      setError('Failed to verify OTP. Please try again.');
      setStep('otp');
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;

    try {
      const resendResponse = await fetch('/api/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: otpToken })
      });
      const resendData = await resendResponse.json().catch(() => null);
      if (resendData?.token) {
        setOtpToken(resendData.token);
      }
      setResendTimer(60);
      setError('');
    } catch (err) {
      setError('Failed to resend OTP. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Hirachand Gumanji Family Charitable Trust"
              width={48}
              height={48}
              className="h-12 w-auto"
            />
            <div>
              <h1 className="text-lg font-semibold">{t('Hirachand Gumanji Family', 'हीराचंद गुमानजी परिवार')}</h1>
              <p className="text-caption">{t('Charitable Trust', 'चैरिटेबल ट्रस्ट')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              {t('← Back to Home', '← होम पर वापस')}</Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-12">
        <div className="mx-auto max-w-md">
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">{t('Track Your Application', 'अपना आवेदन ट्रैक करें')}</h2>
              <p className="text-gray-600">{t('Enter your tracking ID and mobile number to view your application status', 'अपने आवेदन की स्थिति देखने के लिए ट्रैकिंग आईडी और मोबाइल नंबर दर्ज करें')}</p>
            </div>

            {step === 'input' && (
              <form onSubmit={handleTrackingSubmit} className="space-y-6">
                <Input
                  id="trackingId"
                  label={t('Tracking ID', 'ट्रैकिंग आईडी')}
                  type="text"
                  placeholder="e.g., BH2024001"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                  required
                  helperText={t('Enter the tracking number from your application confirmation', 'अपने आवेदन की पुष्टि से ट्रैकिंग नंबर दर्ज करें')}
                  autoFocus
                />

                <Input
                  id="mobile"
                  label={t('Mobile Number', 'मोबाइल नंबर')}
                  type="tel"
                  placeholder="+91XXXXXXXXXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                  helperText={t('Enter the mobile number used during application', 'आवेदन के दौरान उपयोग किया गया मोबाइल नंबर दर्ज करें')}
                />

                <div>
                  <p className="text-sm font-medium mb-2 text-gray-700">{t('Send OTP via', 'OTP कैसे भेजें')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setChannel('sms')}
                      className={cn(
                        'py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all',
                        channel === 'sms' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      )}
                    >
                      {t('SMS', 'एसएमएस')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('whatsapp')}
                      className={cn(
                        'py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all',
                        channel === 'whatsapp' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      )}
                    >
                      {t('WhatsApp', 'व्हाट्सएप')}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full">
                  {t('Continue', 'आगे बढ़ें')}</Button>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <Input
                  id="otp"
                  label={t('Enter OTP', 'ओटीपी दर्ज करें')}
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  helperText={`OTP sent to ${mobile}`}
                />

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full">
                  {t('Verify OTP', 'ओटीपी सत्यापित करें')}</Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendTimer > 0}
                    className={cn(
                      'text-sm',
                      resendTimer > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:underline'
                    )}
                  >
                    {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}

            {step === 'loading' && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">{t('Processing...', 'प्रोसेसिंग...')}</p>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-1">{t('Secure Tracking', 'सुरक्षित ट्रैकिंग')}</h4>
                  <p className="text-sm text-gray-600">
                    Your tracking ID and mobile number are used only to verify your identity and retrieve your application status.
                    All data transmission is encrypted and complies with DPDP Act, 2023.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                Need help? Contact our admissions team at{' '}
                <a href="tel:+912224141234" className="text-blue-600 hover:underline">+91 22 2414 1234</a>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}