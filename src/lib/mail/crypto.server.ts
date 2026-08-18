/**
 * تشفير توكنات صناديق البريد — خادمي بحت.
 * لا تُخزَّن أي قيمة سر بنص واضح، ولا تُعاد أبدًا إلى المتصفح.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

function key(): Buffer {
  const raw =
    process.env['MAILBOX_TOKEN_SECRET'] ?? process.env['APP_USER_CONNECTION_KEY_SECRET'] ?? "";
  if (!raw) throw new Error("MISSING_KEY:MAILBOX_TOKEN_SECRET");
  return scryptSync(raw, "rakeez-mailbox-v1", 32);
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  const [v, iv, tag, body] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("BAD_CIPHER");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
