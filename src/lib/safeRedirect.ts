/**
 * Validate a post-login return path taken from the URL (`/login?next=/bin/abc`).
 *
 * Only same-origin absolute paths are accepted: it must start with a single `/`,
 * so `//evil.example`, `/\evil.example`, `https://evil.example` and `javascript:`
 * are all rejected (an open redirect would otherwise let a crafted login link
 * send a freshly authenticated user anywhere). Returns null when unusable.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  // Control characters (tab/newline are stripped by browsers, which can turn "/\t/evil" into "//evil")
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith('/login') || raw.startsWith('/register')) return null;
  return raw;
}
