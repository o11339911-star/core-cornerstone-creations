import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CalendarClock,
  FolderPlus,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  ErrorState,
  HeroBadge,
  PageHero,
  SoftEmpty,
} from "@/components/rakeez";
import { searchProjects } from "@/lib/project-overview.functions";
import { useT } from "@/i18n";
import { useAccountUi } from "@/lib/account-ui";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "لوحة التحكم | ركيز" },
      {
        name: "description",
        content:
          "ابحث في مشاريعك برقم المشروع أو الحي أو رقم القطعة أو المخطط أو رقم الصك، وافتح ملخص المشروع الموحّد.",
      },
      { property: "og:title", content: "لوحة التحكم | ركيز" },
      {
        property: "og:description",
        content: "بحث موحّد عبر مشاريع ركيز مع احترام كامل لصلاحيات الوصول.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const MATCH_AR: Record<string, string> = {
  project_code: "رقم المشروع",
  project_name: "اسم المشروع",
  project: "المشروع",
  district: "الحي",
  property_district: "حي العقار",
  parcel_no: "رقم القطعة",
  plan_no: "رقم المخطط",
  deed_number: "رقم الصك",
  license_number: "رقم الرخصة",
};

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  on_hold: "متوقف",
  closed: "مغلق",
  archived: "مؤرشف",
};

function statusChip(status: string) {
  const tone =
    status === "active"
      ? "bg-success-soft text-success"
      : status === "on_hold"
        ? "bg-warning-soft text-warning"
        : "bg-secondary text-primary";
  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {STATUS_AR[status] ?? status}
    </span>
  );
}

function DashboardPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const runSearch = useServerFn(searchProjects);
  const term = q.trim();

  const results = useQuery({
    queryKey: ["project-search", term],
    queryFn: () => runSearch({ data: { q: term } }),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
  });

  const account = useAccountUi();

  // Exactly four balanced quick actions: no orphan card on a 2-column mobile
  // grid, and the properties entry never enters the DOM for non-developers.
  const actions: { to: string; icon: typeof Store; label: string }[] = [
    { to: "/marketplace", icon: Store, label: "سوق الخدمات" },
    { to: "/appointments", icon: CalendarClock, label: "المواعيد" },
    { to: "/projects/new", icon: FolderPlus, label: "مشروع جديد" },
    account.isDeveloper
      ? { to: "/properties", icon: Building2, label: "العقارات" }
      : { to: "/settings/security", icon: ShieldCheck, label: t("common.security") },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title={t("common.dashboard")}
        subtitle="ابحث برقم المشروع أو الحي أو رقم القطعة أو المخطط أو رقم الصك."
        badge={<HeroBadge tone="neutral">ركيز</HeroBadge>}
      >
        <div className="relative mt-4 w-full max-w-2xl">
          <label htmlFor="project-search" className="sr-only">
            بحث المشاريع
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted-foreground"
          />
          <Input
            id="project-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثال: PRJ-1024 أو حي النرجس"
            className="h-13 rounded-xl border-transparent bg-card ps-12 text-base text-foreground shadow-elevated"
            autoComplete="off"
          />
        </div>
      </PageHero>

      <section aria-label={t("shell.quickActions")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {actions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 hover:border-primary/40 hover:shadow-elevated"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
                <action.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="truncate text-sm font-semibold text-foreground">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </section>


      <section aria-live="polite" className="space-y-3">
        {term.length < 2 ? (
          <SoftEmpty icon={Sparkles} message="اكتب حرفين على الأقل لبدء البحث في مشاريعك." />
        ) : results.isPending ? (
          <div className="space-y-3" role="status" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : results.isError ? (
          <ErrorState description={(results.error as Error).message} />
        ) : !results.data?.length ? (
          <EmptyState
            title="لا نتائج"
            description="لا يوجد مشروع مطابق ضمن ما تملك صلاحية الوصول إليه."
          />
        ) : (
          <ul className="space-y-3">
            {results.data.map((r) => (
              <li key={r.project_id}>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: r.project_id }}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 hover:border-primary/40 hover:shadow-elevated sm:items-center sm:gap-4"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <MapPin className="size-5" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{r.name}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {r.code ? `${r.code} · ` : ""}
                        {[r.city, r.district].filter(Boolean).join(" / ") || "بلا موقع"}
                        {` · مطابقة: ${MATCH_AR[r.match_field] ?? r.match_field}`}
                      </p>
                    </div>
                    <div className="shrink-0">{statusChip(r.status)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
