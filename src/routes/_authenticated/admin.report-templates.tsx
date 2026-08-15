import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { RakeezCard, ReportEditor, UnauthorizedState } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/rakeez/form-field";
import {
  activateTemplate,
  amIPlatformAdmin,
  archiveTemplate,
  getTemplate,
  listRakeezTemplates,
  upsertRakeezTemplate,
} from "@/lib/report-templates.functions";
import { emptyBlock, type ReportContent } from "@/lib/reports/blocks";

export const Route = createFileRoute("/_authenticated/admin/report-templates")({
  component: RakeezTemplateLibraryPage,
  head: () => ({
    meta: [
      { title: "مكتبة قوالب ركيز — إدارة المنصة" },
      {
        name: "description",
        content: "إدارة القوالب الافتراضية الجاهزة لمنصة ركيز: إنشاء وتعديل وأرشفة، بمعزل تام عن تقارير الكيانات.",
      },
      { property: "og:title", content: "مكتبة قوالب ركيز — إدارة المنصة" },
      {
        property: "og:description",
        content: "واجهة مخصصة لقوالب ركيز الافتراضية فقط، بلا أي وصول إلى تقارير أو بيانات مشاريع فعلية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_AR: Record<string, string> = { draft: "مسودة", active: "مفعّل", archived: "مؤرشف" };

const blankContent = (): ReportContent => ({
  blocks: [emptyBlock("heading"), emptyBlock("paragraph")],
});

function RakeezTemplateLibraryPage() {
  const queryClient = useQueryClient();
  const checkAdmin = useServerFn(amIPlatformAdmin);
  const fetchTemplates = useServerFn(listRakeezTemplates);
  const fetchTemplate = useServerFn(getTemplate);
  const save = useServerFn(upsertRakeezTemplate);
  const activate = useServerFn(activateTemplate);
  const archive = useServerFn(archiveTemplate);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [nameAr, setNameAr] = React.useState("");
  const [nameEn, setNameEn] = React.useState("");
  const [content, setContent] = React.useState<ReportContent>(blankContent);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const adminQuery = useQuery({ queryKey: ["platform-admin"], queryFn: () => checkAdmin() });
  const isAdmin = adminQuery.data?.isPlatformAdmin === true;

  const templatesQuery = useQuery({
    queryKey: ["rakeez-templates"],
    queryFn: () => fetchTemplates(),
    enabled: isAdmin,
  });

  const reset = () => {
    setEditingId(null);
    setCode("");
    setNameAr("");
    setNameEn("");
    setContent(blankContent());
  };

  const load = async (templateId: string) => {
    setError(null);
    try {
      const row = (await fetchTemplate({ data: { templateId } })) as unknown as {
        id: string;
        code: string | null;
        name_ar: string;
        name_en: string;
        content: ReportContent;
      };
      setEditingId(row.id);
      setCode(row.code ?? "");
      setNameAr(row.name_ar);
      setNameEn(row.name_en);
      setContent(row.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل القالب");
    }
  };

  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    setError(null);
    setMessage(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["rakeez-templates"] });
      setMessage(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تنفيذ العملية");
    }
  };

  if (adminQuery.isLoading) {
    return <div className="p-8 text-sm">جارٍ التحقق من الصلاحية…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <UnauthorizedState description="هذه الواجهة مخصصة لمشرفي منصة ركيز فقط." />
      </div>
    );
  }

  const templates = templatesQuery.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">مكتبة قوالب ركيز</h1>
        <p className="text-muted-foreground text-sm">
          إدارة القوالب الافتراضية الجاهزة فقط. هذه الشاشة لا تقرأ أي تقرير أو إصدار أو مرفق أو بيانات مشروع أو كيان.
        </p>
      </header>

      {error ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}
      {message ? <p className="bg-secondary rounded-md border p-3 text-sm">{message}</p> : null}

      <RakeezCard title="قوالب ركيز">
        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد قوالب بعد.</p>
        ) : (
          <ul className="divide-y">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="space-y-0.5">
                  <p className="font-medium">{t.name_ar}</p>
                  <p className="text-muted-foreground text-xs">
                    {t.code ?? "—"} — {STATUS_AR[t.status] ?? t.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => load(t.id)}>
                    تحرير
                  </Button>
                  {t.status === "draft" ? (
                    <Button size="sm" onClick={run(() => activate({ data: { templateId: t.id } }), "تم التفعيل")}>
                      تفعيل
                    </Button>
                  ) : null}
                  {t.status !== "archived" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={run(() => archive({ data: { templateId: t.id } }), "تمت الأرشفة")}
                    >
                      أرشفة
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </RakeezCard>

      <RakeezCard
        title={editingId ? "تعديل قالب ركيز" : "قالب ركيز جديد"}
        actions={
          editingId ? (
            <Button size="sm" variant="ghost" onClick={reset}>
              إلغاء التحرير
            </Button>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <TextField id="rk-code" label="الرمز" value={code} onChange={(e) => setCode(e.target.value)} />
          <TextField id="rk-name-ar" label="الاسم (عربي)" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          <TextField
            id="rk-name-en"
            label="الاسم (إنجليزي)"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <ReportEditor content={content} snapshot={{}} onChange={setContent} />
        </div>
        <div className="mt-4">
          <Button
            disabled={nameAr.trim().length < 2}
            onClick={run(async () => {
              const r = await save({
                data: {
                  templateId: editingId,
                  code: code.trim() || undefined,
                  nameAr,
                  nameEn: nameEn || nameAr,
                  language: "ar",
                  content,
                },
              });
              setEditingId(r.templateId);
            }, "تم حفظ القالب")}
          >
            حفظ
          </Button>
        </div>
      </RakeezCard>
    </div>
  );
}
