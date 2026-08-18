/** حالة OAuth موقّعة: تربط عودة المزوّد بالمستخدم الصحيح دون وسيط قابل للتزوير. */
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const raw =
    process.env['MAILBOX_TOKEN_SECRET'] ?? process.env['APP_USER_CONNECTION_KEY_SECRET'] ?? "";
  if (!raw) throw new Error("MISSING_KEY:MAILBOX_TOKEN_SECRET");
  return raw;
}

export type MailState = {
  userId: string;
  entityId: string | null;
  provider: string;
  exp: number;
};

export function signState(state: MailState): string {
  const body = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(raw: string): MailState | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MailState;
    if (!parsed.userId || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
