import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Banknote,
  Building2,
  CalendarClock,
  ClipboardList,
  FileSignature,
  FileText,
  Info,
  Layers,
  MapPin,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  CardsSkeleton,
  EmptyState,
  ErrorState,
  Field,
  FieldGrid,
  HeroBadge,
  PageHero,
  ProgressRing,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { getProjectOverview, type ProjectOverview } from "@/lib/project-overview.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: ProjectOverviewPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "ملخص المشروع | ركيز" },
      {
        name: "description",
        content:
          "ملخص موحّد للمشروع: الأساسيات والموقع والملكية والصك والرخصة والأطراف والمراحل والطلبات والخدمات ونسبة الاكتمال.",
      },
      { property: "og:title", content: "ملخص المشروع | ركيز" },
      {
        property: "og:description",
        content: "صفحة المشروع الموحّدة في منصة ركيز مع بطاقات ملخص وتبويبات تفصيلية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  on_hold: "متوقف",
  closed: "مغلق",
  archived: "مؤرشف",
  pending: "قيد الانتظار",
  in_progress: "قيد التنفيذ",
  submitted: "مرفوع",
  approved: "معتمد",
  rework: "إعادة عمل",
  skipped: "متجاوَز",
  done: "منجز",
};

function statusTone(status: string | null): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "active":
    case "approved":
    case "done":
      return "success";
    case "on_hold":
    case "rework":
      return "warning";
    case "closed":
    case "archived":
      return "neutral";
    default:
      return "neutral";
  }
}

