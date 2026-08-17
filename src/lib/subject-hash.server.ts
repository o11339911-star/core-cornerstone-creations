/**
 * Keyed pseudonymisation for sensitive identifiers (e-mail, national ID,
 * commercial registration, coarse client fingerprints).
 *
 * A bare SHA-256 of a 10-digit ID or of an e-mail address is trivially
 * brute-forceable, so every rate-limit key and every `subject_hash` written to
 * `auth_security_events` MUST be an HMAC keyed with a server-only secret.
 * There is no unsalted fallback: when the key is missing the caller fails
 * internally and answers neutrally.
 */

import { createHmac, scryptSync } from "crypto";

let cached: Buffer | null = null;

function key(): Buffer {
  if (cached) return cached;
  const raw = process.env["IDENTITY_HMAC_KEY"];
  if (!raw) throw new Error("MISSING_KEY:IDENTITY_HMAC_KEY");
  cached = scryptSync(raw, "rakeez-identity-v1", 32);
  return cached;
}

/** HMAC-SHA256 hex digest of the normalised value. Throws when unkeyed. */
export function subjectHmac(value: string): string {
  return createHmac("sha256", key()).update(value.trim().toLowerCase()).digest("hex");
}
