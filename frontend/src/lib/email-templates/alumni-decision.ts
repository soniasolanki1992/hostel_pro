import { escapeHtml, wrapHtml } from './_layout';
import type { RenderedEmail } from './login-invite';

export interface AlumniDecisionInput {
  name: string;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string | null;
  portalUrl: string;
}

export function renderAlumniDecision(input: AlumniDecisionInput): RenderedEmail {
  const { name, decision, reason, portalUrl } = input;

  if (decision === 'APPROVED') {
    const subject = 'Your alumni registration has been approved';
    const html = wrapHtml('Welcome to the Alumni Network', `
      <p>Dear ${escapeHtml(name)},</p>
      <p>Your alumni registration has been <strong>approved</strong>. You now have access to the alumni portal — directory, events, and the alumni job board.</p>
      <p><a href="${escapeHtml(portalUrl)}" style="background:#1e3a8a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">Open the alumni portal</a></p>
    `);
    const text = [
      `Dear ${name},`,
      ``,
      `Your alumni registration has been approved. You now have access to the alumni portal — directory, events, and job board.`,
      ``,
      `Visit: ${portalUrl}`,
      `— Hirachand Gumanji Family Charitable Trust`,
    ].join('\n');
    return { subject, html, text };
  }

  // REJECTED
  const subject = 'Update on your alumni registration';
  const reasonBlock = reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : '';
  const html = wrapHtml('Alumni registration update', `
    <p>Dear ${escapeHtml(name)},</p>
    <p>After review, we are unable to approve your alumni registration at this time.</p>
    ${reasonBlock}
    <p>If you believe this is in error, please reach out to the trust office with supporting documents.</p>
  `);
  const text = [
    `Dear ${name},`,
    ``,
    `After review, we are unable to approve your alumni registration at this time.`,
    reason ? `Reason: ${reason}` : '',
    ``,
    `If this is in error, please contact the trust office.`,
    `— Hirachand Gumanji Family Charitable Trust`,
  ].filter(Boolean).join('\n');
  return { subject, html, text };
}
