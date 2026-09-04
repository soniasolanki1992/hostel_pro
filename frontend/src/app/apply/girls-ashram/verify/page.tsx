'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle, AlertCircle, RefreshCw, EyeOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function GirlsAshramVerifyPage() {
  const { t } = useLanguage();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isVerifying, setIsVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [sentTo, setSentTo] = useState<'mobile' | 'email'>('mobile');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    try {
      setSentTo(localStorage.getItem('otp_verified_email') ? 'email' : 'mobile');
    } catch {
      /* localStorage unavailable — default to mobile */
    }
  }, []);

  useEffect(() => {
    if (timeLeft > 0 && !isVerifying) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, isVerifying]);

  useEffect(() => {
    const firstEmptyIndex = otp.findIndex((digit, index) => digit === '' && index < 6);
    if (firstEmptyIndex !== -1 && inputRefs.current[firstEmptyIndex]) {
      inputRefs.current[firstEmptyIndex]?.focus();
    }
  }, [otp]);

  const handleInputChange = (index: number, value: string) => {
    if ((/^\d*$/.test(value) && value.length <= 1) || value === '') {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      setErrors([]);
      
      if (value && index < 5) {
        setTimeout(() => {
          const nextIndex = index + 1;
          const nextField = inputRefs.current[nextIndex];
          if (nextField) {
            nextField.focus();
          }
        }, 100);
      }
      
      if (value === '' && index > 0) {
        setTimeout(() => {
          const prevIndex = index - 1;
          const prevField = inputRefs.current[prevIndex];
          if (prevField && otp[prevIndex] !== '') {
            prevField.focus();
          }
        }, 50);
      }
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    
    if (/^\d{6}$/.test(pastedData)) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      setErrors([]);
      
      setTimeout(() => {
        const lastFilledIndex = newOtp.findIndex(digit => digit !== '');
        if (lastFilledIndex !== -1 && lastFilledIndex < 5) {
          const nextField = inputRefs.current[lastFilledIndex + 1];
          if (nextField) {
            nextField.focus();
          }
        }
      }, 100);
    } else {
      setErrors(['Please paste a valid 6-digit OTP']);
    }
  }, []);

  const isOTPValid = useCallback(() => {
    const otpValue = otp.join('');
    return otpValue.length === 6 && /^\d{6}$/.test(otpValue) && attempts < 3;
  }, [otp, attempts]);

  const validateOTP = useCallback(() => {
    const otpValue = otp.join('');
    const newErrors: string[] = [];

    if (otpValue.length === 0) {
      newErrors.push('Please enter the OTP received on your mobile');
    } else if (otpValue.length < 6) {
      newErrors.push(`Please enter all 6 digits (${6 - otpValue.length} remaining)`);
    } else if (!/^\d{6}$/.test(otpValue)) {
      newErrors.push('OTP must contain only numbers');
    } else if (attempts >= 3) {
      newErrors.push('Too many failed attempts. Please request a new OTP or contact support.');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  }, [otp, attempts]);

  const handleVerify = useCallback(async () => {
    if (!validateOTP() || isVerifying || isLoading) return;

    setIsVerifying(true);
    setErrors([]);
    const otpValue = otp.join('');
    setAttempts(prev => prev + 1);

    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: otpValue,
          token: new URLSearchParams(window.location.search).get('token'),
          attempts: attempts + 1,
          userAgent: navigator.userAgent
        })
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.sessionToken) {
          try {
            localStorage.setItem('applicant_session_token', data.sessionToken);
          } catch {
            /* non-fatal */
          }
        }
        setTimeout(() => {
          window.location.href = '/apply/girls-ashram/form';
        }, 500);
      } else {
        const error = await response.json();
        setErrors([error.message || 'Invalid OTP. Please check and try again.']);
      }
    } catch (err) {
      setErrors(['Network error. Please check your connection and try again.']);
    } finally {
      setIsVerifying(false);
    }
  }, [validateOTP, isVerifying, isLoading, attempts]);

  const handleResend = useCallback(async () => {
    if (timeLeft > 0 || isLoading) return;

    try {
      const response = await fetch('/api/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: new URLSearchParams(window.location.search).get('token'),
          reason: 'user_request'
        })
      });

      if (response.ok) {
        const data = await response.json();
        // The resend issues a NEW token (email tokens embed a fresh OTP hash).
        // Update the URL so verification uses the new token, not the stale one.
        if (data.token) {
          const url = new URL(window.location.href);
          url.searchParams.set('token', data.token);
          window.history.replaceState({}, '', url.toString());
        }
        setTimeLeft(60);
        setOtp(['', '', '', '', '', '']);
        setErrors([]);
        setAttempts(0);
      } else {
        setErrors(['Too many resend attempts. Please wait 10 minutes or contact support.']);
      }
    } catch (err) {
      setErrors(['Network error. Please try again later.']);
    }
  }, [timeLeft, isLoading]);

  useEffect(() => {
    inputRefs.current = Array.from({ length: 6 }, () => null);
  }, []);

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newOtp = [...otp];
      if (otp[index] !== '') {
        newOtp[index] = '';
      } else if (index > 0) {
        newOtp[index - 1] = '';
      }
      setOtp(newOtp);
      
      setTimeout(() => {
        const prevIndex = index > 0 ? index - 1 : 0;
        const prevField = inputRefs.current[prevIndex];
        if (prevField) {
          prevField.focus();
        }
      }, 50);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = index > 0 ? index - 1 : 0;
      const prevField = inputRefs.current[prevIndex];
      if (prevField) {
        prevField.focus();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = index < 5 ? index + 1 : 0;
      const nextField = inputRefs.current[nextIndex];
      if (nextField) {
        nextField.focus();
      }
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      <header
        className="px-6 py-4 border-b"
        style={{
          backgroundColor: "var(--surface-primary)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/apply/girls-ashram/contact" className="flex items-center gap-3">
            <ArrowLeft className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
            <div>
              <h1
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
              >
                {t('Girls Ashram Application', 'बालिका आश्रम आवेदन')}</h1>
              <p className="text-caption">{t('Step 3 of 4', 'चरण 3 का 4')}</p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="nav-link">{t('Home', 'होम')}</Link>
              <Link href="/apply" className="nav-link">{t('Apply Now', 'अभी आवेदन करें')}</Link>
              <Link href="/check-status" className="nav-link">{t('Check Status', 'स्थिति जांचें')}</Link>
              <Link href="/login" className="nav-link">{t('Login', 'लॉगिन')}</Link>
            </nav>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <section className="px-6 py-4" style={{ backgroundColor: "var(--surface-secondary)" }}>
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-accent)" }}
                >
                  1
                </div>
                <span className="hidden md:inline text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {t('Select Vertical', 'श्रेणी चुनें')}</span>
              </div>
              <div className="h-px w-8 md:w-16" style={{ backgroundColor: "var(--border-primary)" }}></div>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-accent)" }}
                >
                  2
                </div>
                <span className="hidden md:inline text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {t('Contact Details', 'संपर्क विवरण')}</span>
              </div>
              <div className="h-px w-8 md:w-16" style={{ backgroundColor: "var(--border-primary)" }}></div>
              <div className="flex items-center gap-2 opacity-50">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--color-gray-400)" }}
                >
                  3
                </div>
                <span className="hidden md:inline text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {t('OTP Verification', 'ओटीपी सत्यापन')}</span>
              </div>
            </div>
            <div className="text-sm ml-4 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
              <span>{t('Step 3 of 4', 'चरण 3 का 4')}</span>
              {timeLeft > 0 && (
                <span className="ml-4" style={{ color: "var(--text-primary)" }}>
                  Expires in: {formatTime(timeLeft)}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              {t('Enter OTP Code', 'ओटीपी कोड दर्ज करें')}</h2>
            <p className="text-lg mb-8" style={{ color: "var(--text-secondary)" }}>
              {sentTo === 'email'
                ? t('We have sent a 6-digit One-Time Password to your email address', 'हमने आपके ईमेल पते पर 6 अंकों का ओटीपी भेजा है')
                : t('We have sent a 6-digit One-Time Password to your mobile number', 'हमने आपके मोबाइल नंबर पर 6 अंकों का ओटीपी भेजा है')}</p>
          </div>

          <div className="card p-8 mb-8">
            <h3 className="text-xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
              {t('Enter the 6-digit code', '6 अंकों का कोड दर्ज करें')}</h3>
            <div className="flex justify-center gap-3 mb-6">
              {otp.map((digit, index) => (
                <div key={index} className="relative">
                  <input
                    id={`otp-${index}`}
                    type={timeLeft > 0 ? 'password' : 'text'}
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    disabled={isVerifying || timeLeft === 0}
                    autoComplete="one-time-code"
                    aria-label={`OTP digit ${index + 1}`}
                    className={`w-16 h-16 text-2xl font-bold text-center border-2 rounded-lg transition-all ${
                      errors.length > 0 ? 'border-red-500' : 'border-purple-500'
                    } ${
                      errors.length > 0 ? 'bg-red-50' : timeLeft === 0 ? 'bg-gray-100' : 'bg-white'
                    } ${
                      errors.length > 0 ? 'text-red-600' : timeLeft === 0 ? 'text-gray-400' : 'var(--text-primary)'
                    } ${isVerifying ? 'cursor-not-allowed' : 'cursor-text'}`}
                    style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}
                    ref={(el) => { inputRefs.current[index] = el; }}
                  />
                  {timeLeft === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
                      <EyeOff className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center mb-6">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                <strong>Tip:</strong> Enter the 6-digit code sent to your {sentTo === 'email' ? 'email address' : 'mobile number'}. The code is valid for 10 minutes.
              </p>
              {sentTo === 'email' && (
                <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                  {t('Note: For OTP please check spam box.', 'नोट: OTP के लिए कृपया स्पैम बॉक्स जांचें।')}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleVerify}
                disabled={isVerifying || !isOTPValid()}
                className="btn-primary flex-1 flex items-center justify-center gap-2 text-lg py-4"
              >
                {isVerifying ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                ) : (
                  <>
                    {t('Verify & Continue', 'सत्यापित करें और आगे बढ़ें')}
                <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
              
              <button
                onClick={handleResend}
                disabled={timeLeft > 0}
                className="btn-outline flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {timeLeft > 0 ? `Resend in ${formatTime(timeLeft)}` : 'Resend OTP'}
              </button>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="card p-4 border-l-4 mb-6" style={{ borderLeftColor: "var(--color-red-500)" }}>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold mb-2" style={{ color: "var(--color-red-600)" }}>
                    {t('Verification Failed', 'सत्यापन विफल')}</h4>
                  <ul className="space-y-1 text-sm">
                    {errors.map((error, index) => (
                      <li key={index} style={{ color: "var(--color-red-600)" }}>
                        • {error}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="text-center">
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              {t('Did not receive the OTP?', 'ओटीपी प्राप्त नहीं हुआ?')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="tel:+919769610214"
                className="text-purple-600 hover:text-purple-800 font-medium"
              >
                {t('Call Girls Ashram Office: +91 9769610214', 'बालिका आश्रम कार्यालय: +91 9769610214')}</Link>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t('or', 'या')}</span>
              <button
                onClick={() => window.location.href = '/apply/girls-ashram/contact'}
                className="text-purple-600 hover:text-purple-800 font-medium"
              >
                {t('Try Different Contact Method', 'अन्य संपर्क माध्यम आज़माएं')}</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
