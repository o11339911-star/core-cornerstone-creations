import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RakeezCard, ReportEditor } from "@/components/rakeez";
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">مراجعة القالب المستورد</h1>
          <p className="text-muted-foreground text-sm">
            {record ? `${record.kind.toUpperCase()} — ${record.blocks_created} كتلة مستخرجة` : "جارٍ التحميل…"}
            {isPdf ? " — التفعيل يتطلب مراجعة بشرية" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openSource}>
            فتح الملف الأصلي (60 ثانية)
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate({ to: "/entities/$entityId/report-templates", params: { entityId } })}
          >
            رجوع
          </Button>
        </div>
      </header>

      {error ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}
      {message ? <p className="bg-secondary rounded-md border p-3 text-sm">{message}</p> : null}

      {dropped.length > 0 || warnings.length > 0 ? (
        <RakeezCard title="ما لم يُنقل بنجاح" description="لا يوجد وعد بتطابق بصري كامل مع الملف الأصلي.">
          <ul className="list-inside list-disc space-y-1 text-sm">
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
        </RakeezCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <RakeezCard title="الملف الأصلي (نص مستخرج)" contentClassName="max-h-[70vh] overflow-auto">
          {previewQuery.isLoading ? (
            <p className="text-sm">جارٍ التحليل…</p>
          ) : (
            <div className="space-y-4">
              {(previewQuery.data?.pages ?? []).map((page, i) => (
                <pre
                  key={i}
                  className="bg-muted/40 whitespace-pre-wrap rounded-md p-3 text-xs leading-6"
                  dir="auto"
                >
                  {page || "(لا يوجد نص قابل للاستخراج في هذه الصفحة)"}
                </pre>
              ))}
            </div>
          )}
        </RakeezCard>

        <RakeezCard title="الكتل المستخرجة (قابلة للتعديل)" contentClassName="max-h-[70vh] overflow-auto">
          {content ? (
            <ReportEditor content={content} snapshot={{}} onChange={setContent} />
          ) : (
            <p className="text-sm">جارٍ التحميل…</p>
          )}
        </RakeezCard>
      </div>

      <RakeezCard title="إنشاء القالب" description="القالب المستورد يبدأ دائمًا بحالة مسودة.">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField id="tpl-name-ar" label="اسم القالب (عربي)" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          <TextField id="tpl-name-en" label="اسم القالب (إنجليزي)" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={!content || nameAr.trim().length < 2 || applyMutation.isPending || !!templateId}
            onClick={() => applyMutation.mutate()}
          >
            إنشاء القالب كمسودة
          </Button>
          {templateId && isPdf ? (
            <Button variant="outline" disabled={reviewed} onClick={doReview}>
              تسجيل المراجعة البشرية
            </Button>
          ) : null}
          {templateId ? (
            <Button variant="outline" disabled={isPdf && !reviewed} onClick={doActivate}>
              تفعيل القالب
            </Button>
          ) : null}
        </div>
        {templateId && isPdf && !reviewed ? (
          <p className="text-muted-foreground mt-2 text-xs">
            قوالب PDF لا تُفعَّل قبل تسجيل مراجعة بشرية من صاحب صلاحية داخل الكيان.
          </p>
        ) : null}
      </RakeezCard>
    </div>
  );
}
