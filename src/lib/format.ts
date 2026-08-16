/**
 * Rakeez central formatting layer (Phase 29A).
 *
 * ONE place decides how every number, date, time, money value and percentage
 * is rendered for the user. Global rules enforced here and nowhere else:
 *
 * - Digits are ALWAYS Latin 0-9 (`numberingSystem: "latn"`). `ar-SA` alone
 *   renders Arabic-Indic digits, so the locale extension is forced centrally.
 * - Dates always use the Gregorian calendar, Asia/Riyadh, 24-hour clock.
 * - Visual shape: `15/08/2026 17:27`, `1,234,567.89`, `68%`.
 *
 * Never call `toLocaleString` / `Intl.*` directly in a component — import from
 * here so a future change lands everywhere at once.
 */

export const RIYADH_TZ = "Asia/Riyadh";

/** Locale that always yields Latin digits + Gregorian calendar. */
const NUM_LOCALE = "ar-u-nu-latn";
const DATE_LOCALE = "ar-u-ca-gregory-nu-latn";

const EMPTY = "—";

/* -------------------------------------------------------------------------
 * Digit normalisation (display + input)
 * ---------------------------------------------------------------------- */

/** Arabic-Indic (U+0660..U+0669) and Extended/Persian (U+06F0..U+06F9) digit ranges. */
const ARABIC_INDIC_START = 0x0660;
const EXTENDED_ARABIC_START = 0x06f0;

/**
 * Converts any Arabic-Indic or Persian digit to 0-9 and normalises the Arabic
 * decimal/thousands separators. Everything else is left untouched, so the
 * caret position in an input never shifts (length is preserved 1:1).
 */
export function toLatinDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= ARABIC_INDIC_START && code <= ARABIC_INDIC_START + 9) {
      out += String(code - ARABIC_INDIC_START);
    } else if (code >= EXTENDED_ARABIC_START && code <= EXTENDED_ARABIC_START + 9) {
      out += String(code - EXTENDED_ARABIC_START);
    } else if (char === "٫") {
      out += ".";
    } else if (char === "٬") {
      out += ",";
    } else {
      out += char;
    }
  }
  return out;
}

/** True when the string still contains a forbidden digit. */
export function hasNonLatinDigits(input: string): boolean {
  return /[\u0660-\u0669\u06f0-\u06f9]/.test(input);
}

/* -------------------------------------------------------------------------
 * Numbers
 * ---------------------------------------------------------------------- */

function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat(NUM_LOCALE, { numberingSystem: "latn", ...options });
}

/** `1,234,567.89` — grouped, Latin digits, up to 2 decimals by default. */
export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  return toLatinDigits(nf({ maximumFractionDigits: 2, ...options }).format(value));
}

/** Whole counts: badges, totals, pagination. */
export function formatCount(value: number | null | undefined): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

/** `68%` — value given as 0-100. */
export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  return `${formatNumber(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/** `12,500.00 SAR` — currency code stays a latin token after the amount. */
export function formatMoney(
  value: number | null | undefined,
  currency: string | null = "SAR",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  const amount = formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount} ${currency ?? "SAR"}`.trim();
}

/* -------------------------------------------------------------------------
 * Dates and times — always Gregorian, Asia/Riyadh, 24h, Latin digits
 * ---------------------------------------------------------------------- */

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dtf(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: RIYADH_TZ,
    hourCycle: "h23",
    ...options,
  });
}

/** `15/08/2026` */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return toLatinDigits(
    dtf({ year: "numeric", month: "2-digit", day: "2-digit" }).format(date),
  ).replace(/\u200f/g, "");
}

/** `17:27` */
export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return toLatinDigits(dtf({ hour: "2-digit", minute: "2-digit" }).format(date)).replace(
    /\u200f/g,
    "",
  );
}

/** `15/08/2026 17:27` — the canonical timestamp shape across Rakeez. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** `15 أغسطس 2026` — long form for legal / report headers. */
export function formatLongDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return toLatinDigits(dtf({ year: "numeric", month: "long", day: "numeric" }).format(date));
}

/** Value for `<input type="date">`: `2026-08-15` in Riyadh time. */
export function toDateInputValue(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const parts = dtf({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => toLatinDigits(parts.find((p) => p.type === type)?.value ?? "");
  return `${get("year")}-${get("month")}-${get("day")}`;
}
