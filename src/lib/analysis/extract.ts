import { toLatinDigits } from "@/lib/format";
import type { AnalysisDetectedType } from "@/lib/analysis.functions";

/**
 * Fully client-side extraction. Nothing here ever sends the file bytes
 * anywhere; every import is lazy so the main bundle stays clean.
 *
 * OCR status: we ship a REAL local text-PDF extractor (pdfjs-dist, bundled
 * worker — no CDN). We deliberately do NOT ship image/scanned-PDF OCR: a
 * trustworthy tesseract.js setup needs Arabic+English trained-data files
 * that are tens of megabytes and are normally streamed from a CDN at
 * runtime; bundling a fake/partial version would silently produce wrong
 * data on scanned deeds and licences, which is worse than admitting the
 * limitation. So `ocrAvailable` is honestly `false`, and images/scanned
 * PDFs fall back to manual entry with a clear Arabic message.
 */
export const ocrAvailable = false as const;

export const OCR_UNAVAILABLE_MESSAGE_AR =
  "تعذّر تشغيل التحليل الضوئي محليًا؛ أدخل البيانات يدويًا.";

export type ExtractedFieldKey =
  | "number"
  | "issuer"
  | "issue_date"
  | "expiry_date"
  | "owner"
  | "area"
  | "plan_no"
  | "parcel_no"
  | "city"
  | "district"
  | "land_use"
  | "restrictions"
  | "office";

export type ExtractedFields = Partial<Record<ExtractedFieldKey, string>>;
export type FieldConfidence = Partial<Record<ExtractedFieldKey, number>>;
export type Conflict = { field: ExtractedFieldKey; values: string[] };

export type ExtractionResult = {
  ok: boolean;
  engine: "pdf_text" | "manual";
  detectedType: AnalysisDetectedType;
  fields: ExtractedFields;
  confidence: FieldConfidence;
  conflicts: Conflict[];
  rawTextSample: string;
  failureReason?: string;
};

/** True for PDFs we can attempt real text extraction on. */
export function isTextExtractablePdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** True for anything only the (currently unavailable) OCR path could read. */
export function isImageOnly(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Extracts raw text from a PDF fully in-browser via pdfjs-dist. */
async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  let text = "";
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  return text;
}

/* --------------------------- classification -------------------------- */

const DEED_HINTS = [/صك/, /السجل\s*العدل/, /كتابة\s*العدل/, /deed/i, /title\s*deed/i];
const LICENSE_HINTS = [/رخصة\s*بناء/, /رخصة\s*البناء/, /building\s*licen[cs]e/i, /بلدية/];
const IDENTITY_HINTS = [/بطاقة\s*هوية/, /السجل\s*المدني/, /national\s*id/i, /passport/i];

export function classify(text: string): AnalysisDetectedType {
  if (DEED_HINTS.some((r) => r.test(text))) return "deed";
  if (LICENSE_HINTS.some((r) => r.test(text))) return "building_license";
  if (IDENTITY_HINTS.some((r) => r.test(text))) return "identity";
  if (/عقار|أرض|قطعة|مخطط/.test(text)) return "property_doc";
  return "other";
}

/* ---------------------------- field regexes --------------------------- */

type Rule = { field: ExtractedFieldKey; patterns: RegExp[]; confidence: number };

