import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState, RakeezAccordion } from "@/components/rakeez";
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
        content: "صفحة المشروع الموحّدة في منصة ركيز مع تبويبات تفصيلية وأقسام قابلة للطي.",
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

const TABS = [
  { to: "/projects/$projectId/stages", label: "المراحل" },
  { to: "/projects/$projectId/contracts", label: "العقود" },
  { to: "/projects/$projectId/finance", label: "المالية" },
  { to: "/projects/$projectId/requests", label: "الطلبات" },
  { to: "/projects/$projectId/services", label: "الخدمات" },
  { to: "/projects/$projectId/parties", label: "الأطراف" },
  { to: "/projects/$projectId/visits", label: "الزيارات" },
  { to: "/projects/$projectId/reports", label: "التقارير" },
  { to: "/projects/$projectId/durations", label: "المدد" },
  { to: "/projects/$projectId/closure", label: "الإغلاق" },
  { to: "/projects/$projectId/warranties", label: "الضمانات" },
] as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function ProjectOverviewPage() {
  const { projectId } = Route.useParams();
  const fetchOverview = useServerFn(getProjectOverview);

  const query = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => fetchOverview({ data: { projectId } }),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState description={(query.error as Error).message} />;
  if (!query.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <EmptyState title="غير موجود" description="لا يوجد مشروع بهذا المعرّف." />
      </div>
    );
  }

  const o: ProjectOverview = query.data;
  const b = o.basics;
  const loc = o.location;
  const percent = o.completion?.percent ?? 0;

  const sections = [
    {
      value: "basics",
      title: "الأساسيات",
      content: (
        <div>
          <Row label="نوع المشروع" value={str(b["template_name_ar"])} />
          <Row label="الكيان" value={str(b["entity_name"])} />
          <Row label="تاريخ البدء" value={str(b["start_date"])} />
          <Row label="النهاية المتوقعة" value={str(b["expected_end_date"])} />
          <Row label="مساحة الأرض" value={str(b["land_area"])} />
          <Row label="تاريخ الإغلاق" value={str(b["closed_at"])} />
          <Row label="مرات إعادة الفتح" value={str(b["reopened_count"])} />
          <Row label="ملاحظات" value={str(b["notes"])} />
        </div>
      ),
    },
    {
      value: "location",
      title: "الموقع",
      content: (
        <div>
          <Row label="المدينة" value={str(loc["city"])} />
          <Row label="الحي" value={str(loc["district"])} />
          <Row label="رقم المخطط" value={str(loc["plan_no"])} />
          <Row label="رقم القطعة" value={str(loc["parcel_no"])} />
          <Row label="إحداثيات تقريبية" value={
            loc["approx_lat"] ? `${String(loc["approx_lat"])}, ${String(loc["approx_lng"])}` : null
          } />
          {loc["exact_visible"] ? (
            <Row
              label="العنوان الدقيق"
              value={str((loc["exact"] as Record<string, unknown> | null)?.["exact_address"])}
            />
          ) : (
            <p className="pt-2 text-xs text-muted-foreground">
              الموقع الدقيق محجوب — لا تملك صلاحية الاطلاع عليه.
            </p>
          )}
        </div>
      ),
    },
    {
      value: "ownership",
      title: `الملكية (${o.ownership.length})`,
      content: o.ownership.length ? (
        <div>
          {o.ownership.map((row, i) => (
            <Row
              key={i}
              label={str(row["owner_name"]) ?? "مالك"}
              value={`${str(row["share_percent"]) ?? "-"}%`}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">لا توجد بيانات ملكية مرتبطة.</p>
      ),
    },
    {
      value: "deed-license",
      title: "الصك والرخصة",
      content: (
        <div>
          <Row label="رقم الصك" value={str(o.deed?.["deed_number"])} />
          <Row label="جهة الإصدار" value={str(o.deed?.["issuer"])} />
          <Row label="تاريخ الصك" value={str(o.deed?.["deed_date"])} />
          <Row label="رقم الرخصة" value={str(o.license?.["license_number"])} />
          <Row label="الأمانة/الجهة" value={str(o.license?.["authority"])} />
          <Row label="انتهاء الرخصة" value={str(o.license?.["expires_on"])} />
          {!o.deed && !o.license ? (
            <p className="text-sm text-muted-foreground">لا صك ولا رخصة مرتبطة بعد.</p>
          ) : null}
        </div>
      ),
    },
    {
      value: "parties",
      title: `الأطراف والمشرفون (${o.parties.length + o.supervisors.length})`,
      content: (
        <div>
          {o.parties.map((p, i) => (
            <Row
              key={`p${i}`}
              label={str(p["entity_name"]) ?? "طرف"}
              value={`${str(p["party_role"]) ?? ""} — ${STATUS_AR[str(p["status"]) ?? ""] ?? str(p["status"])}`}
            />
          ))}
          {o.supervisors.map((s, i) => (
            <Row
              key={`s${i}`}
              label={str(s["full_name"]) ?? "مشرف"}
              value={str(s["job_title_ar"]) ?? "مشرف"}
            />
          ))}
          {!o.parties.length && !o.supervisors.length ? (
            <p className="text-sm text-muted-foreground">لا أطراف ولا مشرفون بعد.</p>
          ) : null}
        </div>
      ),
    },
    {
      value: "documents",
      title: "حالة المستندات",
      content: Object.keys(o.documents).length ? (
        <div>
          {Object.entries(o.documents).map(([k, v]) => (
            <Row key={k} label={STATUS_AR[k] ?? k} value={v} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">لا مستندات مرتبطة بالمشروع.</p>
      ),
    },
    {
      value: "stages",
      title: `المراحل (${o.stages.length})`,
      content: o.stages.length ? (
        <div>
          {o.stages.map((s, i) => (
            <Row
              key={i}
              label={str(s["name_ar"]) ?? "مرحلة"}
              value={
                <Badge variant="secondary">
                  {STATUS_AR[str(s["status"]) ?? ""] ?? str(s["status"])}
                </Badge>
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">لا مراحل بعد.</p>
      ),
    },
    {
      value: "requests",
      title: `الطلبات المفتوحة (${o.requests.length})`,
      content: o.requests.length ? (
        <div>
          {o.requests.map((r, i) => (
            <Row
              key={i}
              label={`${str(r["request_no"]) ?? ""} — ${str(r["subject"]) ?? ""}`}
              value={str(r["status"])}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">لا طلبات مفتوحة.</p>
      ),
    },
    {
      value: "services",
      title: `الخدمات (${o.services.length})`,
      content: o.services.length ? (
        <div>
          {o.services.map((s, i) => (
            <Row
              key={i}
              label={str(s["service_code"]) ?? str(s["service_type"]) ?? "خدمة"}
              value={str(s["status"])}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">لا خدمات مسجلة.</p>
      ),
    },
  ];

  // The finance section only exists when the server actually returned the key.
  if (o.finance) {
    sections.push({
      value: "finance",
      title: `المالية (${o.finance.contracts.length} عقد / ${o.finance.milestones.length} دفعة)`,
      content: (
        <div>
          {o.finance.contracts.map((c, i) => (
            <Row
              key={`c${i}`}
              label={`عقد ${str(c["contract_number"]) ?? ""}`}
              value={str(c["status"])}
            />
          ))}
          {o.finance.milestones.map((m, i) => (
            <Row
              key={`m${i}`}
              label={`دفعة ${str(m["seq"]) ?? ""} — ${str(m["title_ar"]) ?? ""}`}
              value={
                m["amount"]
                  ? `${str(m["amount"])} ${str(m["currency"]) ?? ""}`
                  : (str(m["status"]) ?? "")
              }
            />
          ))}
        </div>
      ),
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {str(b["name"])}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {str(b["code"]) ? `رقم المشروع: ${str(b["code"])}` : "بلا رقم مشروع"}
              {loc["district"] ? ` — ${str(loc["district"])}` : ""}
            </p>
          </div>
          <Badge variant="secondary">
            {STATUS_AR[str(b["status"]) ?? ""] ?? str(b["status"])}
          </Badge>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">نسبة الاكتمال</span>
            <span className="font-semibold text-foreground">{percent}%</span>
          </div>
          <div
            className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            المراحل المطلوبة {o.completion?.stages_done ?? 0}/{o.completion?.stages_total ?? 0} —
            بنود الإغلاق {o.completion?.closure_done ?? 0}/{o.completion?.closure_total ?? 0}
          </p>
        </div>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="تبويبات المشروع">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ projectId }}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="mt-6 rounded-xl border border-border bg-card shadow-card">
        <RakeezAccordion multiple defaultValue={["basics"]} items={sections} />
      </section>
    </div>
  );
}
