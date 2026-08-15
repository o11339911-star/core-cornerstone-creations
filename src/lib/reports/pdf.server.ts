import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import reshaperPkg from "arabic-persian-reshaper";

const ArabicShaper = (reshaperPkg as { ArabicShaper: { convertArabic(text: string): string } }).ArabicShaper;

import { NOTO_NASKH_ARABIC_BASE64 } from "./font.server";
import type { RenderLine } from "./render.server";

const A4 = { width: 595.28, height: 841.89 };
const MM = 2.834645669;

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Minimal bidi: shape Arabic into presentation forms (the embedded font is
 * rendered glyph-by-glyph, so joining must be resolved here) and mirror the
 * Latin/digit runs so mixed Arabic–Latin lines read correctly.
 */
function shapeLine(text: string, rtl: boolean): string {
  if (!ARABIC_RE.test(text)) return text;
  const shaped = ArabicShaper.convertArabic(text) as string;
  if (!rtl) return shaped;
  const runs = shaped.match(
    /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+|[^\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g,
  );
  if (!runs) return shaped;
  return runs
    .map((run) => {
      if (ARABIC_RE.test(run)) return run;
      // Reverse only the visible core of a Latin/digit run so the surrounding
      // spaces keep their position and words do not collide with Arabic text.
      const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(run);
      if (!match) return Array.from(run).reverse().join("");
      const [, lead, core, trail] = match;
      return `${lead}${Array.from(core).reverse().join("")}${trail}`;
    })
    .join("");

}


type Ctx = {
  doc: PDFDocument;
  font: PDFFont;
  page: PDFPage;
  y: number;
  rtl: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  pageIndex: number;
  headerText: string;
  footerText: string;
  qr: { size: number; data: Uint8Array } | null;
  verifyUrl: string;
};

function wrap(ctx: Ctx, text: string, size: number): string[] {
  const maxWidth = ctx.right - ctx.left;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = ctx.font.widthOfTextAtSize(shapeLine(candidate, ctx.rtl), size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function drawChrome(ctx: Ctx) {
  const size = 8;
  const headerY = A4.height - ctx.top + 8;
  const shapedHeader = shapeLine(ctx.headerText, ctx.rtl);
  const hw = ctx.font.widthOfTextAtSize(shapedHeader, size);
  ctx.page.drawText(shapedHeader, {
    x: ctx.rtl ? ctx.right - hw : ctx.left,
    y: headerY,
    size,
    font: ctx.font,
    color: rgb(0.35, 0.35, 0.35),
  });
  ctx.page.drawLine({
    start: { x: ctx.left, y: headerY - 4 },
    end: { x: ctx.right, y: headerY - 4 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  const footY = ctx.bottom - 14;
  const shapedFooter = shapeLine(ctx.footerText, ctx.rtl);
  const fw = ctx.font.widthOfTextAtSize(shapedFooter, size);
  ctx.page.drawText(shapedFooter, {
    x: ctx.rtl ? ctx.right - fw : ctx.left,
    y: footY,
    size,
    font: ctx.font,
    color: rgb(0.35, 0.35, 0.35),
  });
  const pageLabel = String(ctx.pageIndex);
  const pw = ctx.font.widthOfTextAtSize(pageLabel, size);
  ctx.page.drawText(pageLabel, {
    x: (A4.width - pw) / 2,
    y: footY - 12,
    size,
    font: ctx.font,
    color: rgb(0.35, 0.35, 0.35),
  });

  if (ctx.qr) {
    const box = 46;
    const cell = box / ctx.qr.size;
    const originX = ctx.rtl ? ctx.left : ctx.right - box;
    const originY = ctx.bottom - 14 - box + 4;
    for (let row = 0; row < ctx.qr.size; row += 1) {
      for (let col = 0; col < ctx.qr.size; col += 1) {
        if (ctx.qr.data[row * ctx.qr.size + col]) {
          ctx.page.drawRectangle({
            x: originX + col * cell,
            y: originY + (ctx.qr.size - 1 - row) * cell,
            width: cell,
            height: cell,
            color: rgb(0, 0, 0),
          });
        }
      }
    }
  }
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([A4.width, A4.height]);
  ctx.pageIndex += 1;
  ctx.y = A4.height - ctx.top;
  drawChrome(ctx);
  ctx.y -= 12;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < ctx.bottom) newPage(ctx);
}

function drawText(ctx: Ctx, text: string, size: number, color = rgb(0.1, 0.12, 0.16), gap = 4) {
  for (const line of wrap(ctx, text, size)) {
    ensureSpace(ctx, size + gap);
    const shaped = shapeLine(line, ctx.rtl);
    const width = ctx.font.widthOfTextAtSize(shaped, size);
    ctx.page.drawText(shaped, {
      x: ctx.rtl ? ctx.right - width : ctx.left,
      y: ctx.y - size,
      size,
      font: ctx.font,
      color,
    });
    ctx.y -= size + gap;
  }
}

export type PdfInput = {
  lines: RenderLine[];
  locale: "ar" | "en";
  title: string;
  headerText: string;
  footerText: string;
  verifyUrl: string;
  marginMm: { top: number; right: number; bottom: number; left: number };
  loadImage: (path: string) => Promise<{ bytes: Uint8Array; mime: string } | null>;
};

export async function renderReportPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(base64ToBytes(NOTO_NASKH_ARABIC_BASE64), { subset: true });
  const rtl = input.locale === "ar";

  const qrModel = QRCode.create(input.verifyUrl, { errorCorrectionLevel: "M" });
  const qr = { size: qrModel.modules.size, data: qrModel.modules.data as Uint8Array };

  const ctx: Ctx = {
    doc,
    font,
    page: doc.addPage([A4.width, A4.height]),
    y: 0,
    rtl,
    left: input.marginMm.left * MM,
    right: A4.width - input.marginMm.right * MM,
    top: input.marginMm.top * MM,
    bottom: input.marginMm.bottom * MM + 40,
    pageIndex: 1,
    headerText: input.headerText,
    footerText: input.footerText,
    qr,
    verifyUrl: input.verifyUrl,
  };
  ctx.y = A4.height - ctx.top;
  drawChrome(ctx);
  ctx.y -= 12;

  drawText(ctx, input.title, 18, rgb(0.06, 0.15, 0.3), 10);

  for (const line of input.lines) {
    switch (line.kind) {
      case "page_break":
        newPage(ctx);
        break;
      case "heading":
        ctx.y -= 4;
        drawText(ctx, line.text, line.level === 1 ? 16 : line.level === 2 ? 13 : 11, rgb(0.06, 0.15, 0.3), 6);
        break;
      case "text":
        drawText(ctx, line.text, 10);
        break;
      case "bullet":
        drawText(ctx, line.text, 10);
        break;
      case "note":
        drawText(ctx, line.text, 9, rgb(0.4, 0.4, 0.45));
        break;
      case "kv":
        drawText(ctx, `${line.label}: ${line.value}`, 10);
        break;
      case "table": {
        if (line.caption) drawText(ctx, line.caption, 10, rgb(0.4, 0.4, 0.45));
        const cols = Math.max(line.header.length, 1);
        const colWidth = (ctx.right - ctx.left) / cols;
        const rows = [line.header, ...line.rows];
        for (const row of rows) {
          ensureSpace(ctx, 18);
          for (let c = 0; c < cols; c += 1) {
            const cellText = shapeLine(String(row[c] ?? ""), rtl);
            const x = rtl ? ctx.right - (c + 1) * colWidth + 3 : ctx.left + c * colWidth + 3;
            ctx.page.drawText(cellText.slice(0, 60), {
              x,
              y: ctx.y - 11,
              size: 9,
              font: ctx.font,
              color: rgb(0.1, 0.12, 0.16),
            });
          }
          ctx.page.drawLine({
            start: { x: ctx.left, y: ctx.y - 14 },
            end: { x: ctx.right, y: ctx.y - 14 },
            thickness: 0.4,
            color: rgb(0.85, 0.85, 0.85),
          });
          ctx.y -= 18;
        }
        ctx.y -= 4;
        break;
      }
      case "image": {
        const asset = await input.loadImage(line.path);
        if (!asset) break;
        const embedded = asset.mime === "image/png"
          ? await doc.embedPng(asset.bytes)
          : await doc.embedJpg(asset.bytes);
        const maxWidth = ((ctx.right - ctx.left) * (line.widthPercent ?? 100)) / 100;
        const scale = Math.min(1, maxWidth / embedded.width);
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        ensureSpace(ctx, h + 16);
        ctx.page.drawImage(embedded, {
          x: rtl ? ctx.right - w : ctx.left,
          y: ctx.y - h,
          width: w,
          height: h,
        });
        ctx.y -= h + 6;
        if (line.caption) drawText(ctx, line.caption, 9, rgb(0.4, 0.4, 0.45));
        break;
      }
      case "pair": {
        const half = (ctx.right - ctx.left - 10) / 2;
        const items = [line.leftPath, line.rightPath];
        const captions = [line.leftCaption, line.rightCaption];
        let maxH = 0;
        const embeds: Array<{ img: Awaited<ReturnType<typeof doc.embedPng>>; w: number; h: number } | null> = [];
        for (const path of items) {
          if (!path) {
            embeds.push(null);
            continue;
          }
          const asset = await input.loadImage(path);
          if (!asset) {
            embeds.push(null);
            continue;
          }
          const img = asset.mime === "image/png" ? await doc.embedPng(asset.bytes) : await doc.embedJpg(asset.bytes);
          const scale = Math.min(1, half / img.width);
          const w = img.width * scale;
          const h = img.height * scale;
          maxH = Math.max(maxH, h);
          embeds.push({ img, w, h });
        }
        ensureSpace(ctx, maxH + 24);
        for (let i = 0; i < embeds.length; i += 1) {
          const e = embeds[i];
          const slotX = rtl ? ctx.right - (i + 1) * half - i * 10 : ctx.left + i * (half + 10);
          if (e) {
            ctx.page.drawImage(e.img, { x: slotX, y: ctx.y - e.h, width: e.w, height: e.h });
          }
          const caption = shapeLine(captions[i] ?? "", rtl);
          ctx.page.drawText(caption, {
            x: slotX,
            y: ctx.y - maxH - 10,
            size: 9,
            font: ctx.font,
            color: rgb(0.4, 0.4, 0.45),
          });
        }
        ctx.y -= maxH + 22;
        break;
      }
      default:
        break;
    }
  }

  return await doc.save();
}
