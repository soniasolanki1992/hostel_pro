import { escapeHtml, wrapHtml } from './_layout';
import type { RenderedEmail } from './login-invite';

export interface InterviewScheduledInput {
  name: string;
  trackingNumber: string;
  scheduleTime: string; // ISO string
  mode: string;
  trackUrl: string;
}

export function renderInterviewScheduled(input: InterviewScheduledInput): RenderedEmail {
  const { name, trackingNumber, scheduleTime, mode, trackUrl } = input;
  const dateStr = formatHumanDate(scheduleTime);

  const subject = `Interview scheduled for your application (${trackingNumber})`;

  const html = wrapHtml(`Interview scheduled`, `
    <p>Dear ${escapeHtml(name)},</p>
    <p>An interview has been scheduled for your application <strong>${escapeHtml(trackingNumber)}</strong>.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:6px 12px"><strong>Date &amp; Time</strong></td><td style="padding:6px 12px">${escapeHtml(dateStr)}</td></tr>
      <tr><td style="padding:6px 12px"><strong>Mode</strong></td><td style="padding:6px 12px">${escapeHtml(mode)}</td></tr>
    </table>
    <p>Please be punctual and keep relevant documents ready. You can review your application status here:</p>
    <p><a href="${escapeHtml(trackUrl)}" style="color:#1e3a8a">${escapeHtml(trackUrl)}</a></p>
  `);

  const text = [
    `Dear ${name},`,
    ``,
    `An interview has been scheduled for your application ${trackingNumber}.`,
    `  Date & Time: ${dateStr}`,
    `  Mode: ${mode}`,
    ``,
    `Track your application: ${trackUrl}`,
    `— Hirachand Gumanji Family Charitable Trust`,
  ].join('\n');

  return { subject, html, text };
}

function formatHumanDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return iso;
  }
}
