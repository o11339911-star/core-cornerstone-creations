import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/**
 * ملفات Office حقيقية داخل المنصة:
 * - إنشاء DOCX عبر مكتبة docx الموثوقة، وXLSX عبر حزمة OOXML مكتوبة بـfflate.
 * - قراءة DOCX (فقرات + جداول) وXLSX (أوراق + خلايا + صيغ) للتحرير داخل المنصة.
 * - الحفظ يعيد بناء حزمة OOXML قياسية تفتح في Microsoft Office وLibreOffice.
 * غير مدعوم للتحرير: الماكرو (docm/xlsm) والصور والرسوم والأنماط المتقدمة —
 * تُعرض تنبيهات صريحة ولا تُتلَف الملفات الأصلية (الحفظ دائمًا كنسخة جديدة).
 */

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** يحوّل الأرقام العربية/الفارسية إلى ASCII 0-9 في كل إدخال وعرض. */
export function toAsciiDigits(input: string): string {
  return input.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/* نماذج التحرير                                                       */
/* ------------------------------------------------------------------ */

export type DocxBlock =
  | { type: "paragraph"; text: string; heading: boolean }
  | { type: "table"; rows: string[][] };

export type DocxModel = {
  blocks: DocxBlock[];
  /** عناصر موجودة في الملف لا يدعمها المحرر (صور، رسوم، حقول…) */
  warnings: string[];
};

export type XlsxCell = { v: string; f: string | null };
export type XlsxSheet = { name: string; cells: XlsxCell[][] };
export type XlsxModel = { sheets: XlsxSheet[]; warnings: string[] };

export const XLSX_MAX_ROWS = 200;
export const XLSX_MAX_COLS = 26;

export class OfficeUnsupportedError extends Error {}

/* ------------------------------------------------------------------ */
/* فحوصات السلامة                                                      */
/* ------------------------------------------------------------------ */

/** يتحقق من magic bytes لحزمة ZIP (PK\x03\x04) قبل أي قراءة. */
export function isZipPackage(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function hasMacros(files: Record<string, Uint8Array>): boolean {
  return Object.keys(files).some((n) => n.toLowerCase().includes("vbaproject.bin"));
}

export function officeKindOf(name: string, mime?: string | null): "word" | "excel" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx") || mime === DOCX_MIME) return "word";
  if (lower.endsWith(".xlsx") || mime === XLSX_MIME) return "excel";
  return null;
}

export function isMacroFile(name: string): boolean {
  return /\.(docm|xlsm|xlsb|dotm|xltm)$/i.test(name.trim());
}

function readPackage(bytes: Uint8Array): Record<string, Uint8Array> {
  if (!isZipPackage(bytes)) {
    throw new OfficeUnsupportedError("الملف ليس حزمة Office صالحة (توقيع الملف غير مطابق).");
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new OfficeUnsupportedError("تعذّر فتح حزمة الملف — قد يكون تالفًا.");
  }
  if (hasMacros(files)) {
    throw new OfficeUnsupportedError("الملف يحتوي ماكرو (VBA) — التحرير داخل المنصة غير مسموح؛ التنزيل فقط.");
  }
  return files;
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new OfficeUnsupportedError("محتوى الملف الداخلي غير صالح (XML تالف).");
  }
  return doc;
}

/* ------------------------------------------------------------------ */
/* DOCX — قراءة                                                        */
/* ------------------------------------------------------------------ */

function paragraphText(p: Element): string {
  let out = "";
  for (const t of Array.from(p.getElementsByTagName("*"))) {
    const tag = t.tagName.replace(/^.*:/, "");
    if (tag === "t") out += t.textContent ?? "";
    else if (tag === "tab") out += "\t";
    else if (tag === "br") out += "\n";
  }
  return out;
}

function isHeading(p: Element): boolean {
  const styles = Array.from(p.getElementsByTagName("*")).filter(
    (e) => e.tagName.replace(/^.*:/, "") === "pStyle",
  );
  return styles.some((s) => /heading/i.test(s.getAttribute("w:val") ?? s.getAttribute("val") ?? ""));
}

