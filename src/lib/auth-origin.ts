/**
 * Where Supabase Auth is allowed to send the user back to.
 *
 * Production e-mails MUST return to the published app, never to the Lovable
 * editor or a preview URL. Development origins are honoured only when the code
 * itself is running there, so a production user can never be bounced into a
 * dev environment.
 */

import { sanitizeRedirect } from "@/lib/safe-redirect";

export const PRODUCTION_ORIGIN = "https://core-cornerstone-creations.lovable.app";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
// Lovable preview/dev hosts for this project only.
const PREVIEW_HOST = /^(id-preview--[a-z0-9-]+|project--[a-z0-9-]+(-dev)?)\.lovable\.app$/i;

/** Origin that Supabase should redirect back to for the current environment. */
export function authRedirectOrigin(): string {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN;

  const { hostname, origin, protocol } = window.location;
  if (protocol !== "http:" && protocol !== "https:") return PRODUCTION_ORIGIN;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (LOCAL_HOST.test(hostname) || PREVIEW_HOST.test(hostname)) return origin;

  // Anything else (e.g. the editor shell on lovable.dev) falls back to the
  // published application.
  return PRODUCTION_ORIGIN;
}

/** Absolute URL of the in-app verification handler. */
export function authCallbackUrl(): string {
  return `${authRedirectOrigin()}/auth/callback`;
}

/** Absolute URL of the password-reset screen. */
export function passwordResetUrl(): string {
  return `${authRedirectOrigin()}/auth/reset-password`;
}

/** Same-origin destination used after a successful verification. */
export function verifiedDestination(next?: string | null): string {
  return sanitizeRedirect(next, "/select-account");
}
