'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Outcome = 'CHECKING' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'ERROR';

export default function PaymentCallbackPageWrapper() {
  return (
    <Suspense fallback={null}>
      <PaymentCallbackPage />
    </Suspense>
  );
}

function PaymentCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>('CHECKING');

  const applicationId = searchParams.get('applicationId') || '';
  const merchantOrderId = searchParams.get('merchantOrderId') || '';
  const trackingNumber = searchParams.get('trackingNumber') || '';
  const vertical = searchParams.get('vertical') || 'boys-hostel';

  useEffect(() => {
    if (!merchantOrderId) {
      setOutcome('ERROR');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payments/phonepe/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchantOrderId }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setOutcome('ERROR');
          return;
        }
        const status = json?.data?.status;
        if (status === 'SUCCESS') {
          router.push(`/track/${trackingNumber}?paid=1`);
        } else if (status === 'FAILED') {
          setOutcome('FAILED');
        } else {
          setOutcome('PENDING');
        }
      } catch {
        if (!cancelled) setOutcome('ERROR');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantOrderId]);

  if (outcome === 'CHECKING') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-gray-600">Confirming your payment…</p>
      </div>
    );
  }

  if (outcome === 'FAILED') {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 text-center">
        <p className="text-red-700">Your payment failed or was not completed.</p>
        <Link
          href={`/apply/${vertical}/form?appId=${applicationId}&tracking=${trackingNumber}`}
          className="text-blue-600 underline"
        >
          Try again
        </Link>
      </div>
    );
  }

  if (outcome === 'PENDING') {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 text-center">
        <p>Your payment is still processing. Please check back shortly.</p>
        <Link href={`/track/${trackingNumber}`} className="text-blue-600 underline">
          Track your application
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <p className="text-red-700">
        We could not confirm your payment status. Please check your application status on the tracking page.
      </p>
      <Link href={`/track/${trackingNumber}`} className="text-blue-600 underline">
        Track your application
      </Link>
    </div>
  );
}