export function parseDocx(bytes: Uint8Array): DocxModel {
  const files = readPackage(bytes);
  const main = files["word/document.xml"];
  if (!main) throw new OfficeUnsupportedError("لا يحتوي الملف على word/document.xml.");
  const doc = parseXml(strFromU8(main));
  const body = doc.getElementsByTagName("w:body")[0] ?? doc.getElementsByTagName("body")[0];
  if (!body) throw new OfficeUnsupportedError("بنية المستند غير مدعومة.");

  const blocks: DocxBlock[] = [];
  const warnings = new Set<string>();

  for (const node of Array.from(body.children)) {
    const tag = node.tagName.replace(/^.*:/, "");
    if (tag === "p") {
      if (node.getElementsByTagName("w:drawing").length || node.getElementsByTagName("w:pict").length) {
        warnings.add("يحتوي المستند صورًا أو رسومًا لن تظهر في المحرر، وستُفقد في النسخة المحفوظة.");
      }
      blocks.push({ type: "paragraph", text: paragraphText(node), heading: isHeading(node) });
    } else if (tag === "tbl") {
      const rows: string[][] = [];
      for (const tr of Array.from(node.children)) {
        if (tr.tagName.replace(/^.*:/, "") !== "tr") continue;
        const cells: string[] = [];
        for (const tc of Array.from(tr.children)) {
          if (tc.tagName.replace(/^.*:/, "") !== "tc") continue;
          const paras = Array.from(tc.children).filter(
            (c) => c.tagName.replace(/^.*:/, "") === "p",
          );
          cells.push(paras.map((p) => paragraphText(p)).join("\n"));
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) blocks.push({ type: "table", rows });
      warnings.add("تنسيقات الجداول (الألوان والدمج والحدود) لا تُحفظ؛ يُحفظ النص فقط.");
    } else if (tag !== "sectPr" && tag !== "bookmarkStart" && tag !== "bookmarkEnd") {
      warnings.add(`عنصر غير مدعوم في المحرر: ${tag} — لن يظهر في النسخة المحفوظة.`);
    }
  }

  if (!blocks.length) blocks.push({ type: "paragraph", text: "", heading: false });
  return { blocks, warnings: Array.from(warnings) };
}

/* ------------------------------------------------------------------ */
/* DOCX — بناء                                                         */
/* ------------------------------------------------------------------ */

async function docxDocument(blocks: DocxBlock[]) {
  const {
    Document,
    Paragraph,
    HeadingLevel,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = await import("docx");

  const runs = (text: string) =>
    text
      .split("\n")
      .map((line, i) => new TextRun({ text: toAsciiDigits(line), rightToLeft: true, break: i ? 1 : 0 }));

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      children.push(
        new Paragraph({
          bidirectional: true,
          ...(block.heading ? { heading: HeadingLevel.HEADING_1 } : {}),
          children: runs(block.text),
        }),
      );
    } else {
      const width = Math.max(1, block.rows[0]?.length ?? 1);
      children.push(
        new Table({
          visuallyRightToLeft: true,
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: Array.from({ length: width }, () => Math.floor(9360 / width)),
          rows: block.rows.map(
            (row) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      width: { size: Math.floor(9360 / width), type: WidthType.DXA },
                      margins: { top: 80, bottom: 80, left: 120, right: 120 },
                      children: [new Paragraph({ bidirectional: true, children: runs(cell) })],
                    }),
                ),
              }),
          ),
        }),
      );
    }
  }
  if (!children.length) children.push(new Paragraph({ bidirectional: true, children: [] }));

  return new Document({
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
    sections: [{ properties: {}, children }],
  });
}

/** يبني DOCX قياسيًا من نموذج التحرير. */
export async function buildDocxBlob(blocks: DocxBlock[]): Promise<Blob> {
  const { Packer } = await import("docx");
  const doc = await docxDocument(blocks);
  const blob = await Packer.toBlob(doc);
  return new Blob([blob], { type: DOCX_MIME });
}

/** ينشئ مستند Word جديدًا بعنوان وفقرة افتتاحية. */
export async function createDocxBlob(title: string): Promise<Blob> {
  return buildDocxBlob([
    { type: "paragraph", text: title, heading: true },
    { type: "paragraph", text: "مستند أُنشئ من منصة ركيز. اكتب محتواك هنا.", heading: false },
  ]);
}

/* ------------------------------------------------------------------ */
/* XLSX — قراءة                                                        */
/* ------------------------------------------------------------------ */

export function colName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function refToRc(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]!) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

function emptyGrid(rows = 20, cols = 8): XlsxCell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ v: "", f: null })));
}