const TABS = [
  { to: "/projects/$projectId/stages", label: "المراحل", icon: Layers },
  { to: "/projects/$projectId/contracts", label: "العقود", icon: FileSignature },
  { to: "/projects/$projectId/finance", label: "المالية", icon: Banknote },
  { to: "/projects/$projectId/requests", label: "الطلبات", icon: MessageSquare },
  { to: "/projects/$projectId/services", label: "الخدمات", icon: Wrench },
  { to: "/projects/$projectId/parties", label: "الأطراف", icon: Users },
  { to: "/projects/$projectId/visits", label: "الزيارات", icon: MapPin },
  { to: "/projects/$projectId/reports", label: "التقارير", icon: FileText },
  { to: "/projects/$projectId/durations", label: "المدد", icon: CalendarClock },
  { to: "/projects/$projectId/closure", label: "الإغلاق", icon: ClipboardList },
  { to: "/projects/$projectId/warranties", label: "الضمانات", icon: ShieldCheck },
] as const;

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function MiniTable({
  rows,
}: {
  rows: { key: string; primary: string; secondary?: string | null; badge?: string | null }[];
}) {
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.primary}</p>
            {row.secondary ? (
              <p className="truncate text-xs text-muted-foreground">{row.secondary}</p>
            ) : null}
          </div>
          {row.badge ? (
            <Badge variant="secondary" className="shrink-0">
              {row.badge}
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ProjectOverviewPage() {
  const { projectId } = Route.useParams();
  const fetchOverview = useServerFn(getProjectOverview);

  const query = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => fetchOverview({ data: { projectId } }),
  });

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <CardsSkeleton />
      </div>
    );
  }
  if (query.isError) return <ErrorState description={(query.error as Error).message} />;
  if (!query.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <EmptyState title="غير موجود" description="لا يوجد مشروع بهذا المعرّف." />
      </div>
    );
  }

  const o: ProjectOverview = query.data;
  const b = o.basics;
  const loc = o.location;
  const percent = o.completion?.percent ?? 0;
  const status = str(b["status"]);
  const stagesDone = o.stages.filter((s) => {
    const st = str(s["status"]);
    return st === "approved" || st === "done";
  }).length;
  const docsCount = Object.values(o.documents).reduce(
    (sum, v) => sum + (typeof v === "number" ? v : Number(v) || 0),
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={str(b["name"]) ?? "مشروع"}
        subtitle={
          <>
            {str(b["code"]) ? `رقم المشروع: ${str(b["code"])}` : "بلا رقم مشروع"}
            {loc["district"] ? ` · ${str(loc["district"])}` : ""}
            {loc["city"] ? ` · ${str(loc["city"])}` : ""}
          </>
        }
        badge={
          <HeroBadge tone={statusTone(status)}>{STATUS_AR[status ?? ""] ?? status}</HeroBadge>
        }
        aside={
          <div className="flex flex-col items-center gap-2">
            <ProgressRing value={percent} size={96} label="اكتمال المشروع" />
            <p className="text-xs text-muted-foreground">
              المراحل {o.completion?.stages_done ?? 0}/{o.completion?.stages_total ?? 0} · الإغلاق{" "}
              {o.completion?.closure_done ?? 0}/{o.completion?.closure_total ?? 0}
            </p>
          </div>
        }
      />

      <StatGrid>
        <StatCard
          icon={Layers}
          label="المراحل المكتملة"
          value={`${stagesDone}/${o.stages.length}`}
          tone="primary"
        />
        <StatCard
          icon={MessageSquare}
          label="الطلبات المفتوحة"
          value={o.requests.length}
          tone={o.requests.length ? "warning" : "success"}
        />
        <StatCard icon={FileText} label="المستندات" value={docsCount} tone="info" />
        <StatCard
          icon={Users}
          label="الأطراف والمشرفون"
          value={o.parties.length + o.supervisors.length}
          tone="primary"
        />
        <StatCard icon={Wrench} label="الخدمات" value={o.services.length} tone="info" />
      </StatGrid>

      <nav
        aria-label="تبويبات المشروع"
        className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex w-max gap-1 rounded-xl border border-border bg-card p-1.5 shadow-card sm:w-full">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <Link
                to={tab.to}
                params={{ projectId }}
                className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                activeProps={{
                  className:
                    "border-primary bg-secondary text-primary inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border-b-2 px-3 text-sm font-semibold",
                }}
              >
                <tab.icon className="size-4" aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Info} title="الأساسيات">
          <FieldGrid>
            <Field label="نوع المشروع" value={str(b["template_name_ar"])} />
            <Field label="الكيان" value={str(b["entity_name"])} />
            <Field label="تاريخ البدء" value={str(b["start_date"])} />
            <Field label="النهاية المتوقعة" value={str(b["expected_end_date"])} />
            <Field label="مساحة الأرض" value={str(b["land_area"])} />
            <Field label="تاريخ الإغلاق" value={str(b["closed_at"])} />
            <Field label="مرات إعادة الفتح" value={str(b["reopened_count"])} />
            <Field label="ملاحظات" value={str(b["notes"])} />
          </FieldGrid>
        </SectionCard>

        <SectionCard icon={MapPin} title="الموقع">
          <div
            aria-hidden="true"
            className="mb-4 flex h-28 items-center justify-center rounded-lg bg-secondary/60 bg-[radial-gradient(circle_at_1px_1px,var(--color-primary)_1px,transparent_0)] [background-size:14px_14px]"
          >
            <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-primary shadow-card">
              {loc["district"] ? str(loc["district"]) : "الموقع"}
            </span>
          </div>
          <FieldGrid>
            <Field label="المدينة" value={str(loc["city"])} />
            <Field label="الحي" value={str(loc["district"])} />
            <Field label="رقم المخطط" value={str(loc["plan_no"])} />
            <Field label="رقم القطعة" value={str(loc["parcel_no"])} />
            <Field
              label="إحداثيات تقريبية"
              value={
                loc["approx_lat"]
                  ? `${String(loc["approx_lat"])}, ${String(loc["approx_lng"])}`
                  : null
              }
            />
            {loc["exact_visible"] ? (
              <Field
                label="العنوان الدقيق"
                value={str((loc["exact"] as Record<string, unknown> | null)?.["exact_address"])}
              />
            ) : null}
          </FieldGrid>
          {!loc["exact_visible"] ? (
            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              الموقع الدقيق محجوب — لا تملك صلاحية الاطلاع عليه.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard icon={Building2} title="الملكية" count={o.ownership.length}>
          {o.ownership.length ? (
            <MiniTable
              rows={o.ownership.map((row, i) => ({
                key: `own-${i}`,
                primary: str(row["owner_name"]) ?? "مالك",
                badge: `${str(row["share_percent"]) ?? "-"}%`,
              }))}
            />
          ) : (
            <SoftEmpty icon={Building2} message="لم تُسجَّل بيانات ملكية لهذا المشروع بعد." />
          )}
        </SectionCard>

        <SectionCard icon={ScrollText} title="الصك والرخصة">
          {o.deed || o.license ? (
            <FieldGrid>
              <Field label="رقم الصك" value={str(o.deed?.["deed_number"])} />
              <Field label="جهة الإصدار" value={str(o.deed?.["issuer"])} />
              <Field label="تاريخ الصك" value={str(o.deed?.["deed_date"])} />
              <Field label="رقم الرخصة" value={str(o.license?.["license_number"])} />
              <Field label="الأمانة/الجهة" value={str(o.license?.["authority"])} />
              <Field label="انتهاء الرخصة" value={str(o.license?.["expires_on"])} />
            </FieldGrid>
          ) : (
            <SoftEmpty icon={ScrollText} message="لا صك ولا رخصة مرتبطة بالمشروع حتى الآن." />
          )}
        </SectionCard>

        <SectionCard
          icon={Users}
          title="الأطراف والمشرفون"
          count={o.parties.length + o.supervisors.length}
        >
          {o.parties.length || o.supervisors.length ? (
            <MiniTable
              rows={[
                ...o.parties.map((p, i) => ({
                  key: `p-${i}`,
                  primary: str(p["entity_name"]) ?? "طرف",
                  secondary: str(p["party_role"]),
                  badge: STATUS_AR[str(p["status"]) ?? ""] ?? str(p["status"]),
                })),
                ...o.supervisors.map((s, i) => ({
                  key: `s-${i}`,
                  primary: str(s["full_name"]) ?? "مشرف",
                  secondary: str(s["job_title_ar"]) ?? "مشرف",
                })),
              ]}
            />
          ) : (
            <SoftEmpty
              icon={Users}
              message="لا أطراف ولا مشرفون على المشروع بعد."
              action={
                <Link
                  to="/projects/$projectId/parties"
                  params={{ projectId }}
                  className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  إضافة طرف
                </Link>
              }
            />
          )}
        </SectionCard>

        <SectionCard icon={FileText} title="حالة المستندات" count={docsCount}>
          {Object.keys(o.documents).length ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(o.documents).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-primary"
                >
                  {STATUS_AR[k] ?? k}
                  <span className="tabular-nums">{String(v)}</span>
                </span>
              ))}
            </div>
          ) : (
            <SoftEmpty icon={FileText} message="لا مستندات مرتبطة بالمشروع." />
          )}
        </SectionCard>

        <SectionCard icon={Layers} title="المراحل" count={o.stages.length}>
          {o.stages.length ? (
            <MiniTable
              rows={o.stages.map((s, i) => ({
                key: `st-${i}`,
                primary: str(s["name_ar"]) ?? "مرحلة",
                badge: STATUS_AR[str(s["status"]) ?? ""] ?? str(s["status"]),
              }))}
            />
          ) : (
            <SoftEmpty icon={Layers} message="لم تُنشأ مراحل تنفيذ بعد." />
          )}
        </SectionCard>

        <SectionCard icon={MessageSquare} title="الطلبات المفتوحة" count={o.requests.length}>
          {o.requests.length ? (
            <MiniTable
              rows={o.requests.map((r, i) => ({
                key: `rq-${i}`,
                primary: str(r["subject"]) ?? "طلب",
                secondary: str(r["request_no"]),
                badge: STATUS_AR[str(r["status"]) ?? ""] ?? str(r["status"]),
              }))}
            />
          ) : (
            <SoftEmpty icon={MessageSquare} message="لا طلبات مفتوحة — كل شيء تحت السيطرة." />
          )}
        </SectionCard>

        <SectionCard icon={Wrench} title="الخدمات والمرافق" count={o.services.length}>
          {o.services.length ? (
            <MiniTable
              rows={o.services.map((s, i) => ({
                key: `sv-${i}`,
                primary: str(s["service_code"]) ?? str(s["service_type"]) ?? "خدمة",
                badge: STATUS_AR[str(s["status"]) ?? ""] ?? str(s["status"]),
              }))}
            />
          ) : (
            <SoftEmpty icon={Wrench} message="لا خدمات أو عدادات مسجلة على المشروع." />
          )}
        </SectionCard>

        {o.finance ? (
          <SectionCard
            icon={Banknote}
            title="المالية"
            count={`${o.finance.contracts.length} عقد · ${o.finance.milestones.length} دفعة`}
          >
            <MiniTable
              rows={[
                ...o.finance.contracts.map((c, i) => ({
                  key: `fc-${i}`,
                  primary: `عقد ${str(c["contract_number"]) ?? ""}`,
                  badge: STATUS_AR[str(c["status"]) ?? ""] ?? str(c["status"]),
                })),
                ...o.finance.milestones.map((m, i) => ({
                  key: `fm-${i}`,
                  primary: `دفعة ${str(m["seq"]) ?? ""} — ${str(m["title_ar"]) ?? ""}`,
                  secondary: m["amount"]
                    ? `${str(m["amount"])} ${str(m["currency"]) ?? ""}`
                    : null,
                  badge: STATUS_AR[str(m["status"]) ?? ""] ?? str(m["status"]),
                })),
              ]}
            />
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
