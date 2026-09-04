'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';

type Vertical = 'boys-hostel' | 'girls-ashram' | 'dharamshala';

const LABELS: Record<Vertical, string> = {
  'boys-hostel': 'Boys Hostel',
  'girls-ashram': 'Girls Ashram',
  'dharamshala': 'Dharamshala',
};

interface Props {
  vertical: Vertical;
  children: React.ReactNode;
}

export function AdmissionsGate({ vertical, children }: Props) {
  const [state, setState] = useState<'loading' | 'open' | 'closed'>('loading');

  useEffect(() => {
    fetch('/api/config/applications-status')
      .then((r) => r.json())
      .then((d) => {
        const open = d?.success && d.data ? d.data[vertical] !== false : true;
        setState(open ? 'open' : 'closed');
      })
      .catch(() => setState('open'));
  }, [vertical]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-500" />
      </div>
    );
  }

  if (state === 'closed') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-page)' }}>
        <div className="card p-10 max-w-md text-center" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-red-50)' }}>
            <Lock className="w-10 h-10" style={{ color: 'var(--color-red-600)' }} />
          </div>
          <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Admissions Closed
          </h1>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Admissions for <strong>{LABELS[vertical]}</strong> are currently closed. Please check back later or contact the office for more information.
          </p>
          <Link href="/" className="btn-primary inline-block">Back to Home</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
