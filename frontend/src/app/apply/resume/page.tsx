'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ResumeApplicationPanel } from '@/components/apply/ResumeApplicationPanel';

export default function ResumeApplicationPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      <header
        className="px-6 py-4 border-b"
        style={{ backgroundColor: 'var(--surface-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/apply" className="flex items-center gap-3">
            <ArrowLeft className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            <div>
              <h1
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}
              >
                {t('Resume Application', 'आवेदन पुनः शुरू करें')}
              </h1>
              <p className="text-caption">
                {t('Pick up where you left off', 'जहाँ छोड़ा था वहाँ से जारी रखें')}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="nav-link">{t('Home', 'होम')}</Link>
              <Link href="/apply" className="nav-link">{t('Apply Now', 'अभी आवेदन करें')}</Link>
              <Link href="/track" className="nav-link">{t('Check Status', 'स्थिति जांचें')}</Link>
              <Link href="/login" className="nav-link">{t('Login', 'लॉगिन')}</Link>
            </nav>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <ResumeApplicationPanel />
        </div>
      </main>
    </div>
  );
}
