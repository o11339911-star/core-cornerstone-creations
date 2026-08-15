import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AsyncBoundary, RakeezCard, ReportEditor } from "@/components/rakeez";
import { pageSetupSchema, reportContentSchema, type ReportContent } from "@/lib/reports/blocks";
import {
  approveReport,
  createReportVersion,
  exportReportVersion,
  getEntityLicenseState,
  getReport,
  getReportDownloadUrl,
  saveReportDraft,
  submitReportVersion,
} from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/reports/$reportId")({
  component: ReportDetailPage,
  head: () => ({
    meta: [
      { title: "محرر التقرير الهندسي — ركيز" },
      {
        name: "description",
        content:
          "تحرير التقرير الهندسي بصفحات A4 وكتل منظمة، مع إصدارات غير قابلة للتعديل واعتماد رسمي وتصدير موقّع.",
      },
      { property: "og:title", content: "محرر التقرير الهندسي — ركيز" },
      {
        property: "og:description",
        content: "محرر تقارير ركيز: كتل منظمة، بيانات تُملأ تلقائيًا، اعتماد وختم ورمز تحقّق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const VERSION_STATUS: Record<string, string> = {
  draft: "مسودة",
  pending_approval: "مُقدَّم للاعتماد",
  approved: "معتمد",
  superseded: "مستبدل",
};

function ReportDetailPage() {
  const { reportId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchReport = useServerFn(getReport);
  const fetchLicense = useServerFn(getEntityLicenseState);
  const save = useServerFn(saveReportDraft);
  const submit = useServerFn(submitReportVersion);
  const approve = useServerFn(approveReport);
  const newVersion = useServerFn(createReportVersion);
  const exportVersion = useServerFn(exportReportVersion);
  const downloadUrl = useServerFn(getReportDownloadUrl);

  const [draft, setDraft] = React.useState<ReportContent | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => fetchReport({ data: { reportId } }),
  });

  const report = reportQuery.data?.report;
  const versions = reportQuery.data?.versions ?? [];
  const current = versions[0];

  const licenseQuery = useQuery({
    queryKey: ["report-license", report?.entity_id],
    queryFn: () => fetchLicense({ data: { entityId: report!.entity_id } }),
    enabled: Boolean(report?.entity_id),
  });

  React.useEffect(() => {
    if (!current) return;
    const parsed = reportContentSchema.safeParse(current.content);
    setDraft(parsed.success ? parsed.data : { blocks: [] });
  }, [current?.id, current?.updated_at]);

  const readOnly = !current || current.status !== "draft";

  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    setError(null);
    setMessage(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["report", reportId] });
      setMessage(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تنفيذ العملية");
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!current || !draft) return;
      await save({
        data: {
          versionId: current.id,
          content: reportContentSchema.parse(draft),
          pageSetup: pageSetupSchema.parse(current.page_setup ?? {}),
        },
      });
    },
    onSuccess: async () => {
      setError(null);
      setMessage("تم حفظ المسودة");
      await queryClient.invalidateQueries({ queryKey: ["report", reportId] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  const handleDownload = async (kind: "pdf" | "docx") => {
    if (!current) return;
    setError(null);
    setMessage(null);
    try {
      await exportVersion({ data: { versionId: current.id, kind } });
      const { url } = await downloadUrl({ data: { versionId: current.id, kind } });
      window.open(url, "_blank", "noopener,noreferrer");
      setMessage("تم إنشاء رابط تنزيل صالح 60 ثانية فقط");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التصدير");
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <AsyncBoundary
        isLoading={reportQuery.isLoading}
        isError={reportQuery.isError}
        onRetry={() => void reportQuery.refetch()}
      >
        {report && current ? (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground">{report.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {report.report_number} · إصدار {current.version_no} ·{" "}
                  {VERSION_STATUS[current.status] ?? current.status}
                  {report.is_certified ? " · موثّق" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {current.status === "draft" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      حفظ المسودة
                    </button>
                    <button
                      type="button"
                      onClick={run(() => submit({ data: { versionId: current.id } }), "تم تقديم الإصدار للاعتماد")}
                      className="rounded-md border border-border px-4 py-2 text-sm"
                    >
                      تقديم للاعتماد
                    </button>
                  </>
                ) : null}
                {current.status === "pending_approval" ? (
                  <button
                    type="button"
                    onClick={run(() => approve({ data: { versionId: current.id } }), "تم اعتماد التقرير وختمه")}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    اعتماد وختم
                  </button>
                ) : null}
                {current.status === "approved" ? (
                  <button
                    type="button"
                    onClick={run(() => newVersion({ data: { reportId } }), "تم إنشاء إصدار جديد")}
                    className="rounded-md border border-border px-4 py-2 text-sm"
                  >
                    إصدار جديد
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDownload("pdf")}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  تصدير PDF
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload("docx")}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  تصدير Word
                </button>
              </div>
            </header>

            {licenseQuery.data && !licenseQuery.data.is_valid ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                رخصة الكيان غير سارية ({licenseQuery.data.reason}) — سيصدر التقرير غير موثّق ولا يمكن ختمه.
              </p>
            ) : null}
            {message ? <p className="text-sm text-primary">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {draft ? (
              <ReportEditor
                content={draft}
                snapshot={current.snapshot}
                readOnly={readOnly}
                onChange={setDraft}
              />
            ) : null}

            <RakeezCard title="سجل الإصدارات">
              <ul className="space-y-2 text-sm">
                {versions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <span>إصدار {version.version_no}</span>
                    <span className="text-xs text-muted-foreground">
                      {VERSION_STATUS[version.status] ?? version.status}
                      {version.approved_at
                        ? ` · ${new Date(version.approved_at).toLocaleDateString("ar")}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </RakeezCard>
          </>
        ) : null}
      </AsyncBoundary>
    </main>
  );
}
