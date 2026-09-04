export function redirectToCheckout(checkoutUrl: string): void {
  if (typeof window === 'undefined') return;
  window.location.href = checkoutUrl;
}
