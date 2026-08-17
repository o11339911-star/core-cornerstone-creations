/**
 * Server-only password-reset request.
 *
 * The browser sends one opaque identifier (e-mail OR national ID) and always
 * receives the same neutral answer. The account e-mail, the user id and the
 * existence of the identity are never returned, logged or stored.
 */

import { createHash } from "crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database";
import { isValidSaudiId, looksLikeEmail, normalizeNationalId } from "@/lib/identity-format";
import { findUserByNationalId } from "@/lib/identity-crypto.server";
import { allowAttempt } from "@/lib/auth-identity.server";

function publishableClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("AUTH_FAILED");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** SHA-256 of the normalised input — never the raw e-mail or identity number. */
function subjectHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function audit(event: string, hash: string, outcome: string) {
  try {
    const client = await admin();
    await client
      .from("auth_security_events")
      .insert({ event, subject_hash: hash.slice(0, 32), outcome });
  } catch {
    // Auditing must never break the user-facing flow.
  }
}

export type ResetRequestResult = { ok: true } | { ok: false; reason: "throttled" };

/**
 * Always resolves to the same neutral outcome unless the caller is throttled.
 * `clientKey` is an already-hashed coarse client fingerprint from the request.
 */
export async function requestPasswordReset(
  rawIdentifier: string,
  redirectTo: string,
  clientKey: string,
): Promise<ResetRequestResult> {
  const identifier = rawIdentifier.trim();
  const hash = subjectHash(identifier);

  // Per-identifier cooldown + per-client budget: both must allow the attempt.
  const perSubject = await allowAttempt(`reset:${hash.slice(0, 32)}`, 3, 900);
  const perClient = await allowAttempt(`reset-client:${clientKey.slice(0, 32)}`, 12, 900);
  if (!perSubject || !perClient) {
    await audit("password_reset_request", hash, "throttled");
    return { ok: false, reason: "throttled" };
  }

  let email: string | null = null;

  if (looksLikeEmail(identifier)) {
    email = identifier.toLowerCase();
  } else {
    const digits = normalizeNationalId(identifier);
    if (isValidSaudiId(digits)) {
      const userId = await findUserByNationalId(digits);
      if (userId) {
        const client = await admin();
        const { data, error } = await client.auth.admin.getUserById(userId);
        if (!error && data.user?.email) email = data.user.email;
      }
    }
  }

  if (!email) {
    await audit("password_reset_request", hash, "no_account");
    return { ok: true };
  }

  const { error } = await publishableClient().auth.resetPasswordForEmail(email, { redirectTo });
  await audit("password_reset_request", hash, error ? "send_failed" : "sent");

  // Supabase rate-limit (429) and delivery errors stay invisible to the client.
  return { ok: true };
}
