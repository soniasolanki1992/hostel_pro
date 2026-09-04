/**
 * Shared HTML wrapper + escape helper for all transactional emails.
 */

export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapHtml(title: string, body: string): string {
  return `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5;max-width:560px;margin:auto;padding:24px">
  <h2 style="color:#1e3a8a">${escapeHtml(title)}</h2>
  ${body}
  <p style="color:#666;font-size:12px;margin-top:32px">Hirachand Gumanji Family Charitable Trust — Hostel Management Portal</p>
</body></html>`;
}
