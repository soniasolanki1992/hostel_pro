/**
 * Shared builder for OTP verification emails.
 * Used by both /api/otp/send and /api/otp/resend so the email content stays in sync.
 */
export function buildOtpEmail(otp: string, vertical: string) {
  const subject = `Your verification code: ${otp}`;
  const verticalLabel = vertical === 'parent' ? 'Parent Login' : 'Hostel Application';
  const text = `Your one-time verification code for ${verticalLabel} is ${otp}.\n\nThis code will expire in 5 minutes. If you did not request this, please ignore this email.`;
  const html = `<!doctype html><html><body style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#1f2937; max-width:560px; margin:0 auto; padding:24px;">
    <h2 style="color:#0f172a; margin:0 0 16px;">Verification Code</h2>
    <p style="margin:0 0 12px;">Use the code below to continue your <strong>${verticalLabel}</strong>:</p>
    <div style="font-size:32px; letter-spacing:8px; font-weight:700; padding:16px 24px; background:#f1f5f9; border-radius:8px; text-align:center; margin:16px 0;">${otp}</div>
    <p style="margin:0 0 8px; color:#475569; font-size:14px;">This code expires in 5 minutes.</p>
    <p style="margin:0; color:#94a3b8; font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
  </body></html>`;
  return { subject, text, html };
}
