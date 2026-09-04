import { escapeHtml, wrapHtml } from './_layout';
import type { RenderedEmail } from './login-invite';

export interface ApplicationRejectedInput {
  name: string;
  trackingNumber: string;
  reason?: string | null;
}

export function renderApplicationRejected(input: ApplicationRejectedInput): RenderedEmail {
  const { name, trackingNumber, reason } = input;
  const subject = `Update on your hostel application (${trackingNumber})`;

  const reasonBlock = reason
    ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>`
    : '';

  const html = wrapHtml(`Application update`, `
    <p>Dear ${escapeHtml(name)},</p>
    <p>After careful review, we regret to inform you that your application <strong>${escapeHtml(trackingNumber)}</strong> could not be approved at this time.</p>
    ${reasonBlock}
    <p>Thank you for your interest in our hostel. You are welcome to apply again in a future cycle.</p>
  `);

  const text = [
    `Dear ${name},`,
    ``,
    `After careful review, your application ${trackingNumber} could not be approved at this time.`,
    reason ? `Reason: ${reason}` : '',
    ``,
    `You are welcome to apply again in a future cycle.`,
    `— Hirachand Gumanji Family Charitable Trust`,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}
