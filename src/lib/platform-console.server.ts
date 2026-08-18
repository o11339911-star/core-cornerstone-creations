import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { auditActionLabelAr, auditObjectLabelAr } from "@/lib/audit-labels";
import type { Database } from "@/lib/database";
import type {
  ActivityItem,
  EscalationPolicyRow,
  FlagsBoard,
  GrowthPoint,
  LegalVersionRow,
  NamedCount,
  PlatformBadges,
  PlatformOverview,
  SlaTimer,
} from "@/lib/platform-console.types";

/**
 * Phase 30 — طبقة قراءة مركز قيادة المنصة.
 *
 * القاعدة الأمنية: كل دالة هنا تتحقق أولًا من `public.platform_me()` **بجلسة
 * المستخدم نفسه** (fail-closed)، وبعد ثبوت أنه من فريق المنصة فقط تُجمع
 * الأعداد بقراءة خالصة. لا كتابة، لا حذف، ولا بيانات اختبار. كل الكتابات
 * تبقى في دوال SECURITY DEFINER القائمة.
 */

type UserClient = SupabaseClient<Database>;

export type PlatformIdentity = {
  isAdmin: boolean;
  isStaff: boolean;
  role: string | null;
};

/** fail-closed: أي غموض = ممنوع. */
export async function assertPlatformStaff(supabase: UserClient): Promise<PlatformIdentity> {
  const { data, error } = await supabase.rpc("platform_me");
  if (error) throw new Error("PLATFORM_ACCESS_CHECK_FAILED");
  const raw = (data ?? {}) as Record<string, unknown>;
  const isAdmin = raw["is_admin"] === true;
  const isStaff = raw["is_staff"] === true;
  if (!isAdmin && !isStaff) throw new Error("FORBIDDEN");
  return { isAdmin, isStaff, role: (raw["role"] as string | null) ?? null };
}

/** superadmin فقط: أفعال الحوكمة (نشر وثيقة، أعلام، صلاحيات الباقات). */
export async function assertPlatformSuperadmin(supabase: UserClient): Promise<PlatformIdentity> {
  const me = await assertPlatformStaff(supabase);
  if (!me.isAdmin && me.role !== "superadmin") throw new Error("FORBIDDEN");
  return me;
}

