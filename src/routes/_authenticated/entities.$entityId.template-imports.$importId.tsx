import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, FileText, Layers, Save } from "lucide-react";

import { CardsSkeleton, ErrorState, PageHero, ReportEditor, SectionCard } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/rakeez/form-field";
import {
  activateTemplate,
  applyTemplateImport,
  getImportPreview,
  getImportSourceUrl,
  getTemplateImport,
  reviewTemplate,
} from "@/lib/report-templates.functions";
import type { ReportContent } from "@/lib/reports/blocks";

export const Route = createFileRoute("/_authenticated/entities/$entityId/template-imports/$importId")({
  component: TemplateImportReviewPage,
  head: () => ({
    meta: [
      { title: "مراجعة القالب المستورد — ركيز" },
      {
        name: "description",
        content: "معاينة جنبًا إلى جنب بين الملف الأصلي والكتل المستخرجة، مع تعديل بشري قبل إنشاء القالب وتفعيله.",
      },
      { property: "og:title", content: "مراجعة القالب المستورد — ركيز" },
      {
        property: "og:description",
        content: "قارن الملف الأصلي بالنتيجة المستخرجة، عدّل الكتل، ثم أنشئ القالب كمسودة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type DroppedItem = { what: string; where: string; why: string };

function TemplateImportReviewPage() {
  const { entityId, importId } = Route.useParams();
  const navigate = useNavigate();

  const fetchImport = useServerFn(getTemplateImport);
  const fetchPreview = useServerFn(getImportPreview);
  const fetchSourceUrl = useServerFn(getImportSourceUrl);
  const apply = useServerFn(applyTemplateImport);
  const review = useServerFn(reviewTemplate);
  const activate = useServerFn(activateTemplate);

  const [content, setContent] = React.useState<ReportContent | null>(null);
  const [nameAr, setNameAr] = React.useState("");
  const [nameEn, setNameEn] = React.useState("");
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [reviewed, setReviewed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const importQuery = useQuery({
    queryKey: ["template-import", importId],
    queryFn: () => fetchImport({ data: { importId } }),
  });
  const previewQuery = useQuery({
    queryKey: ["template-import-preview", importId],
    queryFn: () => fetchPreview({ data: { importId } }),
  });

  React.useEffect(() => {
    if (previewQuery.data && !content) setContent(previewQuery.data.content as ReportContent);
  }, [previewQuery.data, content]);
  React.useEffect(() => {
    if (importQuery.data?.template_id) setTemplateId(importQuery.data.template_id);
  }, [importQuery.data]);

  const record = importQuery.data;
  const dropped = (record?.dropped_report ?? []) as DroppedItem[];
  const warnings = (record?.warnings ?? []) as string[];
  const isPdf = record?.kind === "pdf";

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!content) throw new Error("لا يوجد محتوى");
      return apply({
        data: { importId, nameAr, nameEn: nameEn || nameAr, language: "ar", content },
      });
    },
    onSuccess: (r) => {
      setError(null);
      setTemplateId(r.templateId);
      setMessage("تم إنشاء القالب كمسودة");
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "تعذّر إنشاء القالب"),
  });

  const openSource = async () => {
    setError(null);
    try {
      const { url } = await fetchSourceUrl({ data: { importId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر فتح الملف الأصلي");
    }
  };

  const doReview = async () => {
    if (!templateId) return;
    setError(null);
    try {
      await review({ data: { templateId, note: "مراجعة بشرية للقالب المستورد" } });
      setReviewed(true);
      setMessage("تم تسجيل المراجعة البشرية");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّرت المراجعة");
    }
  };

  const doActivate = async () => {
    if (!templateId) return;
    setError(null);
    try {
      await activate({ data: { templateId } });
      setMessage("تم تفعيل القالب");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التفعيل");
    }
  };

  const isLoading = importQuery.isPending || previewQuery.isPending;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHero
        title="مراجعة القالب المستورد"
        subtitle={
          record
            ? `${record.kind.toUpperCase()} — ${record.blocks_created} كتلة مستخرجة${isPdf ? " — التفعيل يتطلب مراجعة بشرية" : ""}`
            : "جارٍ التحميل…"
        }
        aside={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-11" onClick={openSource}>
              <ExternalLink className="me-2 size-4" aria-hidden="true" />
              فتح الملف الأصلي
            </Button>
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => navigate({ to: "/entities/$entityId/report-templates", params: { entityId } })}
            >
              رجوع
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">{message}</p>
      ) : null}

      {isLoading ? (
        <CardsSkeleton cards={2} />
      ) : importQuery.isError || previewQuery.isError ? (
        <ErrorState
          onRetry={() => {
            void importQuery.refetch();
            void previewQuery.refetch();
          }}
        />
      ) : (
        <>
          {dropped.length > 0 || warnings.length > 0 ? (
            <SectionCard icon={AlertTriangle} title="ما لم يُنقل بنجاح">
              <p className="mb-3 text-xs text-muted-foreground">
                لا يوجد وعد بتطابق بصري كامل مع الملف الأصلي.
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
                {dropped.map((d, i) => (
                  <li key={`d-${i}`}>
                    <span className="font-medium">{d.what}</span> — {d.where}: {d.why}
                  </li>
                ))}
                {warnings.map((w, i) => (
                  <li key={`w-${i}`} className="text-muted-foreground">
                    {w}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard icon={FileText} title="الملف الأصلي (نص مستخرج)" className="max-h-[70vh] overflow-auto">
              <div className="space-y-4">
                {(previewQuery.data?.pages ?? []).map((page, i) => (
                  <pre
                    key={i}
                    className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-6"
                    dir="auto"
                  >
                    {page || "(لا يوجد نص قابل للاستخراج في هذه الصفحة)"}
                  </pre>
                ))}
              </div>
            </SectionCard>

            <SectionCard icon={Layers} title="الكتل المستخرجة (قابلة للتعديل)" className="max-h-[70vh] overflow-auto">
              {content ? (
                <ReportEditor content={content} snapshot={{}} onChange={setContent} />
              ) : (
                <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
              )}
            </SectionCard>
          </div>

          <SectionCard icon={Save} title="إنشاء القالب">
            <p className="mb-4 text-xs text-muted-foreground">القالب المستورد يبدأ دائمًا بحالة مسودة.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField id="tpl-name-ar" label="اسم القالب (عربي)" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
              <TextField id="tpl-name-en" label="اسم القالب (إنجليزي)" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                disabled={!content || nameAr.trim().length < 2 || applyMutation.isPending || !!templateId}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء القالب كمسودة"}
              </Button>
              {templateId && isPdf ? (
                <Button variant="outline" className="min-h-11" disabled={reviewed} onClick={doReview}>
                  تسجيل المراجعة البشرية
                </Button>
              ) : null}
              {templateId ? (
                <Button variant="outline" className="min-h-11" disabled={isPdf && !reviewed} onClick={doActivate}>
                  تفعيل القالب
                </Button>
              ) : null}
            </div>
            {templateId && isPdf && !reviewed ? (
              <p className="mt-2 text-xs text-muted-foreground">
                قوالب PDF لا تُفعَّل قبل تسجيل مراجعة بشرية من صاحب صلاحية داخل الكيان.
              </p>
            ) : null}
          </SectionCard>
        </>
      )}
    </div>
  );
}
