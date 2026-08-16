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
