/**
 * Arabic-only labels for the reports module.
 * No raw key, snake_case, dot.key or English error code may reach the UI.
 * Technical codes are kept separately for the audit/technical log only.
 */

import { FIELD_SOURCES } from "@/lib/reports/blocks";

export const FIELD_LABEL_AR: Record<string, string> = {
  "entity.name": "اسم الجهة",
  "entity.cr_number": "رقم السجل التجاري",
  "entity.logo_path": "شعار الجهة",
  "license.license_number": "رقم الرخصة المهنية",
  "license.expires_on": "تاريخ انتهاء الرخصة",
  "project.name": "اسم المشروع",
  "project.code": "رقم المشروع",
  "project.city": "مدينة المشروع",
  "stage.name_ar": "اسم المرحلة بالعربية",
  "stage.name_en": "اسم المرحلة في النسخة الإنجليزية",
  "visit.visit_start": "تاريخ ووقت الزيارة",
  "property.name": "اسم العقار",
  "property.plan_no": "رقم المخطط",
  "property.parcel_no": "رقم القطعة",
  "property.land_area": "مساحة الأرض",
  "deed.deed_number": "رقم الصك",
  "building_license.license_number": "رقم رخصة البناء",
  "contract.contract_number": "رقم العقد",
  owners: "الملاك",
  parties: "أطراف المشروع",
};

export const UNKNOWN_FIELD_LABEL = "حقل غير معروف";

export function fieldLabel(source: string): string {
  return FIELD_LABEL_AR[source] ?? UNKNOWN_FIELD_LABEL;
}

/** Only sources that have an approved Arabic label are offered in the editor. */
export const FIELD_SOURCE_OPTIONS = FIELD_SOURCES.filter(
  (source) => FIELD_LABEL_AR[source] !== undefined,
);

export const HEADING_LEVEL_LABEL: Record<1 | 2 | 3, string> = {
  1: "عنوان رئيسي",
  2: "عنوان فرعي",
  3: "عنوان فرعي صغير",
};

export const REPORT_KIND_LABEL: Record<string, string> = {
  engineering: "تقرير هندسي",
  administrative: "تقرير إداري",
  inspection: "تقرير فحص",
  technical_test: "تقرير اختبار فني",
};

export const REPORT_STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  pending_approval: "مُقدَّم للاعتماد",
  approved: "معتمد",
  superseded: "مستبدل",
  archived: "مؤرشف",
};

const BLOCK_REASON_AR: Record<string, string> = {
  ENTITY_NOT_ENGINEERING:
    "إصدار التقرير الهندسي خاص بالمكاتب الهندسية (مكتب تصميم، أو مكتب إشراف هندسي مسجّل بنشاط هندسي). أرسل «طلب تقرير هندسي» إلى مكتب هندسي مرتبط بالمشروع.",
  ENTITY_NOT_INSPECTION:
    "هذه الجهة ليست جهة فحص أو مختبرًا فنيًا، فلا يمكنها إصدار تقرير فحص أو اختبار فني.",
  ENTITY_NOT_LINKED_TO_PROJECT:
    "الجهة غير مرتبطة بهذا المشروع كطرف مقبول، فلا يمكنها إصدار تقرير هندسي عليه.",
  NOT_ENTITY_MEMBER: "لست عضوًا في هذه الجهة، فلا يمكنك الإصدار باسمها.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.",
};

/** Arabic reason for blocking an inspection / technical-test report, or null when allowed. */
export function inspectionBlockMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return (
    BLOCK_REASON_AR[reason] ??
    "لا تملك صلاحية إصدار تقرير فحص أو اختبار فني بهذه الجهة على هذا المشروع."
  );
}

/** Arabic reason for the block, or null when issuing is allowed. */
export function engineeringBlockMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return (
    BLOCK_REASON_AR[reason] ??
    "لا تملك صلاحية إصدار تقرير هندسي بهذه الجهة على هذا المشروع."
  );
}

/**
 * Maps a raw server/database error into a clear Arabic message,
 * keeping the technical code for the technical log only.
 */
export function reportErrorMessage(error: unknown): { message: string; code: string | null } {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  const inspectionForbidden = /INSPECTION_REPORT_FORBIDDEN\s*\(([A-Z_]+)\)/.exec(raw);
  if (inspectionForbidden) {
    return {
      message:
        inspectionBlockMessage(inspectionForbidden[1] ?? null) ??
        "لا تملك صلاحية إصدار تقرير فحص أو اختبار فني.",
      code: inspectionForbidden[0],
    };
  }

  const forbidden = /ENGINEERING_REPORT_FORBIDDEN\s*\(([A-Z_]+)\)/.exec(raw);
  if (forbidden) {
    return {
      message: engineeringBlockMessage(forbidden[1] ?? null) ?? "لا تملك صلاحية إصدار تقرير هندسي.",
      code: forbidden[0],
    };
  }

  const license = /OFFICE_LICENSE_INVALID(?:\s*\(([A-Z_]+)\))?/.exec(raw);
  if (license || raw.includes("LICENSE")) {
    return {
      message: "رخصة الجهة غير سارية. حدّث الرخصة أو اختر جهة إصدار مؤهلة.",
      code: license?.[0] ?? "LICENSE",
    };
  }

  if (raw.includes("SELF_APPROVAL_FORBIDDEN")) {
    return {
      message: "لا يمكن لمن أنشأ الإصدار أو حرّره أن يعتمده. أسنِد الاعتماد إلى عضو آخر مخوّل.",
      code: "SELF_APPROVAL_FORBIDDEN",
    };
  }
  if (raw.includes("TARGET_OFFICE_NOT_ELIGIBLE")) {
    return {
      message: "المكتب المختار غير مؤهل أو غير مرتبط بهذا المشروع. اختر مكتبًا هندسيًا مقبولًا على المشروع.",
      code: "TARGET_OFFICE_NOT_ELIGIBLE",
    };
  }
  if (raw.includes("Approved version is locked")) {
    return { message: "الإصدار المعتمد مقفل ولا يقبل التعديل. أنشئ إصدارًا جديدًا.", code: "VERSION_LOCKED" };
  }
  if (raw.includes("An unapproved version already exists")) {
    return { message: "يوجد إصدار غير معتمد بالفعل. أكمله أو اعتمده قبل إنشاء إصدار جديد.", code: "OPEN_VERSION" };
  }
  if (raw.includes("Only drafts can be submitted")) {
    return { message: "لا يمكن تقديم هذا الإصدار — المسودات فقط تُقدَّم للاعتماد.", code: "NOT_DRAFT" };
  }
  if (raw.includes("Version must be submitted for approval first")) {
    return { message: "قدّم الإصدار للاعتماد أولًا قبل اعتماده.", code: "NOT_SUBMITTED" };
  }
  if (/Not allowed|Unauthorized|Not a member|No access/i.test(raw)) {
    return { message: "لا تملك صلاحية تنفيذ هذه العملية.", code: "FORBIDDEN" };
  }
  return { message: "تعذّر تنفيذ العملية. حاول مرة أخرى.", code: raw ? "UNKNOWN" : null };
}
