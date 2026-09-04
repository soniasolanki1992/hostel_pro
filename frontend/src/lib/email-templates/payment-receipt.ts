import { escapeHtml, wrapHtml } from './_layout';
import type { RenderedEmail } from './login-invite';

export interface PaymentReceiptInput {
  name: string;
  amount: number | string;
  orderId: string;
  transactionId: string;
  feeHead?: string | null;
  paidAt?: string;
}

export function renderPaymentReceipt(input: PaymentReceiptInput): RenderedEmail {
  const { name, amount, orderId, transactionId, feeHead, paidAt } = input;
  const amountStr = typeof amount === 'number' ? `₹${amount.toLocaleString('en-IN')}` : `₹${amount}`;
  const subject = `Payment receipt — ${orderId}`;

  const paidStr = paidAt ? formatDate(paidAt) : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

  const html = wrapHtml('Payment received', `
    <p>Dear ${escapeHtml(name)},</p>
    <p>We have received your payment. Below are the receipt details for your records.</p>
    <table style="border-collapse:collapse">
      <tr><td style="padding:6px 12px"><strong>Amount</strong></td><td style="padding:6px 12px">${escapeHtml(amountStr)}</td></tr>
      ${feeHead ? `<tr><td style="padding:6px 12px"><strong>Fee Head</strong></td><td style="padding:6px 12px">${escapeHtml(feeHead)}</td></tr>` : ''}
      <tr><td style="padding:6px 12px"><strong>Order ID</strong></td><td style="padding:6px 12px">${escapeHtml(orderId)}</td></tr>
      <tr><td style="padding:6px 12px"><strong>Transaction ID</strong></td><td style="padding:6px 12px">${escapeHtml(transactionId)}</td></tr>
      <tr><td style="padding:6px 12px"><strong>Paid At</strong></td><td style="padding:6px 12px">${escapeHtml(paidStr)}</td></tr>
    </table>
    <p>This receipt is computer-generated. Please retain it for your records.</p>
  `);

  const text = [
    `Dear ${name},`,
    ``,
    `We have received your payment.`,
    `  Amount: ${amountStr}`,
    feeHead ? `  Fee Head: ${feeHead}` : '',
    `  Order ID: ${orderId}`,
    `  Transaction ID: ${transactionId}`,
    `  Paid At: ${paidStr}`,
    ``,
    `— Hirachand Gumanji Family Charitable Trust`,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return iso;
  }
}