function tally(values: (string | null | undefined)[]): NamedCount[] {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = value ?? "غير محدد";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

async function countOf(
  table: string,
  build: (q: any) => any = (q) => q,
): Promise<number> {
  const query = build((supabaseAdmin as any).from(table).select("*", { count: "exact", head: true }));
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

const OPEN_QUEUE = ["open", "assigned", "in_progress"];
const OPEN_DSR = ["received", "identity_pending", "in_review", "open"];
const OPEN_INCIDENT = ["open", "investigating", "contained"];

/* ------------------------------------------------------------- badges */

export async function readPlatformBadges(supabase: UserClient): Promise<PlatformBadges> {
  await assertPlatformStaff(supabase);
  const nowIso = new Date().toISOString();

  const [queueOpen, dsrOpen, incidentsOpen, timersOverdue] = await Promise.all([
    countOf("platform_queue_items", (q) => q.in("status", OPEN_QUEUE)),
    countOf("dsr_requests", (q) => q.is("closed_at", null)),
    countOf("data_incidents", (q) => q.in("status", OPEN_INCIDENT)),
    countOf("duration_timers", (q) =>
      q.is("stopped_at", null).not("due_at", "is", null).lt("due_at", nowIso),
    ),
  ]);

  return { queueOpen, dsrOpen, incidentsOpen, timersOverdue };
}

/* ----------------------------------------------------------- overview */

function weekKey(iso: string): string {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7; // الاثنين بداية الأسبوع
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function buildGrowth(users: string[], entities: string[]): GrowthPoint[] {
  const weeks: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = 7; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(weekKey(d.toISOString()));
  }
  const uniqueWeeks = [...new Set(weeks)];
  const userMap = new Map<string, number>();
  const entityMap = new Map<string, number>();
  for (const iso of users) userMap.set(weekKey(iso), (userMap.get(weekKey(iso)) ?? 0) + 1);
  for (const iso of entities) entityMap.set(weekKey(iso), (entityMap.get(weekKey(iso)) ?? 0) + 1);

  return uniqueWeeks.map((week) => ({
    week,
    users: userMap.get(week) ?? 0,
    entities: entityMap.get(week) ?? 0,
  }));
}

async function readActivity(): Promise<ActivityItem[]> {
  const [perm, reports] = await Promise.all([
    supabaseAdmin
      .from("permission_audit_log")
      .select("id, action, object_type, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("report_audit_log")
      .select("id, action, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const items: ActivityItem[] = [];

  for (const row of perm.data ?? []) {
    items.push({
      id: `p:${row.id}`,
      at: row.created_at,
      title: auditActionLabelAr(row.action, row.object_type),
      detail: auditObjectLabelAr(row.object_type),
      source: "permissions",
    });
  }

  for (const row of reports.data ?? []) {
    items.push({
      id: `r:${row.id}`,
      at: row.created_at,
      title: auditActionLabelAr(row.action, "reports"),
      detail: "التقارير الفنية",
      source: "reports",
    });
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);
}

export async function readPlatformOverview(supabase: UserClient): Promise<PlatformOverview> {
  await assertPlatformStaff(supabase);

  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
  const since = new Date(now.getTime() - 56 * 24 * 3600 * 1000).toISOString();

  const [
    usersTotal,
    entitiesRows,
    profilesRows,
    projectsRows,
    requestsOpen,
    queueOpen,
    queueAssigned,
    timersOverdue,
    timersDueSoon,
    dsrRows,
    incidentRows,
    integrationRows,
    growthUsers,
    growthEntities,
    activity,
  ] = await Promise.all([
    countOf("profiles"),
    supabaseAdmin.from("entities").select("id, type, status").is("deleted_at", null).limit(2000),
    supabaseAdmin.from("entity_profiles").select("entity_id, verification_status").limit(2000),
    supabaseAdmin.from("projects").select("id, status").is("deleted_at", null).limit(4000),
    countOf("requests", (q) => q.is("closed_at", null)),
    countOf("platform_queue_items", (q) => q.eq("status", "open")),
    countOf("platform_queue_items", (q) => q.in("status", ["assigned", "in_progress"])),
    countOf("duration_timers", (q) =>
      q.is("stopped_at", null).not("due_at", "is", null).lt("due_at", nowIso),
    ),
    countOf("duration_timers", (q) =>
      q.is("stopped_at", null).gte("due_at", nowIso).lte("due_at", soonIso),
    ),
    supabaseAdmin
      .from("dsr_requests")
      .select("id, status, due_at, closed_at")
      .is("closed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200),
    supabaseAdmin
      .from("data_incidents")
      .select("id, status, detected_at, authority_notified_at")
      .in("status", OPEN_INCIDENT)
      .order("detected_at", { ascending: true })
      .limit(200),
    supabaseAdmin.from("integration_registry").select("code, status, active").limit(200),
    supabaseAdmin.from("profiles").select("created_at").gte("created_at", since).limit(5000),
    supabaseAdmin.from("entities").select("created_at").gte("created_at", since).limit(5000),
    readActivity(),
  ]);

  const entities = entitiesRows.data ?? [];
  const verificationByEntity = new Map(
    (profilesRows.data ?? []).map((row) => [row.entity_id, row.verification_status]),
  );
  const entitiesVerified = entities.filter(
    (e) => verificationByEntity.get(e.id) === "verified",
  ).length;
  const entitiesPending = entities.length - entitiesVerified;

  const projects = projectsRows.data ?? [];
  const activeProjects = projects.filter(
    (p) => p.status !== "closed" && p.status !== "cancelled" && p.status !== "archived",
  ).length;

  const dsr = dsrRows.data ?? [];
  const incidents = incidentRows.data ?? [];
  const notifyDue = incidents
    .filter((i) => !i.authority_notified_at)
    .map((i) => new Date(new Date(i.detected_at).getTime() + 72 * 3600 * 1000).toISOString())
    .sort()[0];

  return {
    usersTotal,
    entitiesTotal: entities.length,
    entitiesByType: tally(entities.map((e) => e.type)),
    entitiesVerified,
    entitiesPendingVerification: entitiesPending,
    projectsActive: activeProjects,
    projectsByStatus: tally(projects.map((p) => p.status)),
    requestsOpen,
    queueOpen,
    queueAssigned,
    timersOverdue,
    timersDueSoon,
    dsrOpen: dsr.length,
    dsrNextDueAt: dsr.find((r) => r.due_at)?.due_at ?? null,
    incidentsOpen: incidents.length,
    incidentsNotifyDueAt: notifyDue ?? null,
    integrationsByStatus: tally((integrationRows.data ?? []).map((r) => r.status)),
    activity,
    growth: buildGrowth(
      (growthUsers.data ?? []).map((r) => r.created_at),
      (growthEntities.data ?? []).map((r) => r.created_at as string),
    ),
  };
}

/* ---------------------------------------------------------------- SLA */

export async function readSlaTimers(
  supabase: UserClient,
  filter: { kind?: string | undefined; only?: "overdue" | "due" | "all" | undefined },
): Promise<SlaTimer[]> {
  await assertPlatformStaff(supabase);
  const now = Date.now();

  let query = supabaseAdmin
    .from("duration_timers")
    .select("id, subject_kind, subject_id, project_id, entity_id, started_at, due_at, state, stopped_at")
    .is("stopped_at", null)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(300);

  if (filter.kind) query = query.eq("subject_kind", filter.kind);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const due = row.due_at ? new Date(row.due_at).getTime() : null;
    return {
      id: row.id,
      subject_kind: row.subject_kind,
      subject_id: row.subject_id,
      project_id: row.project_id,
      entity_id: row.entity_id,
      started_at: row.started_at,
      due_at: row.due_at,
      state: row.state,
      overdue: due !== null && due < now,
      hours_left: due === null ? null : Math.round(((due - now) / 3600000) * 10) / 10,
    } satisfies SlaTimer;
  });

  if (filter.only === "overdue") return rows.filter((r) => r.overdue);
  if (filter.only === "due") return rows.filter((r) => !r.overdue);
  return rows;
}

/* ------------------------------------------------------- flags & plans */

export async function readFlagsBoard(supabase: UserClient): Promise<FlagsBoard> {
  await assertPlatformStaff(supabase);

  const [flags, countries, entitlements, grants, entityRows, coreFree] = await Promise.all([
    supabaseAdmin.from("feature_flags").select("code, description_ar, enabled_globally").order("code"),
    supabaseAdmin.from("feature_flag_countries").select("code, country_code").limit(1000),
    supabaseAdmin.from("entitlements").select("code, description_ar, is_commercial").order("code"),
    supabaseAdmin
      .from("entity_entitlements")
      .select("entity_id, code, granted_at, expires_at, revoked_at")
      .is("revoked_at", null)
      .limit(1000),
    supabaseAdmin.from("entities").select("id, name").limit(2000),
    supabaseAdmin.from("core_free_actions").select("code").limit(500),
  ]);

  const nameById = new Map((entityRows.data ?? []).map((e) => [e.id, e.name]));
  const grantRows = grants.data ?? [];

  return {
    flags: (flags.data ?? []).map((flag) => ({
      code: flag.code,
      description_ar: flag.description_ar ?? null,
      enabled_globally: flag.enabled_globally,
      countries: (countries.data ?? [])
        .filter((c) => c.code === flag.code)
        .map((c) => ({ country_code: c.country_code, enabled: true })),
    })),
    entitlements: (entitlements.data ?? []).map((e) => ({
      code: e.code,
      description_ar: e.description_ar ?? null,
      is_commercial: e.is_commercial,
      granted_count: grantRows.filter((g) => g.code === e.code).length,
    })),
    entityEntitlements: grantRows.map((g) => ({
      entity_id: g.entity_id,
      entity_name: nameById.get(g.entity_id) ?? null,
      code: g.code,
      granted_at: g.granted_at ?? null,
      expires_at: g.expires_at ?? null,
    })),
    coreFreeActions: (coreFree.data ?? []).map((c) => c.code),
  };
}

/* --------------------------------------------------------- escalations */

export async function readEscalationPolicies(
  supabase: UserClient,
): Promise<EscalationPolicyRow[]> {
  await assertPlatformStaff(supabase);

  const [policies, steps, entityRows] = await Promise.all([
    supabaseAdmin
      .from("escalation_policies")
      .select("id, entity_id, project_id, subject_kind, name_ar, name_en, trigger_after_hours, is_active")
      .order("created_at", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("escalation_steps")
      .select("policy_id, step_no, delay_hours, target_kind")
      .limit(1000),
    supabaseAdmin.from("entities").select("id, name").limit(2000),
  ]);

  const nameById = new Map((entityRows.data ?? []).map((e) => [e.id, e.name]));

  return (policies.data ?? []).map((policy) => ({
    id: policy.id,
    entity_id: policy.entity_id,
    entity_name: nameById.get(policy.entity_id) ?? null,
    project_id: policy.project_id,
    subject_kind: policy.subject_kind,
    name_ar: policy.name_ar,
    name_en: policy.name_en,
    trigger_after_hours: policy.trigger_after_hours,
    is_active: policy.is_active,
    steps: (steps.data ?? [])
      .filter((s) => s.policy_id === policy.id)
      .sort((a, b) => a.step_no - b.step_no)
      .map((s) => ({
        step_no: s.step_no,
        after_hours: s.delay_hours ?? null,
        recipient_kind: s.target_kind ?? null,
      })),
  }));
}

/* --------------------------------------------------------------- legal */

export async function readLegalVersions(supabase: UserClient): Promise<LegalVersionRow[]> {
  await assertPlatformStaff(supabase);

  const [docs, versions, acceptances] = await Promise.all([
    supabaseAdmin.from("legal_documents").select("id, code, title_ar").order("code"),
    supabaseAdmin
      .from("legal_document_versions")
      .select("id, document_id, version, effective_date, published_at, requires_acceptance, is_current")
      .order("effective_date", { ascending: false })
      .limit(200),
    supabaseAdmin.from("policy_acceptances").select("version_id").limit(5000),
  ]);

  const docById = new Map((docs.data ?? []).map((d) => [d.id, d]));
  const counts = new Map<string, number>();
  for (const row of acceptances.data ?? []) {
    counts.set(row.version_id, (counts.get(row.version_id) ?? 0) + 1);
  }

  return (versions.data ?? []).map((v) => {
    const doc = docById.get(v.document_id);
    return {
      id: v.id,
      document_id: v.document_id,
      code: doc?.code ?? "—",
      title_ar: doc?.title_ar ?? "—",
      version: v.version,
      effective_date: v.effective_date,
      published_at: v.published_at,
      requires_acceptance: v.requires_acceptance,
      is_current: v.is_current,
      acceptances: counts.get(v.id) ?? 0,
    };
  });
}
