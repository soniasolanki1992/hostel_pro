'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Shield, RefreshCw, Phone, Mail, Clock, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function GirlsAshramContactPage() {
  const { t } = useLanguage();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [contactMethod, setContactMethod] = useState<'phone' | 'whatsapp' | 'email'>('phone');
  const [otpSent, setOtpSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const isInputValid = () => {
    if (contactMethod !== 'email') {
      return phoneNumber && /^[6-9]\d{9}$/.test(phoneNumber);
    } else {
      return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
  };

  const validateInput = () => {
    const newErrors: string[] = [];

    if (contactMethod !== 'email' && !phoneNumber) {
      newErrors.push('Phone number is required');
    } else if (contactMethod !== 'email' && !/^[6-9]\d{9}$/.test(phoneNumber)) {
      newErrors.push('Please enter a valid 10-digit phone number');
    }

    if (contactMethod === 'email' && !email) {
      newErrors.push('Email is required');
    } else if (contactMethod === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.push('Please enter a valid email address');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSendOTP = async () => {
    if (!validateInput()) return;
    
    setOtpSent(true);
    setResendTimer(60);
    
    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(contactMethod === 'email' ? { email } : { phone: phoneNumber }),
          channel: contactMethod === 'phone' ? 'sms' : contactMethod === 'whatsapp' ? 'whatsapp' : 'email',
          vertical: 'girls-ashram'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Fresh application flow — clear any prior draft/identifiers so the form starts blank
        localStorage.removeItem('application_draft_girls-ashram');
        localStorage.removeItem('otp_verified_mobile');
        localStorage.removeItem('otp_verified_email');
        if (contactMethod === 'email') {
          localStorage.setItem('otp_verified_email', email);
        } else {
          localStorage.setItem('otp_verified_mobile', phoneNumber);
        }
        localStorage.setItem('otp_channel', contactMethod);
        window.location.href = `/apply/girls-ashram/verify?token=${encodeURIComponent(data.token)}`;
      } else {
        const error = await response.json();
        setErrors([error.message || 'Failed to send OTP']);
        setOtpSent(false);
        setResendTimer(0);
      }
    } catch (err) {
      setErrors(['Network error. Please try again.']);
      setOtpSent(false);
      setResendTimer(0);
    }
  };

  const handleResendOTP = () => {
    if (resendTimer > 0) return;
    handleSendOTP();
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
          <Link href="/apply" className="flex items-center gap-3">
            <ArrowLeft className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
            <div>
              <h1
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
              >
                {t('Girls Ashram Application', 'बालिका आश्रम आवेदन')}</h1>
              <p className="text-caption">{t('Step 2 of 4', 'चरण 2 का 4')}</p>
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
              <div className="h-px w-8 md:w-16" style={{ backgroundColor: "var(--border-primary)" }}></div>
              <div className="flex items-center gap-2 opacity-50">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--color-gray-400)" }}
                >
                  4
                </div>
                <span className="hidden md:inline text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {t('Application Form', 'आवेदन पत्र')}</span>
              </div>
            </div>
            <div className="text-sm ml-4 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
              <span>{t('Step 2 of 4', 'चरण 2 का 4')}</span>
            </div>
          </div>
        </div>
      </section>

      <main className="px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              {t('Verify Your Identity', 'अपनी पहचान सत्यापित करें')}</h2>
            <p className="text-lg mb-8" style={{ color: "var(--text-secondary)" }}>
              {t('We\'ll send a One-Time Password (OTP) to verify your contact details', 'हम आपके संपर्क विवरण सत्यापित करने के लिए एक ओटीपी भेजेंगे')}</p>
          </div>

          <div className="card p-8 mb-8">
            <h3 className="text-xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
              {t('Choose Contact Method', 'संपर्क माध्यम चुनें')}</h3>
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              <button
                className={`p-6 rounded-lg border-2 transition-all ${
                  contactMethod === 'phone'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => setContactMethod('phone')}
              >
                <Phone className="w-8 h-8 mx-auto mb-3" style={{ color: contactMethod === 'phone' ? 'var(--color-purple-600)' : 'var(--color-gray-600)' }} />
                <h4 className="font-semibold mb-2">{t('Mobile Number', 'मोबाइल नंबर')}</h4>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {t('Fast and secure OTP verification via SMS', 'एसएमएस द्वारा तेज़ और सुरक्षित ओटीपी सत्यापन')}</p>
              </button>

              <button
                className={`p-6 rounded-lg border-2 transition-all ${
                  contactMethod === 'whatsapp'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => setContactMethod('whatsapp')}
              >
                <MessageCircle className="w-8 h-8 mx-auto mb-3" style={{ color: contactMethod === 'whatsapp' ? '#16a34a' : 'var(--color-gray-600)' }} />
                <h4 className="font-semibold mb-2">{t('WhatsApp', 'व्हाट्सएप')}</h4>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {t('Get your OTP on WhatsApp', 'अपना ओटीपी व्हाट्सएप पर प्राप्त करें')}</p>
              </button>

              <button
                className={`p-6 rounded-lg border-2 transition-all ${
                  contactMethod === 'email'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => setContactMethod('email')}
              >
                <Mail className="w-8 h-8 mx-auto mb-3" style={{ color: contactMethod === 'email' ? 'var(--color-purple-600)' : 'var(--color-gray-600)' }} />
                <h4 className="font-semibold mb-2">{t('Email Address', 'ईमेल पता')}</h4>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {t('Receive OTP via email verification', 'ईमेल सत्यापन द्वारा ओटीपी प्राप्त करें')}</p>
              </button>
            </div>

            {contactMethod !== 'email' && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  {contactMethod === 'whatsapp' ? t('WhatsApp Number', 'व्हाट्सएप नंबर') : t('Mobile Number', 'मोबाइल नंबर')}</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhoneNumber(val);
                      if (val && !/^[6-9]\d{9}$/.test(val)) {
                        setErrors([t('Must be 10 digits starting with 6-9', '6-9 से शुरू होने वाले 10 अंक होने चाहिए')]);
                      } else {
                        setErrors([]);
                      }
                    }}
                    placeholder={t('Enter 10-digit mobile number', '10 अंकों का मोबाइल नंबर दर्ज करें')}
                    className="w-full px-4 py-3 border rounded-lg text-lg"
                    style={{
                      borderColor: errors.length > 0 ? 'var(--color-red-500)' : 'var(--border-primary)',
                      paddingLeft: '48px'
                    }}
                  />
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: "var(--color-gray-400)" }} />
                </div>
                {errors.length > 0 && (
                  <p className="text-sm mt-1" style={{ color: 'var(--color-red-500)' }}>{errors[0]}</p>
                )}
                <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                  {t('We\'ll send a 6-digit OTP to this number', 'हम इस नंबर पर 6 अंकों का ओटीपी भेजेंगे')}</p>
              </div>
            )}

            {contactMethod === 'email' && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  {t('Email Address', 'ईमेल पता')}</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (e.target.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)) {
                        setErrors([t('Please enter a valid email address', 'कृपया एक मान्य ईमेल पता दर्ज करें')]);
                      } else {
                        setErrors([]);
                      }
                    }}
                    placeholder={t('Enter your email address', 'अपना ईमेल पता दर्ज करें')}
                    className="w-full px-4 py-3 border rounded-lg text-lg"
                    style={{
                      borderColor: errors.length > 0 ? 'var(--color-red-500)' : 'var(--border-primary)',
                      paddingLeft: '48px'
                    }}
                  />
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: "var(--color-gray-400)" }} />
                </div>
                {errors.length > 0 && contactMethod === 'email' && (
                  <p className="text-sm mt-1" style={{ color: 'var(--color-red-500)' }}>{errors[0]}</p>
                )}
                <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                  {t('We\'ll send a 6-digit OTP to this email', 'हम इस ईमेल पर 6 अंकों का ओटीपी भेजेंगे')}</p>
                <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                  {t('Note: For OTP please check spam box.', 'नोट: OTP के लिए कृपया स्पैम बॉक्स जांचें।')}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 mb-8 p-4 rounded-lg" style={{ backgroundColor: "var(--color-purple-50)" }}>
            <Shield className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {t('Your Security Matters', 'आपकी सुरक्षा महत्वपूर्ण है')}</h4>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t('This OTP is valid for 10 minutes and can only be used once.  Never share your OTP with anyone.', 'यह ओटीपी 10 मिनट के लिए वैध है और केवल एक बार उपयोग किया जा सकता है। अपना ओटीपी किसी के साथ साझा न करें।')}</p>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="card p-4 mb-6 border-l-4" style={{ borderLeftColor: "var(--color-red-500)" }}>
              <h4 className="font-semibold mb-2" style={{ color: "var(--color-red-600)" }}>
                {t('Please Fix The Following:', 'कृपया निम्नलिखित ठीक करें:')}</h4>
              <ul className="space-y-1">
                {errors.map((error, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="text-red-500">•</span>
                    <span className="text-sm" style={{ color: "var(--color-red-600)" }}>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!otpSent ? (
            <button
              onClick={handleSendOTP}
              disabled={!isInputValid()}
              className="btn-primary w-full text-lg py-4 flex items-center justify-center gap-2"
            >
              {t('Send OTP', 'ओटीपी भेजें')}
                <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <div className="space-y-4">
              <div className="card p-4 text-center">
                <h4 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                  {t('OTP Sent Successfully!', 'ओटीपी सफलतापूर्वक भेजा गया!')}</h4>
                <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                  Please check your {contactMethod === 'phone' ? 'SMS messages' : contactMethod === 'whatsapp' ? 'WhatsApp' : 'email'} for the 6-digit code.
                </p>
                {contactMethod === 'email' && (
                  <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                    {t("Don't see it in your inbox? Please check your Spam/Junk folder for the OTP.", 'इनबॉक्स में नहीं दिख रहा? कृपया OTP के लिए अपना स्पैम/जंक फ़ोल्डर जांचें।')}
                  </p>
                )}

                {resendTimer > 0 ? (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: "var(--color-purple-600)" }} />
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      Resend OTP in {resendTimer}s
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={handleResendOTP}
                      className="btn-outline w-full flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {t('Resend OTP', 'ओटीपी पुनः भेजें')}</button>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {t('Didn\'t receive? Check spam folder or try with different contact method', 'प्राप्त नहीं हुआ? स्पैम फोल्डर जांचें या अन्य संपर्क माध्यम आज़माएं')}</p>
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                  {t('Having trouble? Contact girls ashram office:', 'समस्या हो रही है? बालिका आश्रम कार्यालय से संपर्क करें:')}</p>
                <Link
                  href="tel:+919769610214"
                  className="text-purple-600 hover:text-purple-800 font-medium"
                >
                  +91 97696 10214
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
