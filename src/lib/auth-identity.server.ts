/**
 * Server-only helpers for identity-aware sign-up and sign-in.
 *
 * Invariants:
 * - The raw national ID lives only inside these functions and inside the
 *   SECURITY DEFINER database functions; it is never returned, logged or
 *   embedded in an error message.
 * - The account e-mail is NEVER returned to the browser when a login is
 *   resolved from a national ID.
 * - Every public entry point is throttled and answers with one generic error,
 *   so neither e-mail nor identity existence can be enumerated.
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database";
import { isValidSaudiId, looksLikeEmail, normalizeNationalId } from "@/lib/identity-format";
import { findUserByNationalId, storeIdentitySecret } from "@/lib/identity-crypto.server";
import { subjectHmac } from "@/lib/subject-hash.server";

export const GENERIC_AUTH_ERROR = "AUTH_FAILED";

function publishableClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error(GENERIC_AUTH_ERROR);
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Throttle keys are hashed: no e-mail and no identity number is ever stored. */
function throttleKey(scope: string, value: string) {
  // HMAC keyed with a server-only secret; never a guessable plain digest.
  return `${scope}:${subjectHmac(value).slice(0, 32)}`;
}

/** Sliding-window throttle stored server-side. Returns false when over budget. */
export async function allowAttempt(key: string, limit: number, windowSeconds: number) {
  const client = await admin();
  const { data, error } = await client.rpc("svc_auth_throttle", {
    _key: key,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) return true; // never lock users out because the counter failed
  return data !== false;
}

/**
 * نسخة fail-closed تُستخدم في المسارات الحساسة (تسجيل الدخول): إذا تعذّر
 * الوصول لمخزن التقييد لا نسمح بالمتابعة إلى حلّ الهوية أو Supabase Auth.
 */
async function checkAttemptStrict(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<"allowed" | "blocked" | "unavailable"> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("svc_auth_throttle", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) return "unavailable";
    return data === false ? "blocked" : "allowed";
  } catch {
    return "unavailable";
  }
}

export type SessionPayload = { access_token: string; refresh_token: string };

export type SignInResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: "invalid" | "throttled" | "unconfirmed" | "unavailable" | "suspended" };

/**
 * يحلّ رقم الهوية إلى معرّف حساب Auth داخل الخادم فقط.
 * لا يعيد البريد إطلاقًا، ويميّز بين "غير موجود" و"الخدمة غير متاحة"
 * حتى لا يظهر عطل بيئي (مثل مفتاح خدمة غير مضبوط) كبيانات دخول خاطئة.
 */
async function resolveUserIdByNationalId(
  digits: string,
): Promise<{ status: "found"; userId: string } | { status: "not_found" } | { status: "unavailable" }> {
  try {
    let userId: string | null = await findUserByNationalId(digits);
    if (!userId) {
      const client = await admin();
      const { data: legacy } = await client.rpc("svc_resolve_identity_login", {
        _national_id: digits,
      });
      userId = (legacy as string | null) ?? null;
    }
    return userId ? { status: "found", userId } : { status: "not_found" };
  } catch {
    // مفتاح خدمة/تشفير غير مضبوط أو تعذّر الوصول: لا نخلطه ببيانات خاطئة.
    return { status: "unavailable" };
  }
}

/**
 * Resolves e-mail OR national ID to an account and signs in — server-side only.
 * `clientKey` بصمة عميل خادمية (HMAC لعنوان موثوق من حافة المنصة) أو نص فارغ.
 */
