/**
 * SMTP mailer wrapper around nodemailer.
 *
 * Reads SMTP_* env vars at first send. If credentials are missing or
 * NODE_ENV=development with MAIL_DEV_SKIP=true, sends are logged and skipped
 * so local development does not need a real SMTP server.
 *
 * Required env (production):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 * Optional:
 *   SMTP_SECURE=true|false (default: true if port 465)
 *   MAIL_DEV_SKIP=true     (skip real send in dev, just log)
 */

import nodemailer, { Transporter } from 'nodemailer';
import { logger } from './logger';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

let cachedTransport: Transporter | null = null;

function buildTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function getTransport(): Transporter | null {
  if (cachedTransport) return cachedTransport;
  cachedTransport = buildTransport();
  return cachedTransport;
}

/**
 * Reset the cached transport. Used by tests to pick up new env vars.
 */
export function _resetMailerForTests(): void {
  cachedTransport = null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, subject, html, text } = input;

  // Dev skip: log and return success without dispatching
  const devSkip =
    process.env.NODE_ENV !== 'production' && process.env.MAIL_DEV_SKIP === 'true';

  const transport = getTransport();

  if (devSkip || !transport) {
    logger.info('Mailer: skipping send (dev or SMTP not configured)', {
      to,
      subject,
      configured: Boolean(transport),
    });
    return { success: true, skipped: true };
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER!;

  try {
    const info = await transport.sendMail({ from, to, subject, html, text });
    logger.info('Mailer: email sent', { to, subject, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Mailer: send failed', { to, subject, error: message });
    return { success: false, error: message };
  }
}
