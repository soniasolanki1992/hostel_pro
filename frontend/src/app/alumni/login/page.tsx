"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, KeyRound } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/shadcn/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

const AlumniLogin = () => {
  const { t } = useLanguage();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email) {
      toast.error(t('Please enter your registered email address.', 'कृपया अपना पंजीकृत ईमेल पता दर्ज करें।'));
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/alumni/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 403 && data.status === 'PENDING') {
          toast.info(t('Your application is still under review.', 'आपका आवेदन अभी समीक्षाधीन है।'));
          router.push('/alumni/pending');
          return;
        }
        toast.error(data.error || t('Failed to send OTP', 'OTP भेजने में विफल'));
        return;
      }
      setOtpToken(data.token);
      setOtpSent(true);
      toast.success(t("A 6-digit code has been sent to your email. If you don't see it, please check your Spam/Junk folder.", '6-अंकीय कोड आपके ईमेल पर भेजा गया है। यदि यह न दिखे, तो कृपया अपना स्पैम/जंक फ़ोल्डर जांचें।'));
    } catch {
      toast.error(t('Network error', 'नेटवर्क त्रुटि'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      toast.error(t('Please enter the OTP sent to your email.', 'कृपया अपने ईमेल पर भेजा गया OTP दर्ज करें।'));
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/alumni/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp, token: otpToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || t('Invalid OTP', 'अमान्य OTP'));
        return;
      }
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userRole', 'ALUMNI');
      localStorage.setItem('userId', data.alumniId);
      localStorage.setItem('alumniId', data.alumniId);
      toast.success(t('Welcome back to the Alumni Network!', 'पूर्व छात्र नेटवर्क में आपका स्वागत है!'));
      router.push(data.redirect || '/alumni/dashboard');
    } catch {
      toast.error(t('Network error', 'नेटवर्क त्रुटि'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PublicLayout>
      <PageHero
        title={t('Alumni Login', 'पूर्व छात्र लॉगिन')}
        subtitle={t('Access your alumni dashboard', 'अपने पूर्व छात्र डैशबोर्ड तक पहुंचें')}
      />

      <section className="py-16 bg-background flex-1">
        <div className="container mx-auto px-4 max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                {otpSent ? <KeyRound className="h-8 w-8 text-primary" /> : <Mail className="h-8 w-8 text-primary" />}
              </div>
              <CardTitle className="font-heading">
                {otpSent ? t('Enter OTP', 'OTP दर्ज करें') : t('Login with Email', 'ईमेल से लॉगिन')}
              </CardTitle>
              <CardDescription>
                {otpSent
                  ? t('Enter the 6-digit code sent to your email', 'अपने ईमेल पर भेजा गया 6-अंकीय कोड दर्ज करें')
                  : t('We\'ll send you a one-time password', 'हम आपको एक बार का पासवर्ड भेजेंगे')
                }
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {!otpSent ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('Email Address', 'ईमेल पता')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('Enter your registered email', 'अपना पंजीकृत ईमेल दर्ज करें')}
                    />
                  </div>

                  <Button onClick={handleSendOtp} disabled={isLoading} className="w-full">
                    {isLoading ? t('Sending...', 'भेज रहा है...') : t('Send OTP', 'OTP भेजें')}
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="otp">{t('One-Time Password', 'वन-टाइम पासवर्ड')}</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="text-center text-2xl tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {t('Sent to', 'भेजा गया')}: {email}
                    </p>
                  </div>

                  <Button onClick={handleVerifyOtp} disabled={isLoading} className="w-full">
                    {isLoading ? t('Verifying...', 'सत्यापित कर रहा है...') : t('Verify OTP', 'OTP सत्यापित करें')}
                  </Button>

                  <Button variant="ghost" onClick={() => setOtpSent(false)} className="w-full">
                    {t('Use different email', 'अलग ईमेल उपयोग करें')}
                  </Button>
                </>
              )}

              <div className="text-center pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  {t('Not registered yet?', 'अभी तक पंजीकृत नहीं हैं?')}{' '}
                  <Link href="/alumni/register" className="text-primary hover:underline">
                    {t('Register here', 'यहां रजिस्टर करें')}
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

        </div>
      </section>
    </PublicLayout>
  );
};

export default AlumniLogin;