export async function signInWithIdentifier(
  rawIdentifier: string,
  password: string,
  clientKey = "",
): Promise<SignInResult> {
  const identifier = rawIdentifier.trim();

  // بعدان: بصمة المعرّف المطبّع دائمًا، وبصمة العميل الموثوقة إن توفّرت.
  let identifierKey: string;
  try {
    identifierKey = throttleKey("login", identifier.toLowerCase());
  } catch {
    // مفتاح HMAC الخادمي غير مضبوط: لا نُكمل بمفتاح ضعيف أو بلا تقييد.
    return { ok: false, reason: "unavailable" };
  }

  const gates: Array<Promise<"allowed" | "blocked" | "unavailable">> = [
    checkAttemptStrict(identifierKey, 8, 600),
  ];
  if (clientKey) gates.push(checkAttemptStrict(`login-client:${clientKey}`, 30, 600));

  const verdicts = await Promise.all(gates);
  if (verdicts.includes("unavailable")) return { ok: false, reason: "unavailable" };
  if (verdicts.includes("blocked")) return { ok: false, reason: "throttled" };

  let email: string | null = null;

  if (looksLikeEmail(identifier)) {
    email = identifier;
  } else {
    const digits = normalizeNationalId(identifier);
    // 10 أرقام ASCII فقط، وأي رقم غير لاتيني يكون قد أُزيل هنا فيسقط الطول.
    if (!/^[0-9]{10}$/.test(identifier) || !isValidSaudiId(digits))
      return { ok: false, reason: "invalid" };

    const resolved = await resolveUserIdByNationalId(digits);
    if (resolved.status === "unavailable") return { ok: false, reason: "unavailable" };
    if (resolved.status === "not_found") return { ok: false, reason: "invalid" };

    try {
      const client = await admin();
      const { data: found, error: adminError } = await client.auth.admin.getUserById(
        resolved.userId,
      );
      if (adminError) return { ok: false, reason: "unavailable" };
      if (!found.user?.email) return { ok: false, reason: "invalid" };
      email = found.user.email;
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }

  const { data, error } = await publishableClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    const unconfirmed = (error?.message ?? "").toLowerCase().includes("not confirmed");
    return { ok: false, reason: unconfirmed ? "unconfirmed" : "invalid" };
  }

  // الحساب المجمّد لا يُسمح له بمتابعة الدخول (public.my_account_suspension).
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (url && key) {
    const asUser = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
    const rpc = asUser.rpc.bind(asUser) as unknown as (
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const suspension = await rpc("my_account_suspension");
    if (!suspension.error) {
      const row = suspension.data as { suspended?: boolean } | boolean | null;
      const suspended = typeof row === "boolean" ? row : row?.suspended === true;
      if (suspended) return { ok: false, reason: "suspended" };
    }
  }

  return {
    ok: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}

export type SignUpResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; reason: "invalid_id" | "identity_taken" | "throttled" | "failed" };

/**
 * Creates the account through the normal Supabase sign-up flow (so the real
 * confirmation e-mail is sent) and links the identity in the same server call,
 * which is the only place the raw number is ever seen.
 */
export async function signUpWithIdentity(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string | null;
  nationalId: string;
  redirectTo: string;
}): Promise<SignUpResult> {
  const digits = normalizeNationalId(input.nationalId);
  if (!isValidSaudiId(digits)) return { ok: false, reason: "invalid_id" };

  if (!(await allowAttempt(throttleKey("signup", input.email), 5, 900))) {
    return { ok: false, reason: "throttled" };
  }

  const { data, error } = await publishableClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: input.redirectTo,
      data: { full_name: input.fullName, phone: input.phone },
    },
  });

  if (error || !data.user) return { ok: false, reason: "failed" };

  const client = await admin();
  const { error: linkError } = await client.rpc("svc_register_identity", {
    _user_id: data.user.id,
    _national_id: digits,
  });

  if (linkError) {
    const alreadyLinked = linkError.message.includes("IDENTITY_ALREADY_LINKED");
    // Remove the half-created account so the identity stays unique and the
    // e-mail address is not silently burnt.
    if (data.user.identities?.length !== 0) {
      await client.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    }
    return { ok: false, reason: alreadyLinked ? "identity_taken" : "failed" };
  }

  // Store the reversible ciphertext plus the deterministic fingerprint.
  const stored = await storeIdentitySecret(data.user.id, digits);
  if (!stored) {
    if (data.user.identities?.length !== 0) {
      await client.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    }
    return { ok: false, reason: "identity_taken" };
  }

  return { ok: true, needsConfirmation: !data.session };
}
