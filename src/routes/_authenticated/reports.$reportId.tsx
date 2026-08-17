import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CardsSkeleton, ErrorState, HeroBadge, PageHero, RakeezCard, ReportEditor, SectionCard } from "@/components/rakeez";
import { FileText } from "lucide-react";
import { pageSetupSchema, reportContentSchema, type ReportContent } from "@/lib/reports/blocks";
import { formatDate } from "@/lib/format";
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
  errorComponent: ErrorState,
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

  if (reportQuery.isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <CardsSkeleton cards={2} />
      </main>
    );
  }
  if (reportQuery.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <ErrorState onRetry={() => void reportQuery.refetch()} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <>
        {report && current ? (
          <>
            <PageHero
              title={report.title}
              subtitle={`${report.report_number} · إصدار ${current.version_no}${report.is_certified ? " · موثّق" : ""}`}
              badge={<HeroBadge tone="neutral">{VERSION_STATUS[current.status] ?? "غير محدد"}</HeroBadge>}
            />
            <div className="flex flex-wrap justify-end gap-3">
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
            </div>

            {licenseQuery.data && !licenseQuery.data.is_valid ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                رخصة الجهة غير سارية. حدّث الرخصة أو اختر جهة إصدار مؤهلة.
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

            <SectionCard icon={FileText} title="سجل الإصدارات" count={versions.length}>
              <ul className="space-y-2 text-sm">
                {versions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <span>إصدار {version.version_no}</span>
                    <span className="text-xs text-muted-foreground">
                      {VERSION_STATUS[version.status] ?? "غير محدد"}
                      {version.approved_at
                        ? ` · ${formatDate(version.approved_at)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </>
        ) : null}
      </>
    </main>
  );
}
