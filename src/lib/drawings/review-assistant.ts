/**
 * مساعد المراجعة الهندسي — داخلي، قائم على قواعد وبيانات وصفية فقط.
 *
 * لا ذكاء اصطناعي خارجي ولا أي اتصال شبكي. لا يعطي اعتماد كود بناء ولا حصر
 * كميات ولا قرار صرف ولا يغيّر أي حالة؛ مخرجاته ملاحظات إعلامية فقط.
 *
 * fail-closed: أي معلومة غير متوفرة تُعرض "غير متوفر" بثقة منخفضة، ولا تُخمَّن.
 */

export type FindingSeverity = "info" | "warning";

export interface AssistantFact {
  labelKey: string;
  value: string | null;
  /** مصدر المعلومة: بيانات الملف نفسه، أو سجل المخطط، أو غير متوفر. */
  sourceKey: "drawings.sourceFile" | "drawings.sourceRecord" | "drawings.sourceNone";
  confidence: "high" | "low" | "none";
}

export interface AssistantFinding {
  code: string;
  severity: FindingSeverity;
  messageKey: string;
}

export interface AssistantInput {
  status: string;
  sheetNo: string | null;
  revisionLabel: string | null;
  format: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  sheetCount: number | null;
  /** ملاحظات فحص مخزّنة مع النسخة (xrefs / fonts / layers) إن وُجدت. */
  scanNotes: Record<string, unknown>;
  hasIfcRevision: boolean;
  revisionCount: number;
}

export interface AssistantReport {
  facts: AssistantFact[];
  findings: AssistantFinding[];
  /** ثقة إجمالية مشتقة من نسبة الحقائق عالية الثقة. */
  overallConfidence: "high" | "medium" | "low";
  disclaimerKey: string;
}

function fact(
  labelKey: string,
  value: string | null,
  source: AssistantFact["sourceKey"],
): AssistantFact {
  if (value === null || value === "") {
    return { labelKey, value: null, sourceKey: "drawings.sourceNone", confidence: "none" };
  }
  return { labelKey, value, sourceKey: source, confidence: source === "drawings.sourceFile" ? "high" : "low" };
}

export function buildAssistantReport(input: AssistantInput): AssistantReport {
  const facts: AssistantFact[] = [
    fact("drawings.assistFile", input.fileName, "drawings.sourceFile"),
    fact("drawings.assistFormat", input.format ? input.format.toUpperCase() : null, "drawings.sourceFile"),
    fact("drawings.assistRevision", input.revisionLabel, "drawings.sourceRecord"),
    fact("drawings.assistSheet", input.sheetNo, "drawings.sourceRecord"),
    fact(
      "drawings.assistSheetCount",
      input.sheetCount === null ? null : String(input.sheetCount),
      "drawings.sourceFile",
    ),
    fact(
      "drawings.assistLayers",
      typeof input.scanNotes["layers"] === "number" ? String(input.scanNotes["layers"]) : null,
      "drawings.sourceFile",
    ),
    fact("drawings.assistChecksum", input.checksum ? input.checksum.slice(0, 16) : null, "drawings.sourceFile"),
    fact(
      "drawings.assistSize",
      input.sizeBytes === null ? null : String(Math.round(input.sizeBytes / 1024)),
      "drawings.sourceFile",
    ),
  ];

  const findings: AssistantFinding[] = [];

  if (input.status === "superseded") {
    findings.push({ code: "superseded", severity: "warning", messageKey: "drawings.findSuperseded" });
  }
  if (input.revisionCount === 0) {
    findings.push({ code: "no_revision", severity: "warning", messageKey: "drawings.findNoRevision" });
  }
  if (input.format && input.format !== "pdf" && !input.hasIfcRevision) {
    findings.push({ code: "no_ifc", severity: "info", messageKey: "drawings.findNoIfc" });
  }
  if (input.scanNotes["xrefs_missing"] === true) {
    findings.push({ code: "xrefs", severity: "warning", messageKey: "drawings.findXrefs" });
  } else if (input.format && input.format !== "pdf" && input.scanNotes["xrefs_missing"] === undefined) {
    findings.push({ code: "xrefs_unknown", severity: "info", messageKey: "drawings.findXrefsUnknown" });
  }
  if (input.scanNotes["fonts_missing"] === true) {
    findings.push({ code: "fonts", severity: "warning", messageKey: "drawings.findFonts" });
  }
  if (!input.sheetNo) {
    findings.push({ code: "no_sheet_no", severity: "info", messageKey: "drawings.findNoSheetNo" });
  }
  if (input.revisionCount > 1 && input.status === "draft") {
    findings.push({ code: "draft_multi", severity: "info", messageKey: "drawings.findDraftMulti" });
  }

  const high = facts.filter((f) => f.confidence === "high").length;
  const ratio = high / facts.length;
  const overallConfidence: AssistantReport["overallConfidence"] =
    ratio >= 0.6 ? "high" : ratio >= 0.3 ? "medium" : "low";

  return { facts, findings, overallConfidence, disclaimerKey: "drawings.assistDisclaimer" };
}
