import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArchiveButton } from "@/components/archive/archive-button";
import { ErrorState, HeroBadge, PageHero, SoftEmpty } from "@/components/rakeez";
import { useAccountUi } from "@/lib/account-ui";
import { listMyProjects } from "@/lib/project-overview.functions";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsBoxPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "المشاريع | ركيز" },
      {
        name: "description",
        content: "كل مشاريع الحساب النشط في شاشة واحدة مع البحث والحالة والمدينة وإمكانية الأرشفة.",
      },
      { property: "og:title", content: "المشاريع | ركيز" },
      {
        property: "og:description",
        content: "تصفّح مشاريعك وافتح ملف أي مشروع أو أضفه إلى أرشيف الكيان.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProjectsBoxPage() {
  const { activeEntity, loading } = useAccountUi();
  const entityId = activeEntity?.id ?? null;
  const fetchProjects = useServerFn(listMyProjects);

  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);

  const projects = useQuery({
    queryKey: ["projects-box", entityId, q.trim(), page],
    queryFn: () => fetchProjects({ data: { entityId, q: q.trim(), page, pageSize: 12 } }),
    enabled: !loading,
  });

  const rows = projects.data?.items ?? [];
  const total = projects.data?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title="المشاريع"
        subtitle="كل مشاريع الحساب النشط في مكان واحد."
        badge={<HeroBadge tone="neutral">{activeEntity?.name ?? "حساب شخصي"}</HeroBadge>}
      >
        <div className="mt-4">
          <Link
            to="/projects/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" aria-hidden="true" /> مشروع جديد
          </Link>
        </div>
      </PageHero>

      <div className="relative">
        <label htmlFor="projects-search" className="sr-only">
          بحث في المشاريع
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted-foreground"
        />
        <Input
          id="projects-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="ابحث باسم المشروع أو رقمه"
          className="h-13 rounded-xl bg-card ps-12"
          autoComplete="off"
        />
      </div>

      {projects.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" role="status" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : projects.isError ? (
        <ErrorState description="تعذّر تحميل المشاريع" onRetry={() => void projects.refetch()} />
      ) : rows.length === 0 ? (
        <SoftEmpty
          icon={FolderKanban}
          message={q ? "لا توجد نتائج مطابقة لبحثك." : "لا توجد مشاريع بعد — أنشئ أول مشروع."}
          action={
            <Link
              to="/projects/new"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              مشروع جديد
            </Link>
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((p) => (
              <li
                key={p.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate font-semibold text-foreground">{p.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.code ? <bdi dir="ltr">{p.code}</bdi> : null}
                      {p.city ? ` · ${p.city}` : ""}
                      {p.template_name ? ` · ${p.template_name}` : ""}
                    </p>
                  </Link>
                  <ArchiveButton
                    compact
                    title={p.name}
                    kind="project"
                    sourceTable="projects"
                    sourceId={p.id}
                  />
                </div>
              </li>
            ))}
          </ul>

          {total > rows.length || page > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={page === 1}
                onClick={() => setPage((v) => Math.max(1, v - 1))}
              >
                السابق
              </Button>
              <span className="text-xs text-muted-foreground">
                <bdi dir="ltr">{`${page} / ${Math.max(1, Math.ceil(total / 12))}`}</bdi>
              </span>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={page >= Math.ceil(total / 12)}
                onClick={() => setPage((v) => v + 1)}
              >
                التالي
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
