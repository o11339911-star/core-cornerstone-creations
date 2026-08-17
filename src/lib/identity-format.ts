/**
 * Shared (client + server) national-ID normalisation and checksum.
 *
 * The value itself is never logged, never stored client-side and never put in
 * a URL — these helpers only decide whether a typed value is well formed.
 */

/** Arabic-Indic (U+0660..U+0669) and Persian/Extended (U+06F0..U+06F9) digits. */
export function identityToAsciiDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += char;
  }
  return out;
}

/** ASCII 0-9 only, everything else removed. */
export function normalizeNationalId(input: string): string {
  return identityToAsciiDigits(input).replace(/[^0-9]/g, "");
}

/** Saudi national ID / iqama: 10 ASCII digits starting with 1 or 2 + Luhn-variant checksum. */
export function isValidSaudiId(value: string): boolean {
  if (!/^[12][0-9]{9}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const digit = Number(value[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

/** True when the identifier typed in the single sign-in field looks like an e-mail. */
export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

/** true حين يحوي النص أرقامًا عربية/هندية/فارسية (U+0660–U+0669, U+06F0–U+06F9). */
export function containsNonAsciiDigits(input: string | null | undefined): boolean {
  if (!input) return false;
  return /[\u0660-\u0669\u06F0-\u06F9]/.test(input);
}

/** الرسالة الموحّدة لرفض الأرقام غير الإنجليزية. */
export const NON_ASCII_DIGITS_MESSAGE = "استخدم الأرقام الإنجليزية 0-9 فقط";

/** تاريخ اليوم بتوقيت الرياض بصيغة YYYY-MM-DD (أرقام ASCII). */
export function riyadhToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** الحد الأدنى المسموح لتاريخ الانتهاء: غدًا بتوقيت الرياض. */
export function riyadhTomorrow(): string {
  const today = riyadhToday();
  const [y, m, d] = today.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return next.toISOString().slice(0, 10);
}

/** تاريخ تقويمي صحيح فعلًا (يرفض 2025-02-29 ويقبل 2028-02-29). */
export function isRealCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d
  );
}
