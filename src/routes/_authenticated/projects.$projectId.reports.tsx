import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AsyncBoundary, EmptyState, RakeezCard, TextField } from "@/components/rakeez";
import {
  createReport,
  listMyReportEntities,
  listReportTemplates,
  listReports,
} from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "التقارير الهندسية — ركيز" },
      {
        name: "description",
        content:
          "إنشاء التقارير الهندسية الرسمية وإصداراتها غير القابلة للتعديل واعتمادها وتصديرها PDF وWord داخل منصة ركيز.",
      },
      { property: "og:title", content: "التقارير الهندسية — ركيز" },
      {
        property: "og:description",
        content: "محرر تقارير بصفحات A4 مع إصدارات متسلسلة واعتماد موثّق ورمز تحقّق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  approved: "معتمد",
  superseded: "مستبدل",
  archived: "مؤرشف",
};

function ReportsPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchReports = useServerFn(listReports);
  const fetchEntities = useServerFn(listMyReportEntities);
  const fetchTemplates = useServerFn(listReportTemplates);
  const newReport = useServerFn(createReport);

  const [title, setTitle] = React.useState("");
  const [entityId, setEntityId] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const reportsQuery = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => fetchReports({ data: { projectId } }),
  });
  const entitiesQuery = useQuery({ queryKey: ["report-entities"], queryFn: () => fetchEntities({}) });
  const templatesQuery = useQuery({ queryKey: ["report-templates"], queryFn: () => fetchTemplates({}) });

  const createMutation = useMutation({
    mutationFn: () =>
      newReport({
        data: {
          projectId,
          entityId,
          title,
          language: "ar" as const,
          ...(templateId ? { templateId } : {}),
        },
      }),
    onSuccess: async () => {
      setTitle("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "تعذّر إنشاء التقرير"),
  });

  const entities = entitiesQuery.data ?? [];
  React.useEffect(() => {
    if (!entityId && entities.length > 0) setEntityId(entities[0]!.entity_id);
  }, [entities, entityId]);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">التقارير الهندسية</h1>
        <p className="text-sm text-muted-foreground">
          تقارير رسمية بإصدارات متسلسلة، تُختم عند الاعتماد وتصدَّر PDF/Word مع رمز تحقّق.
        </p>
      </header>

      <RakeezCard title="تقرير جديد">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            الكيان المُصدِر
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {entities.map((entity) => (
                <option key={entity.entity_id} value={entity.entity_id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            القالب
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">بدون قالب</option>
              {(templatesQuery.data ?? []).map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name_ar}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id="report-title"
            label="عنوان التقرير"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <button
          type="button"
          disabled={!entityId || title.trim().length < 2 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          إنشاء التقرير
        </button>
      </RakeezCard>

      <AsyncBoundary
        isLoading={reportsQuery.isLoading}
        error={reportsQuery.error instanceof Error ? reportsQuery.error.message : null}
      >
        {(reportsQuery.data ?? []).length === 0 ? (
          <EmptyState title="لا توجد تقارير" description="ابدأ بإنشاء أول تقرير هندسي لهذا المشروع." />
        ) : (
          <ul className="space-y-2">
            {(reportsQuery.data ?? []).map((report) => (
              <li key={report.id}>
                <Link
                  to="/reports/$reportId"
                  params={{ reportId: report.id }}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40"
                >
                  <span>
                    <span className="block font-medium text-foreground">{report.title}</span>
                    <span className="block text-xs text-muted-foreground">{report.report_number}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    {report.is_certified ? (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">موثّق</span>
                    ) : null}
                    <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                      {STATUS_LABEL[report.status] ?? report.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </main>
  );
}
