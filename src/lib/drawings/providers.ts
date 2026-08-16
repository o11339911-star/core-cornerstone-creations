/**
 * تجريد مزوّدات عرض المخططات (Drawing viewer providers).
 *
 * الحقيقة المعلنة للمستخدم مطابقة لما هو منفَّذ فعليًا:
 * - `native_pdf`: معاينة PDF داخل المتصفح من رابط موقّع مؤقت.
 * - `local_dxf`: تحليل DXF ورسمه ثنائي الأبعاد داخل المتصفح (dxf-parser + Canvas)،
 *   مع إظهار/إخفاء الطبقات. يعمل الآن.
 * - `local_ifc`: عرض تجريبي (Pilot) ثلاثي الأبعاد عبر web-ifc + three.js داخل
 *   المتصفح، محدود بملفات صغيرة. لا قياس ولا استخراج كميات.
 * - `aps`: مسار DWG — مُجهَّز خادميًا، معطّل، ولا يجري أي اتصال شبكي قبل تفعيله.
 *
 * لا يوجد أي مزوّد يدّعي قياسًا أو لوحات قبل توفّرها فعليًا.
 */

export type DrawingFormat = "pdf" | "dwg" | "dxf" | "ifc";
export type ProviderId = "native_pdf" | "local_dxf" | "local_ifc" | "aps";
export type ProviderAvailability = "available" | "pilot" | "unsupported" | "disabled";

export const VIEWER_TOOLS = [
  "preview",
  "download",
  "sheets",
  "layers",
  "properties",
  "measure",
  "markup",
] as const;
export type ViewerTool = (typeof VIEWER_TOOLS)[number];

export interface ProviderCapability {
  provider: ProviderId;
  availability: ProviderAvailability;
  /** الأدوات المتاحة فعليًا؛ ما عداها يظهر في الواجهة بحالة "غير متاح". */
  tools: Record<ViewerTool, boolean>;
  /** مفتاح ترجمة يشرح الحالة، أو null عند التوفر الكامل. */
  reasonKey: string | null;
}

const BASE: Record<ViewerTool, boolean> = {
  preview: false,
  download: true,
  sheets: false,
  layers: false,
  properties: false,
  measure: false,
  markup: true,
};

export function normalizeFormat(format: string | null | undefined): DrawingFormat | null {
  const value = (format ?? "").toLowerCase();
  return value === "pdf" || value === "dwg" || value === "dxf" || value === "ifc" ? value : null;
}

export function providerForFormat(format: string): ProviderId {
  switch (normalizeFormat(format)) {
    case "pdf":
      return "native_pdf";
    case "dxf":
      return "local_dxf";
    case "ifc":
      return "local_ifc";
    default:
      return "aps";
  }
}

/** هل تُعرض المقارنة البصرية جنبًا إلى جنب لهذه الصيغة؟ */
export function supportsVisualCompare(format: string | null | undefined): boolean {
  const value = normalizeFormat(format);
  return value === "pdf" || value === "dxf";
}

/**
 * قدرات العرض لصيغة معيّنة. `apsEnabled` يأتي من إعدادات الوحدة في القاعدة
 * مقترنًا بوجود متغيرات البيئة على الخادم، ويخصّ DWG وحده.
 */
export function capabilitiesFor(format: string, apsEnabled: boolean): ProviderCapability {
  switch (normalizeFormat(format)) {
    case "pdf":
      return {
        provider: "native_pdf",
        availability: "available",
        tools: { ...BASE, preview: true },
        reasonKey: null,
      };
    case "dxf":
      return {
        provider: "local_dxf",
        availability: "available",
        tools: { ...BASE, preview: true, layers: true },
        reasonKey: "drawings.providerDxfNote",
      };
    case "ifc":
      return {
        provider: "local_ifc",
        availability: "pilot",
        tools: { ...BASE, preview: true, properties: true },
        reasonKey: "drawings.providerIfcPilot",
      };
    case "dwg":
      return {
        provider: "aps",
        availability: "disabled",
        tools: { ...BASE },
        reasonKey: apsEnabled ? "drawings.providerApsPending" : "drawings.providerApsDisabled",
      };
    default:
      return {
        provider: "aps",
        availability: "unsupported",
        tools: { ...BASE },
        reasonKey: "drawings.providerUnsupportedFormat",
      };
  }
}
