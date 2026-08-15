import { unzipSync, strFromU8 } from "fflate";

import {
  FIELD_SOURCES,
  newBlockId,
  reportContentSchema,
  type ReportBlock,
  type ReportContent,
} from "./blocks";

/**
 * Phase 15-B — DOCX ➜ structured blocks.
 * Deliberately conservative: only shapes that map cleanly onto the Phase 15-A
 * block schema are converted. Everything else is dropped and reported, so the
 * user is never told the import is a visual match.
 */

export type DroppedItem = { what: string; where: string; why: string };
export type ParseResult = {
  content: ReportContent;
  dropped: DroppedItem[];
  warnings: string[];
};

const FIELD_SET = new Set<string>(FIELD_SOURCES as readonly string[]);

function decodeXml(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

function textOf(xml: string): string {
  const out: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] === undefined ? " " : decodeXml(m[1]));
  return out.join("").replace(/\s+/g, " ").trim();
}

function sliceElement(xml: string, tag: string, start: number): { inner: string; end: number } | null {
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;
  const selfClose = xml.indexOf(">", start);
  if (selfClose === -1) return null;
  if (xml[selfClose - 1] === "/") return { inner: "", end: selfClose + 1 };
  let depth = 1;
  let i = selfClose + 1;
  while (depth > 0) {
    const nextOpen = xml.indexOf(openTag, i);
    const nextClose = xml.indexOf(closeTag, i);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const gt = xml.indexOf(">", nextOpen);
      if (gt !== -1 && xml[gt - 1] !== "/") depth += 1;
      i = gt === -1 ? nextOpen + openTag.length : gt + 1;
    } else {
      depth -= 1;
      i = nextClose + closeTag.length;
    }
  }
  return { inner: xml.slice(selfClose + 1, i - closeTag.length), end: i };
}

function paragraphDir(xml: string): "rtl" | undefined {
  return /<w:bidi(\s[^>]*)?\/?>/.test(xml) || /<w:rtl(\s[^>]*)?\/?>/.test(xml) ? "rtl" : undefined;
}

function headingLevel(xml: string): 1 | 2 | 3 | null {
  const m = /<w:pStyle\s+w:val="([^"]+)"/.exec(xml);
  if (!m) return null;
  const style = m[1].toLowerCase();
  if (/^heading ?1$|^title$/.test(style)) return 1;
  if (/^heading ?2$|^subtitle$/.test(style)) return 2;
  if (/^heading ?3$/.test(style)) return 3;
  return null;
}

function scanUnsupported(xml: string, where: string, dropped: DroppedItem[]) {
  const checks: Array<[RegExp, string, string]> = [
    [/<w:txbxContent/, "مربع نص", "غير مدعوم في مخطط الكتل"],
    [/<w:sdt[\s>]/, "عنصر محتوى منظّم (SDT)", "غير مدعوم"],
    [/<w:fldSimple|<w:instrText/, "حقل Word", "الحقول الديناميكية لا تُنقل"],
    [/<mc:AlternateContent/, "محتوى بديل/شكل رسومي", "غير مدعوم"],
    [/<w:pict[\s>]/, "شكل VML", "غير مدعوم"],
    [/<w:footnoteReference|<w:endnoteReference/, "حاشية", "غير مدعومة"],
    [/<w:hyperlink[\s>]/, "ارتباط تشعبي", "يُحوّل إلى نص عادي"],
  ];
  for (const [re, what, why] of checks) if (re.test(xml)) dropped.push({ what, where, why });
}

function fieldFromText(text: string): string | null {
  const m = /^\{\{\s*field\s*:\s*([a-zA-Z0-9_.]+)\s*\}\}$/.exec(text.trim());
  if (!m) return null;
  return FIELD_SET.has(m[1]) ? m[1] : null;
}

