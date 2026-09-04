import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset modules between cases so the mailer's cached transport / env reads
// are reapplied per test.
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('sendEmail', () => {
  it('skips when SMTP env is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_PORT', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');

    const { sendEmail } = await import('./mailer');
    const result = await sendEmail({
      to: 'a@b.com',
      subject: 's',
      html: '<p>x</p>',
    });
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('skips in dev when MAIL_DEV_SKIP=true even if SMTP is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MAIL_DEV_SKIP', 'true');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_USER', 'u');
    vi.stubEnv('SMTP_PASS', 'p');

    const { sendEmail } = await import('./mailer');
    const result = await sendEmail({
      to: 'a@b.com',
      subject: 's',
      html: '<p>x</p>',
    });
    expect(result.skipped).toBe(true);
  });

  it('dispatches via nodemailer transport when configured', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'mid-123' });

    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ sendMail }) },
    }));

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MAIL_DEV_SKIP', 'false');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_USER', 'user@example.com');
    vi.stubEnv('SMTP_PASS', 'pass');
    vi.stubEnv('MAIL_FROM', 'noreply@example.com');

    const { sendEmail } = await import('./mailer');
    const result = await sendEmail({
      to: 'a@b.com',
      subject: 'hello',
      html: '<p>x</p>',
      text: 'x',
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.messageId).toBe('mid-123');
    expect(sendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'a@b.com',
      subject: 'hello',
      html: '<p>x</p>',
      text: 'x',
    });
  });

  it('returns failure result if transport throws', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('connect refused'));

    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ sendMail }) },
    }));

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_USER', 'user');
    vi.stubEnv('SMTP_PASS', 'pass');

    const { sendEmail } = await import('./mailer');
    const result = await sendEmail({
      to: 'a@b.com',
      subject: 's',
      html: '<p>x</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('connect refused');
  });
});
