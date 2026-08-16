/**
 * حدود تشغيل العارضين المحليين (DXF / IFC).
 *
 * الأرقام محافظة عمدًا: التحويل يجري كاملًا داخل متصفح المستخدم، فلا نسمح
 * بملفات تُجمّد الصفحة. تُعرض الحدود في الواجهة بصراحة قبل المحاولة.
 */

export const MB = 1024 * 1024;

/** الحد الأقصى لملف DXF المسموح بتحليله محليًا. */
export const DXF_MAX_BYTES = 25 * MB;
/** الحد الأقصى لملف IFC (تجريبي — التحويل runtime ثقيل جدًا). */
export const IFC_MAX_BYTES = 12 * MB;

/** مهلة التحميل/التحليل قبل الإلغاء. */
export const DXF_TIMEOUT_MS = 30_000;
export const IFC_TIMEOUT_MS = 60_000;

export type LimitCheck =
  | { ok: true }
  | { ok: false; reason: "too_large"; limitBytes: number; actualBytes: number };

export function checkSize(bytes: number | null | undefined, limitBytes: number): LimitCheck {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return { ok: true };
  if (bytes > limitBytes) return { ok: false, reason: "too_large", limitBytes, actualBytes: bytes };
  return { ok: true };
}

/** ميغابايت بأرقام لاتينية، منزلة عشرية واحدة كحد أقصى. */
export function formatMb(bytes: number): string {
  const mb = bytes / MB;
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
