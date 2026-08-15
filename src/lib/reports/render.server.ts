import type { PageSetup, ReportBlock, ReportContent } from "./blocks";
import { resolveField } from "./blocks";

/** Shared, renderer-agnostic flattening of report blocks into printable lines. */

export type RenderLine =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "text"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "kv"; label: string; value: string }
  | { kind: "table"; header: string[]; rows: string[][]; caption?: string }
  | { kind: "image"; path: string; caption?: string; widthPercent: number }
  | { kind: "pair"; leftPath?: string; rightPath?: string; leftCaption?: string; rightCaption?: string }
  | { kind: "note"; text: string }
  | { kind: "page_break" };

const COMPLIANCE_LABEL: Record<string, { ar: string; en: string }> = {
  compliant: { ar: "مطابق", en: "Compliant" },
  non_compliant: { ar: "غير مطابق", en: "Non-compliant" },
  not_applicable: { ar: "غير منطبق", en: "Not applicable" },
};
const SEVERITY_LABEL: Record<string, { ar: string; en: string }> = {
  low: { ar: "منخفضة", en: "Low" },
  medium: { ar: "متوسطة", en: "Medium" },
  high: { ar: "عالية", en: "High" },
  critical: { ar: "حرجة", en: "Critical" },
};

export function flattenBlocks(
  content: ReportContent,
  snapshot: unknown,
  locale: "ar" | "en",
  assetPaths: Record<string, string>,
): RenderLine[] {
  const out: RenderLine[] = [];
  const t = (ar: string, en: string) => (locale === "ar" ? ar : en);

  for (const block of content.blocks as ReportBlock[]) {
    switch (block.type) {
      case "heading":
        out.push({ kind: "heading", level: block.level, text: block.text });
        break;
      case "paragraph":
        if (block.text.trim()) out.push({ kind: "text", text: block.text });
        break;
      case "list":
        for (const [i, item] of block.items.entries()) {
          if (!item.trim()) continue;
          out.push({ kind: "bullet", text: block.ordered ? `${i + 1}. ${item}` : `• ${item}` });
        }
        break;
      case "table":
        out.push({
          kind: "table",
          header: block.header,
          rows: block.rows,
          ...(block.caption ? { caption: block.caption } : {}),
        });
        break;
      case "image": {
        const path = block.storagePath ?? (block.assetId ? assetPaths[block.assetId] : undefined);
        if (path)
          out.push({
            kind: "image",
            path,
            widthPercent: block.widthPercent ?? 100,
            ...(block.caption ? { caption: block.caption } : {}),
          });
        break;
      }
      case "before_after": {
        const left = block.beforePath ?? (block.beforeAssetId ? assetPaths[block.beforeAssetId] : undefined);
        const right = block.afterPath ?? (block.afterAssetId ? assetPaths[block.afterAssetId] : undefined);
        out.push({
          kind: "pair",
          ...(left ? { leftPath: left } : {}),
          ...(right ? { rightPath: right } : {}),
          leftCaption: block.beforeCaption ?? t("قبل", "Before"),
          rightCaption: block.afterCaption ?? t("بعد", "After"),
        });
        break;
      }
      case "comment":
        out.push({ kind: "note", text: `${t("تعليق", "Comment")}: ${block.text}` });
        break;
      case "page_break":
        out.push({ kind: "page_break" });
        break;
      case "field":
        out.push({
          kind: "kv",
          label: block.label ?? block.source,
          value: resolveField(snapshot, block.source),
        });
        break;
      case "engineering_item": {
        const comp = COMPLIANCE_LABEL[block.compliance]?.[locale] ?? block.compliance;
        const sev = SEVERITY_LABEL[block.severity]?.[locale] ?? block.severity;
        out.push({ kind: "heading", level: 3, text: block.title });
        out.push({ kind: "kv", label: t("الامتثال", "Compliance"), value: comp });
        out.push({ kind: "kv", label: t("درجة الأهمية", "Severity"), value: sev });
        if (block.responsible)
          out.push({ kind: "kv", label: t("المسؤول", "Responsible"), value: block.responsible });
        if (block.dueDate)
          out.push({ kind: "kv", label: t("تاريخ المعالجة", "Due date"), value: block.dueDate });
        if (block.note) out.push({ kind: "text", text: block.note });
        if (block.undertaking)
          out.push({ kind: "note", text: `${t("تعهد", "Undertaking")}: ${block.undertaking}` });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function defaultPageSetup(): PageSetup {
  return {
    size: "A4",
    marginMm: { top: 20, right: 18, bottom: 20, left: 18 },
    header: true,
    footer: true,
    pageNumbers: true,
  };
}
