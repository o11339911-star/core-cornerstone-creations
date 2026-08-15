/**
 * Phase 15-B — upload gate for template source files.
 * Same strictness as Phase 14: extension allowlist + explicit denylist +
 * MIME check + real magic-byte sniffing + size cap. Nothing here trusts the
 * browser; the server re-runs every check before a byte reaches storage.
 */

export const IMPORT_MAX_BYTES = 15 * 1024 * 1024; // 15MB

export const IMPORT_ALLOWED_EXT = ["docx", "pdf"] as const;
export type ImportKind = (typeof IMPORT_ALLOWED_EXT)[number];

export const IMPORT_MIME: Record<ImportKind, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/** Never accepted, even if the MIME header claims otherwise. */
export const IMPORT_DENIED_EXT = [
  "svg",
  "html",
  "htm",
  "xhtml",
  "exe",
  "bat",
  "cmd",
  "com",
  "sh",
  "js",
  "mjs",
  "jsx",
  "php",
  "zip",
  "rar",
  "7z",
  "doc",
  "rtf",
  "xml",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
];

export type ImportCheckResult = { ok: true; kind: ImportKind } | { ok: false; reason: string };

/** Reject any file whose name carries more than one extension segment. */
export function hasDoubleExtension(fileName: string): boolean {
  const base = fileName.split("/").pop() ?? fileName;
  const parts = base.split(".").filter(Boolean);
  return parts.length > 2;
}

export function checkImportFileName(fileName: string): ImportCheckResult {
  const base = (fileName.split("/").pop() ?? fileName).trim().toLowerCase();
  if (!base || base.startsWith(".")) return { ok: false, reason: "INVALID_FILENAME" };
  if (base.includes("\u0000")) return { ok: false, reason: "INVALID_FILENAME" };
  if (hasDoubleExtension(base)) return { ok: false, reason: "DOUBLE_EXTENSION" };

  const ext = base.includes(".") ? (base.split(".").pop() as string) : "";
  if (!ext) return { ok: false, reason: "MISSING_EXTENSION" };
  if (IMPORT_DENIED_EXT.includes(ext)) return { ok: false, reason: "EXTENSION_DENIED" };
  if (!(IMPORT_ALLOWED_EXT as readonly string[]).includes(ext))
    return { ok: false, reason: "EXTENSION_NOT_ALLOWED" };
  return { ok: true, kind: ext as ImportKind };
}

/** DOCX is a ZIP (`PK\x03\x04`); PDF starts with `%PDF-`. */
export function sniffMagicBytes(bytes: Uint8Array): ImportKind | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
    return "pdf";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
    return "docx";
  return null;
}

export function checkImportFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  bytes?: Uint8Array,
): ImportCheckResult {
  const named = checkImportFileName(fileName);
  if (!named.ok) return named;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, reason: "EMPTY_FILE" };
  if (sizeBytes > IMPORT_MAX_BYTES) return { ok: false, reason: "FILE_TOO_LARGE" };
  if (mimeType !== IMPORT_MIME[named.kind]) return { ok: false, reason: "MIME_MISMATCH" };
  if (bytes) {
    const sniffed = sniffMagicBytes(bytes);
    if (sniffed !== named.kind) return { ok: false, reason: "MAGIC_BYTES_MISMATCH" };
  }
  return { ok: true, kind: named.kind };
}

export const IMPORT_REASON_AR: Record<string, string> = {
  INVALID_FILENAME: "اسم الملف غير صالح",
  DOUBLE_EXTENSION: "الامتداد المزدوج مرفوض",
  MISSING_EXTENSION: "الملف بلا امتداد",
  EXTENSION_DENIED: "نوع الملف محظور",
  EXTENSION_NOT_ALLOWED: "يُقبل DOCX أو PDF فقط",
  EMPTY_FILE: "الملف فارغ",
  FILE_TOO_LARGE: "حجم الملف يتجاوز 15 ميجابايت",
  MIME_MISMATCH: "نوع المحتوى لا يطابق الامتداد",
  MAGIC_BYTES_MISMATCH: "محتوى الملف الفعلي لا يطابق امتداده",
};
