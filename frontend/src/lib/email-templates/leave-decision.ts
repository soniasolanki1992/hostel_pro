import { escapeHtml, wrapHtml } from './_layout';
import type { RenderedEmail } from './login-invite';

export interface LeaveDecisionInput {
  name: string;
  decision: 'APPROVED' | 'REJECTED';
  leaveType: string;
  startTime: string;
  endTime: string;
  reason?: string | null; // rejection reason
}

export function renderLeaveDecision(input: LeaveDecisionInput): RenderedEmail {
  const { name, decision, leaveType, startTime, endTime, reason } = input;

  const period = `${formatDate(startTime)} → ${formatDate(endTime)}`;

  if (decision === 'APPROVED') {
    const subject = `Leave approved (${leaveType})`;
    const html = wrapHtml('Leave approved', `
      <p>Dear ${escapeHtml(name)},</p>
      <p>Your leave request has been <strong>approved</strong>.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:6px 12px"><strong>Type</strong></td><td style="padding:6px 12px">${escapeHtml(leaveType)}</td></tr>
        <tr><td style="padding:6px 12px"><strong>Period</strong></td><td style="padding:6px 12px">${escapeHtml(period)}</td></tr>
      </table>
      <p>Please follow the standard checkout/return procedure at the hostel reception.</p>
    `);
    const text = [
      `Dear ${name},`,
      ``,
      `Your leave request has been approved.`,
      `  Type: ${leaveType}`,
      `  Period: ${period}`,
      ``,
      `Please follow the standard checkout/return procedure.`,
      `— Hirachand Gumanji Family Charitable Trust`,
    ].join('\n');
    return { subject, html, text };
  }

  const subject = `Leave request rejected (${leaveType})`;
  const reasonBlock = reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : '';
  const html = wrapHtml('Leave request rejected', `
    <p>Dear ${escapeHtml(name)},</p>
    <p>Your leave request was <strong>not approved</strong>.</p>
    <table style="border-collapse:collapse">
      <tr><td style="padding:6px 12px"><strong>Type</strong></td><td style="padding:6px 12px">${escapeHtml(leaveType)}</td></tr>
      <tr><td style="padding:6px 12px"><strong>Period</strong></td><td style="padding:6px 12px">${escapeHtml(period)}</td></tr>
    </table>
    ${reasonBlock}
    <p>Please discuss with your superintendent if you have questions.</p>
  `);
  const text = [
    `Dear ${name},`,
    ``,
    `Your leave request was not approved.`,
    `  Type: ${leaveType}`,
    `  Period: ${period}`,
    reason ? `Reason: ${reason}` : '',
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
