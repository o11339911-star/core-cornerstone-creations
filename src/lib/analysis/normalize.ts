import { toLatinDigits } from "@/lib/format";

/**
 * Normalisation helpers for the deed / building-licence analysis review step.
 *
 * Extracted text carries dates in many shapes (Arabic-Indic digits, dd/mm/yyyy,
 * and — very often on Saudi deeds — a Hijri date). The database columns are
 * plain `date`, so anything that is not a real ISO Gregorian date must be
 * converted here or rejected with a clear Arabic message, never sent raw.
 */

export type DateNormalization =
  | { ok: true; iso: string; calendar: "gregorian" | "hijri" }
  | { ok: false; reason: "format" | "range" };

const ISLAMIC_FORMATTER = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

function hijriPartsOf(date: Date): { y: number; m: number; d: number } {
  const parts = ISLAMIC_FORMATTER.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Umm al-Qura Hijri date -> ISO Gregorian date, via a bounded local search. */
export function hijriToIso(hy: number, hm: number, hd: number): string | null {
  const estimate = Math.round((hy - 1) * 354.367 + (hm - 1) * 29.53 + (hd - 1));
  const base = Date.UTC(622, 6, 16) + estimate * 86400000;
  for (let offset = -60; offset <= 60; offset += 1) {
    const candidate = new Date(base + offset * 86400000);
    const parts = hijriPartsOf(candidate);
    if (parts.y === hy && parts.m === hm && parts.d === hd) return isoOf(candidate);
  }
  return null;
}

/**
 * Accepts `yyyy-mm-dd`, `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy` in Latin or
 * Arabic-Indic digits. A year in 1300..1500 is treated as Hijri and converted.
 */
export function normalizeDateInput(raw: string | null | undefined): DateNormalization | null {
  const text = toLatinDigits((raw ?? "").trim()).replace(/[\u200e\u200f]/g, "");
  if (!text) return null;

  const parts = text.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return { ok: false, reason: "format" };

  let y: number;
  let m: number;
  let d: number;
  if (parts[0]!.length === 4) {
    y = Number(parts[0]);
    m = Number(parts[1]);
    d = Number(parts[2]);
  } else {
    d = Number(parts[0]);
    m = Number(parts[1]);
    y = Number(parts[2]);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, reason: "range" };

  if (y >= 1300 && y <= 1500) {
    const iso = hijriToIso(y, m, d);
    return iso ? { ok: true, iso, calendar: "hijri" } : { ok: false, reason: "range" };
  }

  if (y < 1900 || y > 2200) return { ok: false, reason: "range" };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, reason: "range" };
  }
  return { ok: true, iso: isoOf(date), calendar: "gregorian" };
}

/** Area text ("1,250.5 م2") -> positive number, or null when unusable. */
export function normalizeArea(raw: string | null | undefined): number | null {
  const cleaned = toLatinDigits((raw ?? "").trim())
    .replace(/[\u066b]/g, ".")
    .replace(/[\s,\u066c]/g, "");
  const match = /^-?\d+(?:\.\d+)?/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}
