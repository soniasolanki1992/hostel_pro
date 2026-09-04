/**
 * Minimal magic-byte MIME detection for file uploads (S-21).
 *
 * Covers the formats the upload routes accept: PDF, JPEG, PNG. Returns
 * null for everything else — the caller treats that as "rejected."
 *
 * We deliberately implement this in-tree rather than depending on the
 * `file-type` npm package; the validated formats are few and stable, and
 * skipping the dependency keeps the supply chain smaller.
 */

const MAGIC_BYTES: Array<{ mime: string; signature: number[]; offset?: number }> = [
  // PDF: %PDF-
  { mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

export function detectMimeFromBytes(buffer: Buffer | Uint8Array): string | null {
  if (!buffer || buffer.length < 4) return null;
  for (const entry of MAGIC_BYTES) {
    const offset = entry.offset || 0;
    if (buffer.length < offset + entry.signature.length) continue;
    let matched = true;
    for (let i = 0; i < entry.signature.length; i++) {
      if (buffer[offset + i] !== entry.signature[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return entry.mime;
  }
  return null;
}

/**
 * Return true if `detected` is one of the accepted MIME types. Treats
 * `image/jpg` as an alias for `image/jpeg`.
 */
export function isAcceptedMime(detected: string, allowed: string[]): boolean {
  if (allowed.includes(detected)) return true;
  if (detected === 'image/jpeg' && allowed.includes('image/jpg')) return true;
  if (detected === 'image/jpg' && allowed.includes('image/jpeg')) return true;
  return false;
}