export function parseDocxToBlocks(fileBytes: Uint8Array): ParseResult {
  const dropped: DroppedItem[] = [];
  const warnings: string[] = [];
  const blocks: ReportBlock[] = [];

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(fileBytes);
  } catch {
    throw new Error("تعذّر فك ضغط ملف DOCX — الملف تالف أو ليس مستند Word صالحًا");
  }
  const docEntry = files["word/document.xml"];
  if (!docEntry) throw new Error("لا يحتوي الملف على word/document.xml");

  for (const name of Object.keys(files)) {
    if (/^word\/(header|footer)\d*\.xml$/.test(name))
      warnings.push(`الترويسة/التذييل (${name}) لا تُنقل — ركيز يولّدها آليًا عند التصدير`);
    if (/^word\/media\//.test(name))
      dropped.push({ what: `صورة مضمّنة (${name})`, where: "المستند", why: "نقل الصور خارج نطاق هذه الدفعة" });
  }
  if (files["word/numbering.xml"])
    warnings.push("الترقيم متعدد المستويات يُسطَّح إلى قائمة من مستوى واحد");

  const xml = strFromU8(docEntry);
  const bodyStart = xml.indexOf("<w:body");
  const body = bodyStart === -1 ? xml : xml.slice(xml.indexOf(">", bodyStart) + 1);

  let i = 0;
  let paraIndex = 0;
  let pendingList: { ordered: boolean; items: string[]; dir?: "rtl" } | null = null;

  const flushList = () => {
    if (pendingList && pendingList.items.length) {
      blocks.push({
        id: newBlockId(),
        type: "list",
        ordered: pendingList.ordered,
        items: pendingList.items.slice(0, 200),
        ...(pendingList.dir ? { dir: pendingList.dir } : {}),
      });
    }
    pendingList = null;
  };

  while (i < body.length) {
    const pAt = body.indexOf("<w:p", i);
    const tblAt = body.indexOf("<w:tbl", i);
    const pValid = pAt !== -1 && /^<w:p[ >/]/.test(body.slice(pAt, pAt + 5));
    const tblValid = tblAt !== -1 && /^<w:tbl[ >]/.test(body.slice(tblAt, tblAt + 7));
    if (!pValid && !tblValid) break;

    if (tblValid && (!pValid || tblAt < pAt)) {
      const el = sliceElement(body, "w:tbl", tblAt);
      if (!el) break;
      flushList();
      const rows: string[][] = [];
      let j = 0;
      while (j < el.inner.length) {
        const trAt = el.inner.indexOf("<w:tr", j);
        if (trAt === -1 || !/^<w:tr[ >]/.test(el.inner.slice(trAt, trAt + 6))) break;
        const tr = sliceElement(el.inner, "w:tr", trAt);
        if (!tr) break;
        const cells: string[] = [];
        let k = 0;
        while (k < tr.inner.length) {
          const tcAt = tr.inner.indexOf("<w:tc", k);
          if (tcAt === -1 || !/^<w:tc[ >]/.test(tr.inner.slice(tcAt, tcAt + 6))) break;
          const tc = sliceElement(tr.inner, "w:tc", tcAt);
          if (!tc) break;
          cells.push(textOf(tc.inner).slice(0, 1000));
          k = tc.end;
        }
        rows.push(cells);
        j = tr.end;
      }
      if (rows.length) {
        const header = (rows[0] ?? []).slice(0, 12);
        const bodyRows = rows.slice(1, 301).map((r) => r.slice(0, 12));
        if (rows.length > 301)
          dropped.push({ what: "صفوف جدول زائدة", where: "جدول", why: "الحد الأقصى 300 صف" });
        if ((rows[0] ?? []).length > 12)
          dropped.push({ what: "أعمدة جدول زائدة", where: "جدول", why: "الحد الأقصى 12 عمودًا" });
        blocks.push({ id: newBlockId(), type: "table", header, rows: bodyRows });
      }
      i = el.end;
      continue;
    }

    const el = sliceElement(body, "w:p", pAt);
    if (!el) break;
    paraIndex += 1;
    const where = `فقرة ${paraIndex}`;
    const inner = el.inner;
    scanUnsupported(inner, where, dropped);

    const dir = paragraphDir(inner);
    const hasPageBreak = /<w:br\s+w:type="page"\s*\/>/.test(inner) || /<w:lastRenderedPageBreak/.test(inner);
    const hasDrawing = /<w:drawing[\s>]/.test(inner);
    const text = textOf(inner);
    const isListItem = /<w:numPr[\s>]/.test(inner);
    const level = headingLevel(inner);

    if (isListItem && text) {
      const numId = /<w:pStyle\s+w:val="ListNumber"/.test(inner);
      if (!pendingList || pendingList.ordered !== numId) {
        flushList();
        pendingList = { ordered: numId, items: [], ...(dir ? { dir } : {}) };
      }
      pendingList.items.push(text.slice(0, 1000));
      i = el.end;
      continue;
    }
    flushList();

    if (hasPageBreak) blocks.push({ id: newBlockId(), type: "page_break" });

    if (hasDrawing) {
      blocks.push({
        id: newBlockId(),
        type: "image",
        widthPercent: 100,
        caption: "صورة من الملف الأصلي — تحتاج رفعًا يدويًا",
      });
      dropped.push({ what: "صورة", where, why: "أُدرج عنصر صورة فارغ؛ يجب رفع الصورة يدويًا" });
    }

    if (!text) {
      i = el.end;
      continue;
    }

    const field = fieldFromText(text);
    if (field) {
      blocks.push({ id: newBlockId(), type: "field", source: field as never });
    } else if (/^\{\{/.test(text.trim())) {
      blocks.push({ id: newBlockId(), type: "paragraph", text: text.slice(0, 8000), ...(dir ? { dir } : {}) });
      dropped.push({ what: `حقل غير معروف (${text.trim().slice(0, 60)})`, where, why: "ليس ضمن الحقول المعتمدة" });
    } else if (level) {
      blocks.push({ id: newBlockId(), type: "heading", level, text: text.slice(0, 500), ...(dir ? { dir } : {}) });
    } else {
      blocks.push({ id: newBlockId(), type: "paragraph", text: text.slice(0, 8000), ...(dir ? { dir } : {}) });
    }
    i = el.end;
  }
  flushList();

  const limited = blocks.slice(0, 1000);
  if (blocks.length > 1000)
    dropped.push({ what: "كتل زائدة", where: "المستند", why: "الحد الأقصى 1000 كتلة لكل قالب" });

  const safe: ReportBlock[] = [];
  for (const [idx, block] of limited.entries()) {
    const parsed = reportContentSchema.safeParse({ blocks: [block] });
    if (parsed.success) safe.push(block);
    else dropped.push({ what: `كتلة من نوع ${block.type}`, where: `ترتيب ${idx + 1}`, why: "فشل التحقق من المخطط" });
  }

  return { content: { blocks: safe }, dropped, warnings };
}