const RULES: Rule[] = [
  {
    field: "number",
    confidence: 0.7,
    patterns: [
      /(?:رقم\s*الصك|رقم\s*الرخصة|رقم\s*الوثيقة|deed\s*no\.?|licen[cs]e\s*no\.?|number)\s*[:#]?\s*([0-9A-Za-z\u0660-\u0669/-]{2,40})/i,
    ],
  },
  {
    field: "issuer",
    confidence: 0.55,
    patterns: [
      /(?:جهة\s*الإصدار|الجهة\s*المصدرة|كتابة\s*العدل|issued\s*by|issuer|authority)\s*[:#]?\s*([\u0600-\u06FFA-Za-z\s]{2,80})/i,
    ],
  },
  {
    field: "issue_date",
    confidence: 0.6,
    patterns: [
      /(?:تاريخ\s*الإصدار|تحرر\s*في|issue\s*date|issued\s*on)\s*[:#]?\s*([0-9\u0660-\u0669/\-.]{6,12})/i,
    ],
  },
  {
    field: "expiry_date",
    confidence: 0.6,
    patterns: [
      /(?:تاريخ\s*الانتهاء|ينتهي\s*في|expiry\s*date|expires?\s*on)\s*[:#]?\s*([0-9\u0660-\u0669/\-.]{6,12})/i,
    ],
  },
  {
    field: "owner",
    confidence: 0.5,
    patterns: [/(?:اسم\s*المالك|المالك|owner\s*name|owner)\s*[:#]?\s*([\u0600-\u06FFA-Za-z\s]{2,80})/i],
  },
  {
    field: "area",
    confidence: 0.55,
    patterns: [
      /(?:المساحة|مساحة\s*الأرض|area)\s*[:#]?\s*([0-9\u0660-\u0669.,]{1,15})\s*(?:م2|متر|sqm|m2)?/i,
    ],
  },
  {
    field: "plan_no",
    confidence: 0.55,
    patterns: [/(?:رقم\s*المخطط|plan\s*no\.?)\s*[:#]?\s*([0-9A-Za-z\u0660-\u0669/-]{1,30})/i],
  },
  {
    field: "parcel_no",
    confidence: 0.55,
    patterns: [/(?:رقم\s*القطعة|parcel\s*no\.?)\s*[:#]?\s*([0-9A-Za-z\u0660-\u0669/-]{1,30})/i],
  },
  {
    field: "city",
    confidence: 0.45,
    patterns: [/(?:المدينة|city)\s*[:#]?\s*([\u0600-\u06FFA-Za-z\s]{2,40})/i],
  },
  {
    field: "district",
    confidence: 0.45,
    patterns: [/(?:الحي|district)\s*[:#]?\s*([\u0600-\u06FFA-Za-z\s]{2,40})/i],
  },
  {
    field: "land_use",
    confidence: 0.4,
    patterns: [/(?:استخدام\s*الأرض|الاستخدام|land\s*use)\s*[:#]?\s*([\u0600-\u06FFA-Za-z\s]{2,40})/i],
  },
  {
    field: "restrictions",
    confidence: 0.4,
    patterns: [/(?:القيود|restrictions?)\s*[:#]?\s*([\u0600-\u06FFA-Za-z0-9\s,،]{2,120})/i],
  },
  {
    field: "office",
    confidence: 0.45,
    patterns: [/(?:كتابة\s*عدل|مكتب|office)\s*[:#]?\s*([\u0600-\u06FFA-Za-z0-9\s]{2,60})/i],
  },
];

export function extractFieldsFromText(text: string): {
  fields: ExtractedFields;
  confidence: FieldConfidence;
  conflicts: Conflict[];
} {
  const fields: ExtractedFields = {};
  const confidence: FieldConfidence = {};
  const conflicts: Conflict[] = [];

  for (const rule of RULES) {
    const matches = new Set<string>();
    for (const pattern of rule.patterns) {
      const match = pattern.exec(text);
      if (match?.[1]) matches.add(toLatinDigits(match[1].trim()).replace(/\s+/g, " "));
    }
    if (matches.size === 1) {
      fields[rule.field] = [...matches][0];
      confidence[rule.field] = rule.confidence;
    } else if (matches.size > 1) {
      conflicts.push({ field: rule.field, values: [...matches] });
      confidence[rule.field] = rule.confidence * 0.5;
    }
  }
  return { fields, confidence, conflicts };
}

/** Full pipeline entry point used by the analyzer UI. */
export async function analyzeFile(file: File): Promise<ExtractionResult> {
  if (isTextExtractablePdf(file)) {
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) {
        return {
          ok: false,
          engine: "pdf_text",
          detectedType: "other",
          fields: {},
          confidence: {},
          conflicts: [],
          rawTextSample: "",
          failureReason: "لم يتم العثور على نص قابل للقراءة داخل الملف (قد يكون ملفًا ممسوحًا ضوئيًا).",
        };
      }
      const detectedType = classify(text);
      const { fields, confidence, conflicts } = extractFieldsFromText(text);
      return {
        ok: true,
        engine: "pdf_text",
        detectedType,
        fields,
        confidence,
        conflicts,
        rawTextSample: text.slice(0, 4000),
      };
    } catch (error) {
      return {
        ok: false,
        engine: "pdf_text",
        detectedType: "other",
        fields: {},
        confidence: {},
        conflicts: [],
        rawTextSample: "",
        failureReason: error instanceof Error ? error.message : "تعذّرت قراءة الملف",
      };
    }
  }

  // Images and any other type: OCR is honestly unavailable locally.
  return {
    ok: false,
    engine: "manual",
    detectedType: "other",
    fields: {},
    confidence: {},
    conflicts: [],
    rawTextSample: "",
    failureReason: OCR_UNAVAILABLE_MESSAGE_AR,
  };
}
