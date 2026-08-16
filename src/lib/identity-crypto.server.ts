/**
 * Server-only identity cryptography.
 *
 * Two independent values are derived from the raw national/CR number:
 *  1. A deterministic HMAC-SHA256 fingerprint (IDENTITY_HMAC_KEY) used ONLY for
 *     uniqueness and exact matching — it is not reversible.
 *  2. An AES-256-GCM ciphertext (IDENTITY_ENC_KEY) that keeps the full number
 *     recoverable for legitimate, audited reveals.
 *
 * Neither key is ever stored in the database, and the raw number never leaves
 * this module except through an explicit, audited decrypt.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from "crypto";

function keyBytes(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`MISSING_KEY:${name}`);
  return scryptSync(raw, "rakeez-identity-v1", 32);
}

/** Deterministic, non-reversible fingerprint used for uniqueness + matching. */
export function identityFingerprint(digits: string): string {
  return createHmac("sha256", keyBytes("IDENTITY_HMAC_KEY")).update(digits).digest("hex");
}

/** Reversible envelope: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encryptIdentity(digits: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes("IDENTITY_ENC_KEY"), iv);
  const enc = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(
    ".",
  );
}

export function decryptIdentity(payload: string): string {
  const [version, iv, tag, body] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("BAD_CIPHER");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes("IDENTITY_ENC_KEY"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Stores fingerprint + ciphertext for a user. Returns false when taken by someone else. */
export async function storeIdentitySecret(userId: string, digits: string): Promise<boolean> {
  const client = await admin();
  const { data, error } = await client.rpc("svc_identity_upsert", {
    _user_id: userId,
    _fingerprint: identityFingerprint(digits),
    _cipher: encryptIdentity(digits),
    _last4: digits.slice(-4),
  });
  if (error) return false;
  return data === "OK";
}

/** Exact match on the deterministic fingerprint — no scanning, no decryption. */
export async function findUserByNationalId(digits: string): Promise<string | null> {
  const client = await admin();
  const { data, error } = await client.rpc("svc_identity_lookup", {
    _fingerprint: identityFingerprint(digits),
  });
  if (error || !data) return null;
  return data as string;
}

/** Audited reveal of the full number; callers must already be authorised. */
export async function revealIdentity(subjectUserId: string, actorUserId: string): Promise<string | null> {
  const client = await admin();
  const { data, error } = await client.rpc("svc_identity_cipher", {
    _user_id: subjectUserId,
    _actor: actorUserId,
  });
  if (error || !data) return null;
  try {
    return decryptIdentity(data as string);
  } catch {
    return null;
  }
}
