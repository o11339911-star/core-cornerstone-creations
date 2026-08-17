/**
 * Server-only password-reset request.
 *
 * The browser sends one opaque identifier (e-mail OR national ID) and always
 * receives the same neutral answer. The account e-mail, the user id and the
 * existence of the identity are never returned, logged or stored. The redirect
 * destination is derived server-side from the fixed production origin, so the
 * client can never influence where the reset link points.
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database";
import { PRODUCTION_ORIGIN } from "@/lib/auth-origin";
import { subjectHmac } from "@/lib/subject-hash.server";
import { isValidSaudiId, looksLikeEmail, normalizeNationalId } from "@/lib/identity-format";
import { findUserByNationalId } from "@/lib/identity-crypto.server";
import { allowAttempt } from "@/lib/auth-identity.server";

/** Fixed, non-negotiable destination for every reset e-mail. */
const RESET_REDIRECT = `${PRODUCTION_ORIGIN}/auth/reset-password`;

/** Minimum wall-clock time so existing/non-existing accounts look alike. */
const MIN_RESPONSE_MS = 450;

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

/** Uniform result: the browser learns nothing beyond "request accepted". */
export type ResetRequestResult = { ok: true };

async function pad(startedAt: number) {
  const left = MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
}

/**
 * Always resolves to the same neutral outcome — including when throttled, when
 * the account does not exist and when delivery fails. `clientKeyHmac` is an
 * already-HMAC'd coarse client fingerprint computed by the caller.
 */
export async function requestPasswordReset(
  rawIdentifier: string,
  clientKeyHmac: string,
): Promise<ResetRequestResult> {
  const startedAt = Date.now();
  const identifier = rawIdentifier.trim();

  let hash: string;
  try {
    hash = subjectHmac(identifier);
  } catch {
    // Missing server key: fail internally, answer neutrally, no fallback hash.
    await pad(startedAt);
    return { ok: true };
  }

  // Per-identifier cooldown + per-client budget: both must allow the attempt.
  const perSubject = await allowAttempt(`reset:${hash.slice(0, 32)}`, 3, 900);
  const perClient = await allowAttempt(`reset-client:${clientKeyHmac.slice(0, 32)}`, 12, 900);
  if (!perSubject || !perClient) {
    await audit("password_reset_request", hash, "throttled");
    await pad(startedAt);
    return { ok: true };
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
    await pad(startedAt);
    return { ok: true };
  }

  let sendFailed = false;
  try {
    const { error } = await publishableClient().auth.resetPasswordForEmail(email, {
      redirectTo: RESET_REDIRECT,
    });
    sendFailed = Boolean(error);
  } catch {
    sendFailed = true;
  }
  await audit("password_reset_request", hash, sendFailed ? "send_failed" : "sent");

  // Supabase rate-limit (429) and delivery errors stay invisible to the client.
  await pad(startedAt);
  return { ok: true };
}
