import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
  BorderStyle,
  PageBreak,
} from "docx";

import type { RenderLine } from "./render.server";

const CONTENT_WIDTH = 9026; // A4 with 1" margins, DXA

export type DocxInput = {
  lines: RenderLine[];
  locale: "ar" | "en";
  title: string;
  headerText: string;
  footerText: string;
  verifyUrl: string;
  loadImage: (path: string) => Promise<{ bytes: Uint8Array; mime: string } | null>;
};

function run(text: string, rtl: boolean, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    rightToLeft: rtl,
    font: "Arial",
    bold: opts.bold ?? false,
    size: opts.size ?? 22,
    ...(opts.color ? { color: opts.color } : {}),
  });
}

export async function renderReportDocx(input: DocxInput): Promise<Uint8Array> {
  const rtl = input.locale === "ar";
  const align = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const children: Array<Paragraph | Table> = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: rtl,
      heading: HeadingLevel.HEADING_1,
      children: [run(input.title, rtl, { bold: true, size: 36 })],
    }),
  );

  for (const line of input.lines) {
    switch (line.kind) {
      case "page_break":
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "heading":
        children.push(
          new Paragraph({
            alignment: align,
            bidirectional: rtl,
            heading:
              line.level === 1
                ? HeadingLevel.HEADING_1
                : line.level === 2
                  ? HeadingLevel.HEADING_2
                  : HeadingLevel.HEADING_3,
            children: [run(line.text, rtl, { bold: true, size: line.level === 1 ? 32 : line.level === 2 ? 28 : 24 })],
          }),
        );
        break;
      case "text":
      case "bullet":
        children.push(
          new Paragraph({ alignment: align, bidirectional: rtl, children: [run(line.text, rtl)] }),
        );
        break;
      case "note":
        children.push(
          new Paragraph({
            alignment: align,
            bidirectional: rtl,
            children: [run(line.text, rtl, { size: 20, color: "666666" })],
          }),
        );
        break;
      case "kv":
        children.push(
          new Paragraph({
            alignment: align,
            bidirectional: rtl,
            children: [run(`${line.label}: `, rtl, { bold: true }), run(line.value, rtl)],
          }),
        );
        break;
      case "table": {
        const cols = Math.max(line.header.length, 1);
        const colWidth = Math.floor(CONTENT_WIDTH / cols);
        const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
        const borders = { top: border, bottom: border, left: border, right: border };
        const makeRow = (cells: string[], head: boolean) =>
          new TableRow({
            children: Array.from({ length: cols }, (_, i) =>
              new TableCell({
                borders,
                width: { size: colWidth, type: WidthType.DXA },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                ...(head ? { shading: { fill: "EEF2F7", type: ShadingType.CLEAR } } : {}),
                children: [
                  new Paragraph({
                    alignment: align,
                    bidirectional: rtl,
                    children: [run(String(cells[i] ?? ""), rtl, { bold: head })],
                  }),
                ],
              }),
            ),
          });
        children.push(
          new Table({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            columnWidths: Array.from({ length: cols }, () => colWidth),
            rows: [makeRow(line.header, true), ...line.rows.map((r) => makeRow(r, false))],
          }),
        );
        if (line.caption) {
          children.push(
            new Paragraph({
              alignment: align,
              bidirectional: rtl,
              children: [run(line.caption, rtl, { size: 18, color: "666666" })],
            }),
          );
        }
        break;
      }
      case "image": {
        const asset = await input.loadImage(line.path);
        if (!asset) break;
        children.push(
          new Paragraph({
            alignment: align,
            bidirectional: rtl,
            children: [
              new ImageRun({
                type: asset.mime === "image/png" ? "png" : "jpg",
                data: asset.bytes,
                transformation: { width: 420, height: 280 },
                altText: { title: "report image", description: line.caption ?? "report image", name: "image" },
              }),
            ],
          }),
        );
        if (line.caption) {
          children.push(
            new Paragraph({
              alignment: align,
              bidirectional: rtl,
              children: [run(line.caption, rtl, { size: 18, color: "666666" })],
            }),
          );
        }
        break;
      }
      case "pair": {
        const runs: ImageRun[] = [];
        for (const path of [line.leftPath, line.rightPath]) {
          if (!path) continue;
          const asset = await input.loadImage(path);
          if (!asset) continue;
          runs.push(
            new ImageRun({
              type: asset.mime === "image/png" ? "png" : "jpg",
              data: asset.bytes,
              transformation: { width: 210, height: 150 },
              altText: { title: "comparison", description: "before/after", name: "image" },
            }),
          );
        }
        if (runs.length > 0) {
          children.push(new Paragraph({ alignment: align, bidirectional: rtl, children: runs }));
          children.push(
            new Paragraph({
              alignment: align,
              bidirectional: rtl,
              children: [run(`${line.leftCaption ?? ""} / ${line.rightCaption ?? ""}`, rtl, { size: 18, color: "666666" })],
            }),
          );
        }
        break;
      }
      default:
        break;
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: align,
                bidirectional: rtl,
                children: [run(input.headerText, rtl, { size: 18, color: "666666" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: align,
                bidirectional: rtl,
                children: [run(`${input.footerText} — ${input.verifyUrl}`, rtl, { size: 16, color: "666666" })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
