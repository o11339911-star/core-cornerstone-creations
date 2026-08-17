/**
 * Central Arabic translator for audit/timeline technical values.
 * No snake_case, dot.keys, table names or error codes may reach the user:
 * anything unknown falls back to a readable Arabic phrase.
 */

const OBJECT_TYPES_AR: Record<string, string> = {
  project_stages: "مراحل المشروع",
  stage_roles: "أدوار المرحلة",
  stage_observations: "ملاحظات المرحلة",
  stage_completion_criteria: "معايير إكمال المرحلة",
  documents: "المستندات",
  document_links: "روابط المستندات",
  document_versions: "إصدارات المستندات",
  requests: "الطلبات",
  contracts: "العقود",
  contract_versions: "إصدارات العقود",
  payment_milestones: "دفعات المشروع",
  disbursement_requests: "طلبات الصرف",
  financial_executions: "التنفيذ المالي",
  report_templates: "قوالب التقارير",
  report_template_imports: "استيراد قوالب التقارير",
  membership: "العضوية",
  grant: "الصلاحيات",
  project_party: "أطراف المشروع",
  platform_admins: "مشرفو المنصة",
  personal_identity: "بيانات الهوية",
};

const ACTIONS_AR: Record<string, string> = {
  insert: "إنشاء السجل",
  update: "تعديل السجل",
  delete: "حذف السجل",
  status_change: "تغيير الحالة",
  revoke: "سحب صلاحية",
  admin_search: "بحث إداري",
  contract_lookup: "استعلام تعاقد",
};

/** Contextual overrides: same action reads differently per object type. */
const CONTEXTUAL_AR: Record<string, string> = {
  "project_stages:insert": "إنشاء المرحلة",
  "project_stages:status_change": "تغيير حالة المرحلة",
  "project_stages:update": "تعديل بيانات المرحلة",
};

function humanize(value: string): string {
  return value.replace(/[._]+/g, " ").trim();
}

export function auditObjectLabelAr(objectType: string | null | undefined): string {
  if (!objectType) return "سجل";
  return OBJECT_TYPES_AR[objectType] ?? humanize(objectType);
}

export function auditActionLabelAr(
  action: string | null | undefined,
  objectType?: string | null,
): string {
  if (!action) return "إجراء";
  const contextual = objectType ? CONTEXTUAL_AR[`${objectType}:${action}`] : undefined;
  return contextual ?? ACTIONS_AR[action] ?? humanize(action);
}
