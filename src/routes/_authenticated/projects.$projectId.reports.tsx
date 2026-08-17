import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Send } from "lucide-react";

import {
  CardsSkeleton,
  ErrorState,
  HeroBadge,
  PageHero,
  SectionCard,
  SoftEmpty,
  TextAreaField,
  TextField,
} from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import {
  REPORT_KIND_LABEL,
  REPORT_STATUS_LABEL,
  engineeringBlockMessage,
  reportErrorMessage,
} from "@/lib/reports/labels";
import {
  checkEngineeringReportEligibility,
  checkInspectionReportEligibility,
  createReport,
  listMyReportEntities,
  listProjectEngineeringOffices,
  listReportTemplates,
  listReports,
  requestEngineeringReport,
} from "@/lib/reports.functions";

type ReportKind = "engineering" | "administrative" | "inspection" | "technical_test";

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

function ReportsPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchReports = useServerFn(listReports);
  const fetchEntities = useServerFn(listMyReportEntities);
  const fetchTemplates = useServerFn(listReportTemplates);
  const checkEligibility = useServerFn(checkEngineeringReportEligibility);
  const checkInspection = useServerFn(checkInspectionReportEligibility);
  const fetchOffices = useServerFn(listProjectEngineeringOffices);
  const newReport = useServerFn(createReport);
  const askForReport = useServerFn(requestEngineeringReport);

  const [title, setTitle] = React.useState("");
  const [entityId, setEntityId] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [reportKind, setReportKind] = React.useState<ReportKind>("engineering");
  const [error, setError] = React.useState<string | null>(null);

  const [officeId, setOfficeId] = React.useState("");
  const [requestSubject, setRequestSubject] = React.useState("");
  const [requestBody, setRequestBody] = React.useState("");
  const [requestError, setRequestError] = React.useState<string | null>(null);
  const [requestDone, setRequestDone] = React.useState<string | null>(null);

  const reportsQuery = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => fetchReports({ data: { projectId } }),
  });
  const entitiesQuery = useQuery({ queryKey: ["report-entities"], queryFn: () => fetchEntities({}) });
  const templatesQuery = useQuery({ queryKey: ["report-templates"], queryFn: () => fetchTemplates({}) });

  const entities = entitiesQuery.data ?? [];
  React.useEffect(() => {
    if (!entityId && entities.length > 0) setEntityId(entities[0]!.entity_id);
  }, [entities, entityId]);

  const eligibilityQuery = useQuery({
    queryKey: ["report-eligibility", projectId, entityId],
    queryFn: () => checkEligibility({ data: { projectId, entityId } }),
    enabled: Boolean(entityId),
  });
  const blockReason = eligibilityQuery.data?.reason ?? null;
  const blockMessage = engineeringBlockMessage(blockReason);
  const canIssueEngineering = Boolean(entityId) && !eligibilityQuery.isLoading && blockReason === null;

  const inspectionQuery = useQuery({
    queryKey: ["report-eligibility-inspection", projectId, entityId],
    queryFn: () => checkInspection({ data: { projectId, entityId } }),
    enabled: Boolean(entityId),
  });
  const canIssueInspection =
    Boolean(entityId) && !inspectionQuery.isLoading && (inspectionQuery.data?.reason ?? null) === null;

  React.useEffect(() => {
    if (reportKind === "engineering" && !canIssueEngineering) setReportKind("administrative");
    if ((reportKind === "inspection" || reportKind === "technical_test") && !canIssueInspection) {
      setReportKind("administrative");
    }
  }, [canIssueEngineering, canIssueInspection, reportKind]);

  const officesQuery = useQuery({
    queryKey: ["project-engineering-offices", projectId],
    queryFn: () => fetchOffices({ data: { projectId } }),
    enabled: Boolean(blockReason),
  });
  const offices = officesQuery.data ?? [];
  React.useEffect(() => {
    if (!officeId && offices.length > 0) setOfficeId(offices[0]!.entity_id);
  }, [offices, officeId]);

  const createMutation = useMutation({
    mutationFn: () =>
      newReport({
        data: {
          projectId,
          entityId,
          title,
          language: "ar" as const,
          reportKind,
          ...(templateId ? { templateId } : {}),
        },
      }),
    onSuccess: async () => {
      setTitle("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
    },
    onError: (e: unknown) => setError(reportErrorMessage(e).message),
  });

  const requestMutation = useMutation({
    mutationFn: () =>
      askForReport({
        data: {
          projectId,
          toEntityId: officeId,
          subject: requestSubject,
          ...(requestBody.trim() ? { body: requestBody.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setRequestError(null);
      setRequestSubject("");
      setRequestBody("");
      setRequestDone("تم إرسال طلب التقرير الهندسي إلى المكتب المختار.");
    },
    onError: (e: unknown) => {
      setRequestDone(null);
      setRequestError(reportErrorMessage(e).message);
    },
  });

  const reports = reportsQuery.data ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <PageHero
        title="التقارير الهندسية"
        subtitle="تقارير رسمية بإصدارات متسلسلة، تُختم عند الاعتماد وتصدَّر PDF/Word مع رمز تحقّق."
        badge={reports.length > 0 ? <HeroBadge>{reports.length} تقرير</HeroBadge> : null}
      />

      <SectionCard icon={FileText} title="تقرير جديد">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            الجهة المُصدِرة
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {entities.map((entity) => (
                <option key={entity.entity_id} value={entity.entity_id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            نوع التقرير
            <select
              value={reportKind}
              onChange={(e) => setReportKind(e.target.value as ReportKind)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {canIssueEngineering ? (
                <option value="engineering">{REPORT_KIND_LABEL["engineering"]}</option>
              ) : null}
              <option value="administrative">{REPORT_KIND_LABEL["administrative"]}</option>
              {canIssueInspection ? (
                <>
                  <option value="inspection">{REPORT_KIND_LABEL["inspection"]}</option>
                  <option value="technical_test">{REPORT_KIND_LABEL["technical_test"]}</option>
                </>
              ) : null}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            القالب
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
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

        {blockMessage ? (
          <p className="mt-3 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            {blockMessage}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

        <Button
          type="button"
          disabled={!entityId || title.trim().length < 2 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="mt-3 min-h-11"
        >
          {createMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء التقرير"}
        </Button>
      </SectionCard>

      {blockReason ? (
        <SectionCard icon={Send} title="طلب تقرير هندسي من مكتب هندسي">
          {officesQuery.isLoading ? (
            <CardsSkeleton cards={1} />
          ) : offices.length === 0 ? (
            <SoftEmpty
              icon={Send}
              message="لا يوجد مكتب هندسي مقبول على هذا المشروع بعد — أضف مكتبًا هندسيًا ضمن أطراف المشروع أولًا."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  المكتب الهندسي
                  <select
                    value={officeId}
                    onChange={(e) => setOfficeId(e.target.value)}
                    className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    {offices.map((office) => (
                      <option key={office.entity_id} value={office.entity_id}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField
                  id="report-request-subject"
                  label="موضوع الطلب"
                  value={requestSubject}
                  onChange={(e) => setRequestSubject(e.target.value)}
                />
              </div>
              <TextAreaField
                id="report-request-body"
                label="تفاصيل الطلب (اختياري)"
                rows={3}
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
              />
              {requestError ? <p className="mt-2 text-sm text-destructive">{requestError}</p> : null}
              {requestDone ? <p className="mt-2 text-sm text-primary">{requestDone}</p> : null}
              <Button
                type="button"
                disabled={!officeId || requestSubject.trim().length < 2 || requestMutation.isPending}
                onClick={() => requestMutation.mutate()}
                className="mt-3 min-h-11"
              >
                {requestMutation.isPending ? "جارٍ الإرسال…" : "طلب تقرير هندسي"}
              </Button>
            </>
          )}
        </SectionCard>
      ) : null}

      {reportsQuery.isLoading ? (
        <CardsSkeleton cards={2} />
      ) : reportsQuery.isError ? (
        <ErrorState onRetry={() => void reportsQuery.refetch()} />
      ) : reports.length === 0 ? (
        <SoftEmpty icon={FileText} message="لا توجد تقارير — ابدأ بإنشاء أول تقرير هندسي لهذا المشروع." />
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                to="/reports/$reportId"
                params={{ reportId: report.id }}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{report.title}</span>
                  <span className="block text-xs text-muted-foreground">{report.report_number}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs">
                  {report.is_certified ? (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">موثّق</span>
                  ) : null}
                  <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                    {REPORT_STATUS_LABEL[report.status] ?? "غير محدد"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
