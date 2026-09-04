/**
 * Login-invite email sent to a student after their application is APPROVED
 * and a user account is created. Provides the temp password and login URL.
 */

export interface LoginInviteInput {
  name: string;
  email: string;
  tempPassword: string;
  trackingNumber: string;
  loginUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderLoginInvite(input: LoginInviteInput): RenderedEmail {
  const { name, email, tempPassword, trackingNumber, loginUrl } = input;
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePwd = escapeHtml(tempPassword);
  const safeTracking = escapeHtml(trackingNumber);
  const safeUrl = escapeHtml(loginUrl);

  const subject = `Your Hostel Application is Approved — Login Details (${trackingNumber})`;

  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5;max-width:560px;margin:auto;padding:24px">
  <h2 style="color:#1e3a8a">Welcome, ${safeName}</h2>
  <p>Your application <strong>${safeTracking}</strong> has been <strong>approved</strong>. A resident account has been created for you.</p>

  <h3>Your login details</h3>
  <table style="border-collapse:collapse">
    <tr><td style="padding:6px 12px"><strong>Email</strong></td><td style="padding:6px 12px">${safeEmail}</td></tr>
    <tr><td style="padding:6px 12px"><strong>Temporary Password</strong></td><td style="padding:6px 12px"><code>${safePwd}</code></td></tr>
  </table>

  <p style="margin-top:20px">
    <a href="${safeUrl}" style="background:#1e3a8a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">
      Log in to your dashboard
    </a>
  </p>

  <p><strong>Important:</strong> You will be asked to change your password the first time you log in. Please keep these credentials confidential.</p>

  <p style="color:#666;font-size:12px;margin-top:32px">Hirachand Gumanji Family Charitable Trust — Hostel Management Portal</p>
</body></html>`;

  const text = [
    `Welcome, ${name}`,
    ``,
    `Your application ${trackingNumber} has been approved. A resident account has been created for you.`,
    ``,
    `Login details:`,
    `  Email: ${email}`,
    `  Temporary Password: ${tempPassword}`,
    ``,
    `Log in: ${loginUrl}`,
    ``,
    `You will be asked to change your password the first time you log in.`,
    `Please keep these credentials confidential.`,
    ``,
    `— Hirachand Gumanji Family Charitable Trust`,
  ].join('\n');

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