export function parseXlsx(bytes: Uint8Array): XlsxModel {
  const files = readPackage(bytes);
  const wbFile = files["xl/workbook.xml"];
  if (!wbFile) throw new OfficeUnsupportedError("لا يحتوي الملف على xl/workbook.xml.");
  const wb = parseXml(strFromU8(wbFile));
  const warnings = new Set<string>();

  const relsFile = files["xl/_rels/workbook.xml.rels"];
  const relMap = new Map<string, string>();
  if (relsFile) {
    for (const r of Array.from(parseXml(strFromU8(relsFile)).getElementsByTagName("Relationship"))) {
      relMap.set(r.getAttribute("Id") ?? "", (r.getAttribute("Target") ?? "").replace(/^\/?xl\//, ""));
    }
  }

  const shared: string[] = [];
  const ssFile = files["xl/sharedStrings.xml"];
  if (ssFile) {
    for (const si of Array.from(parseXml(strFromU8(ssFile)).getElementsByTagName("si"))) {
      shared.push(
        Array.from(si.getElementsByTagName("t"))
          .map((t) => t.textContent ?? "")
          .join(""),
      );
    }
  }

  const sheets: XlsxSheet[] = [];
  const sheetNodes = Array.from(wb.getElementsByTagName("sheet"));
  for (const [i, node] of sheetNodes.entries()) {
    const name = node.getAttribute("name") ?? `Sheet${i + 1}`;
    const rid = node.getAttribute("r:id") ?? node.getAttribute("id") ?? "";
    const target = relMap.get(rid) ?? `worksheets/sheet${i + 1}.xml`;
    const file = files[`xl/${target}`];
    if (!file) {
      warnings.add(`تعذّر قراءة الورقة «${name}».`);
      continue;
    }
    const ws = parseXml(strFromU8(file));
    let maxRow = 0;
    let maxCol = 0;
    const found: Array<{ r: number; c: number; cell: XlsxCell }> = [];
    for (const c of Array.from(ws.getElementsByTagName("c"))) {
      const rc = refToRc(c.getAttribute("r") ?? "");
      if (!rc) continue;
      if (rc.row >= XLSX_MAX_ROWS || rc.col >= XLSX_MAX_COLS) {
        warnings.add(
          `الورقة «${name}» أكبر من حدود المحرر (${XLSX_MAX_ROWS} صفًا × ${XLSX_MAX_COLS} عمودًا)؛ الخلايا خارج الحد غير معروضة.`,
        );
        continue;
      }
      const t = c.getAttribute("t");
      const fEl = c.getElementsByTagName("f")[0];
      const vEl = c.getElementsByTagName("v")[0];
      let v = "";
      if (t === "s") v = shared[Number(vEl?.textContent ?? "-1")] ?? "";
      else if (t === "inlineStr")
        v = Array.from(c.getElementsByTagName("t"))
          .map((x) => x.textContent ?? "")
          .join("");
      else v = vEl?.textContent ?? "";
      const f = fEl?.textContent ? `=${fEl.textContent}` : null;
      if (!v && !f) continue;
      found.push({ r: rc.row, c: rc.col, cell: { v, f } });
      maxRow = Math.max(maxRow, rc.row + 1);
      maxCol = Math.max(maxCol, rc.col + 1);
    }
    const grid = emptyGrid(Math.max(maxRow + 3, 20), Math.max(maxCol + 2, 8));
    for (const { r, c, cell } of found) grid[r]![c] = cell;
    sheets.push({ name, cells: grid });
  }

  if (Object.keys(files).some((n) => n.startsWith("xl/charts/") || n.startsWith("xl/drawings/"))) {
    warnings.add("المصنّف يحتوي رسومًا بيانية أو صورًا لا يدعمها المحرر ولن تُحفظ في النسخة الجديدة.");
  }
  if (Object.keys(files).some((n) => n.startsWith("xl/pivotTables/"))) {
    warnings.add("المصنّف يحتوي جداول محورية لا يدعمها المحرر ولن تُحفظ في النسخة الجديدة.");
  }
  if (!sheets.length) sheets.push({ name: "Sheet1", cells: emptyGrid() });
  return { sheets, warnings: Array.from(warnings) };
}

/* ------------------------------------------------------------------ */
/* XLSX — بناء                                                         */
/* ------------------------------------------------------------------ */

const SAFE_FUNCTIONS = [
  "SUM",
  "AVERAGE",
  "MIN",
  "MAX",
  "COUNT",
  "COUNTA",
  "ROUND",
  "ABS",
  "IF",
  "PRODUCT",
];

/**
 * صيغة آمنة فقط: مراجع خلايا وأرقام وعمليات حسابية ودوال من قائمة بيضاء.
 * أي نص آخر يبدأ بـ = أو + أو - أو @ يُكتب كنص لا كصيغة (منع formula injection).
 */
export function isSafeFormula(input: string): boolean {
  const f = toAsciiDigits(input.trim());
  if (!f.startsWith("=") || f.length > 200) return false;
  const body = f.slice(1);
  if (!/^[A-Za-z0-9_$:,.()+\-*/^%<>= ]+$/.test(body)) return false;
  if (/[!\[\]'"]/.test(body)) return false;
  const names = body.match(/[A-Za-z]+(?=\()/g) ?? [];
  return names.every((n) => SAFE_FUNCTIONS.includes(n.toUpperCase()));
}

function isNumeric(v: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(v.trim());
}

export function sanitizeSheetName(name: string, fallback = "Sheet1"): string {
  const clean = toAsciiDigits(name).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return clean || fallback;
}

/** يبني XLSX قياسيًا من الأوراق والخلايا (نصوص مضمّنة + صيغ آمنة). */
export function buildXlsxBlob(sheets: XlsxSheet[]): Blob {
  const list = sheets.length ? sheets : [{ name: "Sheet1", cells: emptyGrid() }];
  const names = new Set<string>();
  const safeSheets = list.map((s, i) => {
    let name = sanitizeSheetName(s.name, `Sheet${i + 1}`);
    while (names.has(name.toLowerCase())) name = `${name.slice(0, 28)}-${i + 1}`;
    names.add(name.toLowerCase());
    return { ...s, name };
  });

  const files: Record<string, Uint8Array> = {};
  const sheetOverrides: string[] = [];
  const sheetRels: string[] = [];
  const sheetTags: string[] = [];

  safeSheets.forEach((sheet, index) => {
    const n = index + 1;
    const rows: string[] = [];
    sheet.cells.forEach((row, r) => {
      const cells: string[] = [];
      row.forEach((cell, c) => {
        const ref = `${colName(c)}${r + 1}`;
        const raw = toAsciiDigits(cell.v ?? "");
        if (cell.f && isSafeFormula(cell.f)) {
          cells.push(
            `<c r="${ref}"><f>${esc(toAsciiDigits(cell.f).slice(1))}</f>${
              raw ? `<v>${esc(raw)}</v>` : ""
            }</c>`,
          );
        } else if (!raw) {
          return;
        } else if (isNumeric(raw)) {
          cells.push(`<c r="${ref}"><v>${esc(raw.trim())}</v></c>`);
        } else {
          // كل ما ليس صيغة آمنة يُكتب نصًا مضمّنًا — لا يُنفّذ في Excel أبدًا
          cells.push(
            `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(raw)}</t></is></c>`,
          );
        }
      });
      if (cells.length) rows.push(`<row r="${r + 1}">${cells.join("")}</row>`);
    });

    files[`xl/worksheets/sheet${n}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetViews><sheetView rightToLeft="1"${n === 1 ? ' tabSelected="1"' : ""} workbookViewId="0"/></sheetViews>` +
        `<sheetData>${rows.join("")}</sheetData></worksheet>`,
    );
    sheetOverrides.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
    sheetRels.push(
      `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
    );
    sheetTags.push(`<sheet name="${esc(sheet.name)}" sheetId="${n}" r:id="rId${n}"/>`);
  });

  const stylesId = safeSheets.length + 1;
  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      sheetOverrides.join("") +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
  );
  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheetRels.join("") +
      `<Relationship Id="rId${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetTags.join("")}</sheets>` +
      `<calcPr calcId="0" fullCalcOnLoad="1"/>` +
      `</workbook>`,
  );
  files["xl/styles.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts>` +
      `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
      `<borders count="1"><border/></borders>` +
      `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
      `<cellXfs count="1"><xf xfId="0"/></cellXfs>` +
      `</styleSheet>`,
  );

  const zipped = zipSync(files, { level: 6 });
  const buffer = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(buffer).set(zipped);
  return new Blob([buffer], { type: XLSX_MIME });
}

/** ينشئ مصنّف Excel جديدًا بورقة واحدة وعناوين أعمدة اختيارية. */
export function createXlsxBlob(sheetTitle: string, headers: string[] = []): Blob {
  const cells = emptyGrid();
  headers.slice(0, XLSX_MAX_COLS).forEach((h, i) => {
    cells[0]![i] = { v: h, f: null };
  });
  return buildXlsxBlob([{ name: sanitizeSheetName(sheetTitle, "ورقة1"), cells }]);
}

/** يضمن امتدادًا صحيحًا دون تغيير امتداد ملف آخر. */
export function withExtension(name: string, ext: ".docx" | ".xlsx"): string {
  const base = name.trim().replace(/\.(docx|xlsx)$/i, "");
  return `${base || "مستند"}${ext}`;
}

/** اسم النسخة الجديدة: «الاسم — نسخة YYYY-MM-DD HH:mm». */
export function versionedName(title: string, at: Date = new Date()): string {
  const kind = /\.xlsx$/i.test(title) ? ".xlsx" : ".docx";
  const base = title.replace(/\.(docx|xlsx)$/i, "").replace(/ — نسخة [\d\-: ]+$/, "");
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`;
  return `${base} — نسخة ${stamp}${kind}`;
}
