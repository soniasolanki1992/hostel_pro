'use client';
import { useState } from 'react';
import { AdmissionFeeNotice } from './AdmissionFeeNotice';
import { Button } from '@/components/shadcn/button-extended';
import { redirectToCheckout } from '@/lib/payments/phonepeClient';

interface Props {
  applicationId: string;
}

export function AdmissionFeeStep({ applicationId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setBusy(true);
    setError(null);
    try {
      const sessionToken =
        typeof window !== 'undefined' ? localStorage.getItem('applicant_session_token') : null;
      if (!sessionToken) {
        throw new Error('Session expired. Please re-verify your mobile number.');
      }
      const initRes = await fetch('/api/payments/phonepe/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, sessionToken }),
      });
      const initJson = await initRes.json();
      if (!initRes.ok || !initJson?.data?.checkoutUrl) {
        throw new Error(initJson?.error || 'Failed to start payment');
      }
      redirectToCheckout(initJson.data.checkoutUrl);
    } catch (e: any) {
      setError(e.message || 'Payment failed');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdmissionFeeNotice />
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      <Button
        type="button"
        variant="primary"
        onClick={handlePay}
        disabled={busy}
        loading={busy}
        className="w-full"
      >
        Pay ₹500 & Submit Application
      </Button>
    </div>
  );
}
