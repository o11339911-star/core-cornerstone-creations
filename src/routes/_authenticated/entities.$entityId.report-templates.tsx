import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileUp, History, LayoutTemplate, UploadCloud } from "lucide-react";

import { CardsSkeleton, ErrorState, PageHero, SectionCard, SoftEmpty, StatCard, StatGrid } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import {
  activateTemplate,
  archiveTemplate,
  importTemplateFile,
  listEntityTemplates,
  listTemplateImports,
} from "@/lib/report-templates.functions";
import { IMPORT_MAX_BYTES, IMPORT_REASON_AR, checkImportFile } from "@/lib/reports/import-rules";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/entities/$entityId/report-templates")({
  component: EntityTemplatesPage,
  head: () => ({
    meta: [
      { title: "قوالب التقارير — ركيز" },
      {
        name: "description",
        content: "استيراد قوالب التقارير من ملفات Word أو PDF وتحويلها إلى كتل منظمة قابلة للمراجعة والتفعيل.",
      },
      { property: "og:title", content: "قوالب التقارير — ركيز" },
      {
        property: "og:description",
        content: "استيراد قوالب DOCX و PDF إلى ركيز مع تقرير واضح لما لم يُنقل ومراجعة بشرية قبل التفعيل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  active: "مفعّل",
  archived: "مؤرشف",
};
const SOURCE_AR: Record<string, string> = {
  builtin: "جاهز من ركيز",
  editor: "من المحرر",
  docx_import: "مستورد DOCX",
  pdf_import: "مستورد PDF",
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function EntityTemplatesPage() {
  const { entityId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchTemplates = useServerFn(listEntityTemplates);
  const fetchImports = useServerFn(listTemplateImports);
  const upload = useServerFn(importTemplateFile);
  const activate = useServerFn(activateTemplate);
  const archive = useServerFn(archiveTemplate);

  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const templatesQuery = useQuery({
    queryKey: ["entity-templates", entityId],
    queryFn: () => fetchTemplates({ data: { entityId } }),
  });
  const importsQuery = useQuery({
    queryKey: ["template-imports", entityId],
    queryFn: () => fetchImports({ data: { entityId } }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // client-side pre-check mirrors the server gate (server decision is final)
      const verdict = checkImportFile(file.name, file.type, bytes.byteLength, bytes);
      if (!verdict.ok) throw new Error(IMPORT_REASON_AR[verdict.reason] ?? verdict.reason);
      return upload({
        data: {
          ownerScope: "entity",
          entityId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: bytes.byteLength,
          contentBase64: toBase64(bytes),
        },
      });
    },
    onSuccess: async (result) => {
      setError(null);
      setMessage("تم تحليل الملف — راجع النتيجة قبل إنشاء القالب");
      await queryClient.invalidateQueries({ queryKey: ["template-imports", entityId] });
      await navigate({
        to: "/entities/$entityId/template-imports/$importId",
        params: { entityId, importId: result.importId },
      });
    },
    onError: (e: unknown) => {
      setMessage(null);
      const raw = e instanceof Error ? e.message : "تعذّر الاستيراد";
      const reason = raw.startsWith("REJECTED:") ? raw.slice("REJECTED:".length) : null;
      setError(reason ? (IMPORT_REASON_AR[reason] ?? reason) : raw);
    },
  });

  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    setError(null);
    setMessage(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["entity-templates", entityId] });
      setMessage(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تنفيذ العملية");
    }
  };

  const templates = templatesQuery.data ?? [];
  const imports = importsQuery.data ?? [];
  const isLoading = templatesQuery.isPending || importsQuery.isPending;
  const isError = templatesQuery.isError || importsQuery.isError;
  const activeCount = templates.filter((t) => t.status === "active").length;
  const draftCount = templates.filter((t) => t.status === "draft").length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHero
        title="قوالب التقارير"
        subtitle="استورد قالبًا من ملف Word (DOCX) أو PDF. القالب المستورد يبدأ دائمًا كمسودة، وقوالب PDF لا تُفعَّل قبل مراجعة بشرية."
        aside={
          <Button className="min-h-11" onClick={() => inputRef.current?.click()}>
            <UploadCloud className="me-2 size-4" aria-hidden="true" />
            استيراد ملف
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          e.target.value = "";
        }}
      />

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">{message}</p>
      ) : null}
      {uploadMutation.isPending ? (
        <p className="text-sm text-muted-foreground">جارٍ التحليل…</p>
      ) : null}

      {isLoading ? (
        <CardsSkeleton cards={2} />
      ) : isError ? (
        <ErrorState
          onRetry={() => {
            void templatesQuery.refetch();
            void importsQuery.refetch();
          }}
        />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={LayoutTemplate} label="إجمالي القوالب" value={templates.length} tone="primary" />
            <StatCard icon={LayoutTemplate} label="مفعّل" value={activeCount} tone="success" />
            <StatCard icon={FileUp} label="مسودة" value={draftCount} tone="warning" />
            <StatCard
              icon={FileUp}
              label="الحد الأقصى للملف"
              value={`${(IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0)} م.ب`}
              tone="info"
            />
          </StatGrid>

          <SectionCard icon={LayoutTemplate} title="قوالب الكيان" count={templates.length}>
            {templates.length === 0 ? (
              <SoftEmpty icon={LayoutTemplate} message="لا توجد قوالب بعد." />
            ) : (
              <ul className="divide-y divide-border">
                {templates.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">{t.name_ar}</p>
                      <p className="text-xs text-muted-foreground">
                        {SOURCE_AR[t.source] ?? t.source} — {STATUS_AR[t.status] ?? t.status}
                        {t.reviewed_at ? " — تمت المراجعة" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {t.status === "draft" ? (
                        <Button
                          size="sm"
                          className="min-h-11"
                          onClick={run(() => activate({ data: { templateId: t.id } }), "تم تفعيل القالب")}
                        >
                          تفعيل
                        </Button>
                      ) : null}
                      {t.status !== "archived" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={run(() => archive({ data: { templateId: t.id } }), "تمت أرشفة القالب")}
                        >
                          <Archive className="me-1 size-3.5" aria-hidden="true" />
                          أرشفة
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={History} title="سجلات الاستيراد" count={imports.length}>
            {imports.length === 0 ? (
              <SoftEmpty icon={History} message="لا توجد عمليات استيراد." />
            ) : (
              <ul className="divide-y divide-border">
                {imports.map((imp) => (
                  <li key={imp.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">
                        {imp.kind.toUpperCase()} — {imp.blocks_created} كتلة
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {imp.status} — {formatDateTime(imp.created_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() =>
                        navigate({
                          to: "/entities/$entityId/template-imports/$importId",
                          params: { entityId, importId: imp.id },
                        })
                      }
                    >
                      فتح المراجعة
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
