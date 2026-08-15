import { inflateSync } from "fflate";

import { newBlockId, reportContentSchema, type ReportBlock } from "./blocks";
import type { ParseResult } from "./docx-import.server";

/**
 * Phase 15-B — PDF ➜ draft blocks.
 * PDF carries no document structure, only positioned glyphs, so this is an
 * intentionally rough first pass. The result is ALWAYS a draft that a human
 * must review side by side before the template can be activated (enforced in
 * the database by `activate_report_template`).
 */

type ExtractedLine = { text: string; size: number; page: number };

function decodeLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    i += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b" || next === "f") out += " ";
    else if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3) {
        const c = raw[i + 1];
        if (c === undefined || c < "0" || c > "7") break;
        oct += c;
        i += 1;
      }
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += next;
  }
  return out;
}

function decodeHex(raw: string): string {
  const clean = raw.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  if (clean.length % 4 === 0 && clean.length > 0 && /^(00|d[89ab])/i.test(clean.slice(0, 2))) {
    // UTF-16BE (common for non-Latin text)
    for (let i = 0; i + 3 < clean.length; i += 4) out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    return out;
  }
  for (let i = 0; i + 1 < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

/** Pull decompressed content streams out of the raw PDF bytes. */
function contentStreams(bytes: Uint8Array): string[] {
  const streams: string[] = [];
  const marker = new TextEncoder().encode("stream");
  const endMarker = new TextEncoder().encode("endstream");

  const indexOfSeq = (hay: Uint8Array, needle: Uint8Array, from: number) => {
    outer: for (let i = from; i <= hay.length - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) if (hay[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  };

  let pos = 0;
  while (pos < bytes.length) {
    const start = indexOfSeq(bytes, marker, pos);
    if (start === -1) break;
    let dataStart = start + marker.length;
    if (bytes[dataStart] === 0x0d) dataStart += 1;
    if (bytes[dataStart] === 0x0a) dataStart += 1;
    const end = indexOfSeq(bytes, endMarker, dataStart);
    if (end === -1) break;
    const chunk = bytes.slice(dataStart, end);
    let text: string | null = null;
    try {
      text = new TextDecoder("latin1").decode(inflateSync(chunk));
    } catch {
      try {
        const raw = new TextDecoder("latin1").decode(chunk);
        text = /BT[\s\S]*ET/.test(raw) ? raw : null;
      } catch {
        text = null;
      }
    }
    if (text && /(Tj|TJ)/.test(text)) streams.push(text);
    pos = end + endMarker.length;
  }
  return streams;
}

/**
 * Some producers emit UTF-8 bytes inside byte strings; those arrive here as
 * one char per byte. Recover them when the byte pattern is valid UTF-8.
 */
function recoverUtf8(input: string): string {
  if (!/[\u0080-\u00ff]/.test(input)) return input;
  if ([...input].some((c) => c.charCodeAt(0) > 0xff)) return input;
  const bytes = Uint8Array.from([...input].map((c) => c.charCodeAt(0)));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return input;
  }
}

function extractLines(bytes: Uint8Array): ExtractedLine[] {
  const lines: ExtractedLine[] = [];
  const streams = contentStreams(bytes);

  streams.forEach((stream, pageIndex) => {
    let size = 12;
    let current = "";
    const push = () => {
      const text = recoverUtf8(current).replace(/\s+/g, " ").trim();
      if (text) lines.push({ text, size, page: pageIndex + 1 });
      current = "";
    };

    const tokenRe =
      /\/[A-Za-z0-9#+._-]+\s+([\d.]+)\s+Tf|\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|\bT[dD]\b|\bTm\b|\bT\*\b|\bTJ\b|\bTj\b|\bET\b|\bBT\b/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(stream))) {
      const tok = m[0];
      if (tok.endsWith("Tf")) {
        const parsed = Number(m[1]);
        if (Number.isFinite(parsed) && parsed > 0) size = parsed;
      } else if (tok.startsWith("(")) {
        current += decodeLiteral(tok.slice(1, -1));
      } else if (tok.startsWith("<")) {
        current += decodeHex(tok.slice(1, -1));
      } else if (tok === "Td" || tok === "TD" || tok === "Tm" || tok === "T*" || tok === "ET") {
        push();
      }
    }
    push();
  });

  return lines;
}

export function parsePdfToBlocks(fileBytes: Uint8Array): ParseResult {
  const dropped: ParseResult["dropped"] = [];
  const warnings: string[] = [
    "الاستخراج من PDF تقريبي: لا يوجد بناء منطقي داخل الملف — راجع كل كتلة يدويًا قبل التفعيل.",
    "الجداول لا تُستنتج تلقائيًا؛ تظهر كأسطر نصية وتحتاج تحويلًا يدويًا إلى كتلة جدول.",
    "لا يوجد OCR: صفحات PDF الممسوحة ضوئيًا لن تُنتج نصًا.",
  ];

  const lines = extractLines(fileBytes);
  if (!lines.length) {
    return {
      content: { blocks: [] },
      dropped: [{ what: "نص الصفحات", where: "الملف كاملًا", why: "لم يُعثر على نص قابل للاستخراج (ملف صور/ممسوح؟)" }],
      warnings,
    };
  }

  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 12;

  const blocks: ReportBlock[] = [];
  let lastPage = lines[0]?.page ?? 1;
  let pendingList: string[] | null = null;
  const flushList = () => {
    if (pendingList && pendingList.length)
      blocks.push({ id: newBlockId(), type: "list", ordered: false, items: pendingList.slice(0, 200) });
    pendingList = null;
  };

  for (const line of lines) {
    if (line.page !== lastPage) {
      flushList();
      blocks.push({ id: newBlockId(), type: "page_break" });
      lastPage = line.page;
    }
    const bullet = /^([-•*\u2022\u25cf]|\d+[.)])\s+/.exec(line.text);
    if (bullet) {
      pendingList = pendingList ?? [];
      pendingList.push(line.text.replace(bullet[0], "").slice(0, 1000));
      continue;
    }
    flushList();
    const isHeading = line.size >= median * 1.15 && line.text.length <= 120;
    if (isHeading) {
      const level: 1 | 2 | 3 = line.size >= median * 1.6 ? 1 : line.size >= median * 1.3 ? 2 : 3;
      blocks.push({ id: newBlockId(), type: "heading", level, text: line.text.slice(0, 500) });
    } else {
      blocks.push({ id: newBlockId(), type: "paragraph", text: line.text.slice(0, 8000) });
    }
  }
  flushList();

  dropped.push({ what: "التنسيق البصري (خطوط، ألوان، مواضع)", where: "الملف كاملًا", why: "غير قابل للتمثيل في مخطط الكتل" });
  dropped.push({ what: "الصور والرسومات", where: "الملف كاملًا", why: "نقل الصور خارج نطاق هذه الدفعة" });

  const limited = blocks.slice(0, 1000);
  if (blocks.length > 1000) dropped.push({ what: "كتل زائدة", where: "الملف", why: "الحد الأقصى 1000 كتلة" });

  const safe: ReportBlock[] = [];
  for (const [idx, block] of limited.entries()) {
    const parsed = reportContentSchema.safeParse({ blocks: [block] });
    if (parsed.success) safe.push(block);
    else dropped.push({ what: `كتلة ${block.type}`, where: `ترتيب ${idx + 1}`, why: "فشل التحقق من المخطط" });
  }

  return { content: { blocks: safe }, dropped, warnings };
}

/** Plain text per page, used by the side-by-side review screen. */
export function extractPdfPagesText(fileBytes: Uint8Array): string[] {
  const lines = extractLines(fileBytes);
  const pages: string[][] = [];
  for (const line of lines) {
    const idx = line.page - 1;
    pages[idx] = pages[idx] ?? [];
    (pages[idx] as string[]).push(line.text);
  }
  return pages.map((p) => (p ?? []).join("\n"));
}
