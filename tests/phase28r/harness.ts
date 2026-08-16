/**
 * Phase 28-R — pilot comprehensive test harness (TEST PATH ONLY).
 *
 * Not part of the executable application code. Run with:
 *   bun tests/phase28r/harness.ts <batch|all>
 *
 * Rules encoded here:
 *  - synthetic data only, prefix p28r-*@example.com and TEST-28R
 *  - never touches permanent users/entities
 *  - never prints access/refresh tokens
 *  - isolation must be proven by a server-side rejection reason
 */
const URL_ = process.env["SUPABASE_URL"]!;
const ANON = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

export const RUN_ID = process.env["P28R_RUN_ID"] ?? "";
export const PREFIX = "p28r-";
export const ENTITY_PREFIX = "TEST-28R";
export const PASSWORD = "Rk!28R-p1lot-2026";

export type Result = {
  batch: string;
  id: string;
  title: string;
  expect: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "INFO";
  evidence: string;
};

export const results: Result[] = [];
export function record(r: Result) {
  results.push(r);
  const mark = r.status === "PASS" ? "+" : r.status === "FAIL" ? "!" : "~";
  console.log(`${mark} [${r.batch}] ${r.id} ${r.title} :: ${r.status} :: ${r.evidence.slice(0, 260)}`);
}

/* ------------------------------------------------------------ http helpers */

type Auth = { kind: "service" } | { kind: "anon" } | { kind: "user"; token: string };

function headers(auth: Auth, extra: Record<string, string> = {}) {
  const key = auth.kind === "service" ? SERVICE : ANON;
  const bearer = auth.kind === "user" ? auth.token : key;
  return {
    apikey: key,
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function rest(
  auth: Auth,
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<{ ok: boolean; status: number; body: any; reason: string }> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: headers(auth, init.prefer ? { Prefer: init.prefer } : {}),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const reason =
    body && typeof body === "object" && !Array.isArray(body)
      ? [body.code, body.message, body.details, body.hint].filter(Boolean).join(" | ")
      : `HTTP ${res.status}`;
  return { ok: res.ok, status: res.status, body, reason };
}

export const rpc = (auth: Auth, fn: string, args: Record<string, unknown>) =>
  rest(auth, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

export async function authApi(path: string, init: RequestInit, service = true) {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: service ? SERVICE : ANON,
      Authorization: `Bearer ${service ? SERVICE : ANON}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

/** Signs in and returns tokens; tokens are never logged. */
export async function signIn(email: string): Promise<{ access: string; refresh: string }> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`sign-in failed for ${email}: ${body.error_code ?? body.msg ?? res.status}`);
  }
  return { access: body.access_token, refresh: body.refresh_token };
}

export const sha256Hex = async (data: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Storage direct/unsigned access probe — must never return the object bytes. */
export async function storageProbe(auth: Auth | null, bucket: string, path: string) {
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
    headers: auth ? headers(auth) : {},
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 300) };
}
