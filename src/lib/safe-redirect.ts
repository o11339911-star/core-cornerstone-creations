/**
 * Open-redirect protection for post-login navigation.
 * Only same-origin, absolute-path URLs are accepted.
 */

export const DEFAULT_REDIRECT = "/select-account";

const SCHEME_LIKE = /^[a-z][a-z0-9+.-]*:/i;

export function sanitizeRedirect(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof value !== "string") return fallback;

  const raw = value.trim();
  if (raw.length === 0 || raw.length > 512) return fallback;

  // Reject anything that is not a plain absolute path.
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (SCHEME_LIKE.test(raw)) return fallback;

  // Reject control characters and encoded backslashes/newlines.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (/%0a|%0d|%5c/i.test(raw)) return fallback;

  // Never bounce back into the auth flow itself.
  const path = raw.split("?")[0] ?? "/";
  if (path === "/auth" || path.startsWith("/auth/")) return fallback;

  return raw;
}
