import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/rakeez";
import { searchProjects } from "@/lib/project-overview.functions";
import { useT } from "@/i18n";

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
  code: "رقم المشروع",
  name: "اسم المشروع",
  district: "الحي",
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

function DashboardPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const runSearch = useServerFn(searchProjects);

  const results = useQuery({
    queryKey: ["project-search", q.trim()],
    queryFn: () => runSearch({ data: { q: q.trim() } }),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {t("common.dashboard")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        ابحث برقم المشروع أو اسمه أو الحي أو رقم القطعة أو المخطط أو رقم الصك أو الرخصة.
      </p>

      <div className="mt-6">
        <label htmlFor="project-search" className="sr-only">
          بحث المشاريع
        </label>
        <Input
          id="project-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="مثال: PRJ-1024 أو حي النرجس أو 4/ب"
          className="h-12 text-base"
          autoComplete="off"
        />
      </div>

      <section className="mt-6" aria-live="polite">
        {q.trim().length < 2 ? (
          <p className="text-sm text-muted-foreground">اكتب حرفين على الأقل لبدء البحث.</p>
        ) : results.isPending ? (
          <LoadingState />
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
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{r.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {r.code ? `${r.code} — ` : ""}
                      {[r.city, r.district].filter(Boolean).join(" / ") || "بلا موقع"}
                      {` — مطابقة: ${MATCH_AR[r.match_field] ?? r.match_field}`}
                    </p>
                  </div>
                  <Badge variant="secondary">{STATUS_AR[r.status] ?? r.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-2">
        <Link
          to="/projects/new"
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          مشروع جديد
        </Link>
        <Link
          to="/properties"
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          العقارات
        </Link>
        <Link
          to="/settings/security"
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t("common.security")}
        </Link>
      </div>
    </div>
  );
}
