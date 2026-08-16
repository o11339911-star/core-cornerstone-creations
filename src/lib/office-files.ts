import { zipSync, strToU8 } from "fflate";

/**
 * إنشاء ملفات Office حقيقية في المتصفح:
 * - DOCX عبر مكتبة docx الموثوقة.
 * - XLSX عبر كتابة حزمة OOXML صغيرة مضغوطة بـfflate (لا مكتبة ثقيلة إضافية).
 * لا تُغيَّر امتدادات ملفات نصية، والناتج يفتح فعليًا في Word/Excel.
 */

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** ينشئ مستند Word صالحًا (DOCX) بعنوان وفقرة افتتاحية. */
export async function createDocxBlob(title: string): Promise<Blob> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            bidirectional: true,
            children: [new TextRun({ text: title, rightToLeft: true })],
          }),
          new Paragraph({
            bidirectional: true,
            children: [
              new TextRun({
                text: "مستند أُنشئ من منصة ركيز. اكتب محتواك هنا.",
                rightToLeft: true,
              }),
            ],
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return new Blob([blob], { type: DOCX_MIME });
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ينشئ مصنّف Excel صالحًا (XLSX) بورقة واحدة وعناوين أعمدة اختيارية. */
export function createXlsxBlob(sheetTitle: string, headers: string[] = []): Blob {
  const safeSheet = (sheetTitle || "ورقة1").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "ورقة1";

  const sharedStrings = headers.slice();
  const cells = headers
    .map((_, i) => {
      const col = String.fromCharCode(65 + (i % 26));
      return `<c r="${col}1" t="s"><v>${i}</v></c>`;
    })
    .join("");
  const row = headers.length ? `<row r="1">${cells}</row>` : "";

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
        `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${esc(safeSheet)}" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews>` +
        `<sheetData>${row}</sheetData></worksheet>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">` +
        sharedStrings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("") +
        `</sst>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
        `<borders count="1"><border/></borders>` +
        `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
        `<cellXfs count="1"><xf xfId="0"/></cellXfs>` +
        `</styleSheet>`,
    ),
  };

  const zipped = zipSync(files, { level: 6 });
  const buffer = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(buffer).set(zipped);
  return new Blob([buffer], { type: XLSX_MIME });
}

/** يضمن امتدادًا صحيحًا دون تغيير امتداد ملف آخر. */
export function withExtension(name: string, ext: ".docx" | ".xlsx"): string {
  const base = name.trim().replace(/\.(docx|xlsx)$/i, "");
  return `${base || "مستند"}${ext}`;
}
