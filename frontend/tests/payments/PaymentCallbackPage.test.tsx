import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const searchParamsMap: Record<string, string> = {
  applicationId: 'app-1',
  merchantOrderId: 'ADM_TEST',
  trackingNumber: 'TRK123',
  vertical: 'boys-hostel',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: (key: string) => searchParamsMap[key] ?? null }),
}));

import PaymentCallbackPage from '@/app/apply/payment-callback/page';

beforeEach(() => {
  pushMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaymentCallbackPage', () => {
  it('on SUCCESS, redirects to /track/{trackingNumber}?paid=1', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'SUCCESS' } }),
    } as Response);

    render(<PaymentCallbackPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/track/TRK123?paid=1'));
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('/api/payments/phonepe/verify');
    expect(JSON.parse(init.body)).toEqual({ merchantOrderId: 'ADM_TEST' });
  });

  it('on FAILED, shows a retry link back to the draft resume URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'FAILED' } }),
    } as Response);

    render(<PaymentCallbackPage />);

    await waitFor(() => expect(screen.getByText(/payment (failed|was not completed)/i)).toBeInTheDocument());
    const retryLink = screen.getByRole('link', { name: /try again/i }) as HTMLAnchorElement;
    expect(retryLink.getAttribute('href')).toBe('/apply/boys-hostel/form?appId=app-1&tracking=TRK123');
  });

  it('on PENDING, shows a processing message with a plain track link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'PENDING' } }),
    } as Response);

    render(<PaymentCallbackPage />);

    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeInTheDocument());
    const trackLink = screen.getByRole('link', { name: /track/i }) as HTMLAnchorElement;
    expect(trackLink.getAttribute('href')).toBe('/track/TRK123');
  });
});
