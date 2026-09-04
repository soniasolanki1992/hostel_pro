import { describe, it, expect } from 'vitest';
import { renderLoginInvite } from './login-invite';

describe('renderLoginInvite', () => {
  const baseInput = {
    name: 'Riya Joshi',
    email: 'riya@example.com',
    tempPassword: 'Joshi@0006#12092004',
    trackingNumber: 'HG-2026-00006',
    loginUrl: 'https://hostel.example.com/login',
  };

  it('produces a subject containing the tracking number', () => {
    const out = renderLoginInvite(baseInput);
    expect(out.subject).toContain('HG-2026-00006');
    expect(out.subject.toLowerCase()).toContain('approved');
  });

  it('embeds login details in both html and text bodies', () => {
    const out = renderLoginInvite(baseInput);
    for (const body of [out.html, out.text]) {
      expect(body).toContain('Riya Joshi');
      expect(body).toContain('riya@example.com');
      expect(body).toContain('Joshi@0006#12092004');
      expect(body).toContain('HG-2026-00006');
      expect(body).toContain('https://hostel.example.com/login');
    }
  });

  it('escapes HTML-special characters in user-supplied fields', () => {
    const out = renderLoginInvite({
      ...baseInput,
      name: 'A <b>Bad</b> "Name"',
      tempPassword: 'p&w<x>',
    });
    expect(out.html).not.toContain('<b>Bad</b>');
    expect(out.html).toContain('&lt;b&gt;Bad&lt;/b&gt;');
    expect(out.html).toContain('&quot;Name&quot;');
    expect(out.html).toContain('p&amp;w&lt;x&gt;');
    // text body remains raw — that is fine for plain text
    expect(out.text).toContain('A <b>Bad</b> "Name"');
  });
});
