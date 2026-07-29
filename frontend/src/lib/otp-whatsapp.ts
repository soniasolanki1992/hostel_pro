/**
 * Shared builder for WhatsApp OTP messages.
 *
 * Production OTP delivery uses an approved Twilio WhatsApp authentication
 * template (referenced by Content SID); the OTP is passed as template
 * variable {{1}} via `contentVariables`. The plain-text `body` is a fallback
 * used only when no template is configured (dev, or inside the 24h session
 * window) — see lib/twilio-whatsapp.ts.
 */
export function buildWhatsappOtp(otp: string, vertical: string) {
  const verticalLabel = vertical === 'parent' ? 'Parent Login' : 'Hostel Application';
  const body = `${otp} is your verification code for ${verticalLabel}. It expires in 5 minutes. Do not share this code with anyone.`;
  // Authentication templates expose the OTP as the first body variable.
  const contentVariables: Record<string, string> = { '1': otp };
  return { body, contentVariables };
}
