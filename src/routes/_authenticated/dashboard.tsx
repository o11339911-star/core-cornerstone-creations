import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CalendarClock,
  FolderPlus,
  Inbox,
  MapPin,
  Phone,
  Search,
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
import { listMyProjects } from "@/lib/project-overview.functions";
import { toLatinDigits } from "@/lib/format";
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

const PAGE_SIZE = 10;

function DashboardPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const account = useAccountUi();
  const entityId = account.activeEntity?.id ?? null;
  const fetchProjects = useServerFn(listMyProjects);
  const term = q.trim();

  const projects = useQuery({
    queryKey: ["my-projects", entityId, term, page],
    queryFn: () =>
      fetchProjects({ data: { entityId, q: term, page, pageSize: PAGE_SIZE } }),
    enabled: !account.loading,
    placeholderData: keepPreviousData,
  });

  const total = projects.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Quick actions never replace the project list; the property shortcut is an
  // addition for developer entities, not a substitute.
  const actions: { to: string; icon: typeof Store; label: string }[] = [
    { to: "/requests", icon: Inbox, label: t("requests.inbox.title") },
    { to: "/calls", icon: Phone, label: t("calls.title") },
    { to: "/appointments", icon: CalendarClock, label: "المواعيد" },
    { to: "/marketplace", icon: Store, label: "سوق الخدمات" },
  ];
  if (account.isDeveloper) {
    actions.splice(3, 0, { to: "/properties", icon: Building2, label: "العقارات" });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title={t("common.dashboard")}
        subtitle={t("projects.listSubtitle")}
        badge={<HeroBadge tone="neutral">ركيز</HeroBadge>}
      >
        <div className="relative mt-4 w-full max-w-2xl">
          <label htmlFor="project-search" className="sr-only">
            {t("projects.listSearchPlaceholder")}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted-foreground"
          />
          <Input
            id="project-search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("projects.listSearchPlaceholder")}
            className="h-13 rounded-xl border-transparent bg-card ps-12 text-base text-foreground shadow-elevated"
            autoComplete="off"
          />
        </div>
        <Link
          to="/projects/new"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
        >
          <FolderPlus className="size-4" aria-hidden="true" />
          مشروع جديد
        </Link>
      </PageHero>

      <section aria-label={t("shell.quickActions")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        <h2 className="text-sm font-semibold text-foreground">{t("projects.listTitle")}</h2>
        {projects.isPending ? (
          <div className="space-y-3" role="status" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : projects.isError ? (
          <ErrorState
            description={t("projects.listFailed")}
            onRetry={() => void projects.refetch()}
          />
        ) : !projects.data?.items.length ? (
          term ? (
            <SoftEmpty icon={Sparkles} message={t("projects.listEmptyFiltered")} />
          ) : (
            <EmptyState title={t("projects.listTitle")} description={t("projects.listEmpty")} />
          )
        ) : (
          <>
            <ul className="space-y-3">
              {projects.data.items.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 hover:border-primary/40 hover:shadow-elevated sm:items-center sm:gap-4"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                      <MapPin className="size-5" aria-hidden="true" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{p.name}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          <bdi dir="ltr">{p.code ? toLatinDigits(p.code) : ""}</bdi>
                          {p.code ? " · " : ""}
                          {[p.template_name, p.property_name, p.city, p.district]
                            .filter(Boolean)
                            .join(" · ") || t("projects.listNoReference")}
                        </p>
                      </div>
                      <div className="shrink-0">{statusChip(p.status)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 ? (
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((n) => Math.max(1, n - 1))}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-foreground disabled:opacity-40"
                >
                  {t("projects.listPrev")}
                </button>
                <span className="text-xs text-muted-foreground">
                  {t("projects.listPageOf", {
                    page: toLatinDigits(String(page)),
                    pages: toLatinDigits(String(pages)),
                  })}
                </span>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => setPage((n) => Math.min(pages, n + 1))}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-foreground disabled:opacity-40"
                >
                  {t("projects.listNext")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

