/**
 * تجريد مزوّدات عرض المخططات (Drawing viewer providers).
 *
 * الحقيقة المعلنة للمستخدم مطابقة لما هو منفَّذ فعليًا:
 * - `native_pdf`: يعمل الآن — معاينة PDF داخل المتصفح من رابط موقّع مؤقت.
 * - `local_cad`: غير مدعوم — لا توجد مكتبة تحويل DWG/DXF/IFC فعلية في المشروع.
 * - `aps`: مُجهَّز خادميًا، معطّل افتراضيًا، ولا يجري أي اتصال شبكي قبل تفعيله.
 *
 * لا يوجد أي مزوّد يدّعي قياسًا أو طبقات أو لوحات قبل توفّرها فعليًا.
 */

export type DrawingFormat = "pdf" | "dwg" | "dxf" | "ifc";
export type ProviderId = "native_pdf" | "local_cad" | "aps";
export type ProviderAvailability = "available" | "unsupported" | "disabled";

export const VIEWER_TOOLS = ["preview", "download", "sheets", "layers", "measure", "markup"] as const;
export type ViewerTool = (typeof VIEWER_TOOLS)[number];

export interface ProviderCapability {
  provider: ProviderId;
  availability: ProviderAvailability;
  /** الأدوات المتاحة فعليًا؛ ما عداها يظهر في الواجهة بحالة "غير متاح". */
  tools: Record<ViewerTool, boolean>;
  /** مفتاح ترجمة يشرح سبب عدم التوفر، أو null عند التوفر. */
  reasonKey: string | null;
}

/** المكتبة الفعلية للتحويل المحلي غير مثبتة — نعلنها بصراحة بدل ادّعاء الدعم. */
export const LOCAL_CAD_LIBRARY_INSTALLED = false;

const NO_TOOLS: Record<ViewerTool, boolean> = {
  preview: false,
  download: true,
  sheets: false,
  layers: false,
  measure: false,
  markup: true,
};

export function providerForFormat(format: string): ProviderId {
  if (format === "pdf") return "native_pdf";
  return LOCAL_CAD_LIBRARY_INSTALLED ? "local_cad" : "aps";
}

/**
 * يحسب قدرات العرض لصيغة معيّنة. `apsEnabled` يأتي من إعدادات الوحدة في
 * القاعدة مقترنًا بوجود متغيرات البيئة على الخادم.
 */
export function capabilitiesFor(format: string, apsEnabled: boolean): ProviderCapability {
  if (format === "pdf") {
    return {
      provider: "native_pdf",
      availability: "available",
      tools: { preview: true, download: true, sheets: false, layers: false, measure: false, markup: true },
      reasonKey: null,
    };
  }

  if (LOCAL_CAD_LIBRARY_INSTALLED) {
    return {
      provider: "local_cad",
      availability: "available",
      tools: { ...NO_TOOLS, preview: true },
      reasonKey: null,
    };
  }

  if (apsEnabled) {
    return {
      provider: "aps",
      availability: "disabled",
      tools: NO_TOOLS,
      reasonKey: "drawings.providerApsPending",
    };
  }

  return {
    provider: "aps",
    availability: "disabled",
    tools: NO_TOOLS,
    reasonKey: "drawings.providerApsDisabled",
  };
}
