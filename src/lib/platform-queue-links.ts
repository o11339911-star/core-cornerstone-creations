/**
 * المرحلة 20 — ربط عنصر الطابور بالطلب الأصلي.
 *
 * عنصر الطابور ليس كيانًا موازيًا: هو إشارة إلى صف أصلي في جدول محدّد.
 * لذلك يُشتق الرابط من `source_table` أولًا (المصدر الحقيقي بنفس المعرّف)،
 * ولا نلجأ إلى `entity_id`/`project_id` إلا حين لا يوجد مسار للأصل نفسه.
 * fail-closed: أي جدول غير معروف يُرجع null بدل تخمين وجهة خاطئة.
 */

export type QueueSourceRef = {
  source_table: string;
  source_id: string;
  entity_id?: string | null;
  project_id?: string | null;
};

export type QueueSourceLink =
  | { kind: "request"; to: "/requests/$requestId"; params: { requestId: string }; label: string }
  | { kind: "entity"; to: "/entities/$entityId"; params: { entityId: string }; label: string }
  | { kind: "project"; to: "/projects/$projectId"; params: { projectId: string }; label: string }
  | { kind: "dsr"; to: "/platform/dsr"; params: Record<string, never>; label: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function queueSourceLink(item: QueueSourceRef): QueueSourceLink | null {
  const table = (item.source_table ?? "").trim().toLowerCase();
  const id = (item.source_id ?? "").trim();
  const validId = UUID_RE.test(id);

  // 1) الأصل نفسه بنفس المعرّف
  if (validId) {
    switch (table) {
      case "requests":
        return { kind: "request", to: "/requests/$requestId", params: { requestId: id }, label: "فتح الطلب الأصلي" };
      case "entities":
        return { kind: "entity", to: "/entities/$entityId", params: { entityId: id }, label: "فتح الكيان الأصلي" };
      case "projects":
        return { kind: "project", to: "/projects/$projectId", params: { projectId: id }, label: "فتح المشروع الأصلي" };
      default:
        break;
    }
  }

  if (table === "dsr_requests") {
    return { kind: "dsr", to: "/platform/dsr", params: {}, label: "فتح طلب الخصوصية" };
  }

  // 2) أقرب سياق معروف حين لا يوجد مسار للأصل
  if (item.entity_id && UUID_RE.test(item.entity_id)) {
    return {
      kind: "entity",
      to: "/entities/$entityId",
      params: { entityId: item.entity_id },
      label: "فتح الكيان المرتبط",
    };
  }
  if (item.project_id && UUID_RE.test(item.project_id)) {
    return {
      kind: "project",
      to: "/projects/$projectId",
      params: { projectId: item.project_id },
      label: "فتح المشروع المرتبط",
    };
  }

  return null;
}
