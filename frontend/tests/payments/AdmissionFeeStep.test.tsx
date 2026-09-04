import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/payments/phonepeClient', () => ({
  redirectToCheckout: vi.fn(),
}));

import { AdmissionFeeStep } from '@/components/forms/AdmissionFeeStep';
import * as phonepeClient from '@/lib/payments/phonepeClient';

describe('AdmissionFeeStep', () => {
  beforeEach(() => {
    vi.mocked(phonepeClient.redirectToCheckout).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders the AdmissionFeeNotice and a submit button', () => {
    render(<AdmissionFeeStep applicationId="app-1" />);
    expect(screen.getByText(/Admission Fee — ₹500 \(Non-Refundable\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay ₹500 & Submit Application/i })).toBeInTheDocument();
  });

  it('calls initiate then redirects the browser to the returned checkoutUrl', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { checkoutUrl: 'https://mercury-t2.phonepe.com/transact/TEST', merchantOrderId: 'ADM_TEST', internalTxnId: 'txn-1' },
      }),
    } as Response);

    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue('session-token-abc') },
      writable: true,
    });

    render(<AdmissionFeeStep applicationId="app-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(phonepeClient.redirectToCheckout).toHaveBeenCalledWith('https://mercury-t2.phonepe.com/transact/TEST'));
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/payments/phonepe/initiate');
    const initBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(initBody).toMatchObject({ applicationId: 'app-1', sessionToken: 'session-token-abc' });
  });

  it('shows an inline error when the initiate endpoint fails, without redirecting', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Application not in DRAFT' }),
    } as Response);
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue('session-token-abc') },
      writable: true,
    });

    render(<AdmissionFeeStep applicationId="app-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/Application not in DRAFT/i)).toBeInTheDocument());
    expect(phonepeClient.redirectToCheckout).not.toHaveBeenCalled();
  });

  it('shows a session-expired error when there is no stored session token', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue(null) },
      writable: true,
    });

    render(<AdmissionFeeStep applicationId="app-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/Session expired/i)).toBeInTheDocument());
    expect(phonepeClient.redirectToCheckout).not.toHaveBeenCalled();
  });
});
