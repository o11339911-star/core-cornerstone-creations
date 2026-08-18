import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileCheck2, ScrollText, Upload } from "lucide-react";

import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listLegalVersionsAdmin, publishLegalVersion } from "@/lib/platform-console.functions";
import { formatCount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/legal")({
  component: LegalAdminPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الوثائق القانونية | إدارة ركيز" },
      {
        name: "description",
        content: "إدارة نسخ سياسة الخصوصية والشروط والملكية الفكرية والشكاوى ونشر نسخة سارية جديدة.",
      },
      { property: "og:title", content: "الوثائق القانونية | إدارة ركيز" },
      { property: "og:description", content: "نسخ الوثائق القانونية ونشرها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CODES = [
  { code: "privacy", label: "سياسة الخصوصية" },
  { code: "terms", label: "شروط الاستخدام" },
  { code: "ip", label: "الملكية الفكرية" },
  { code: "complaints", label: "الشكاوى" },
] as const;

function PublishForm() {
  const qc = useQueryClient();
  const publish = useServerFn(publishLegalVersion);
  const [code, setCode] = React.useState<(typeof CODES)[number]["code"]>("privacy");
  const [version, setVersion] = React.useState("");
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const [body, setBody] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      publish({
        data: {
          code,
          version: version.trim(),
          effectiveDate: effectiveDate.trim(),
          bodyMd: body.trim(),
          requiresAcceptance: true,
        },
      }),
    onSuccess: () => {
      toast.success("تم نشر النسخة الجديدة");
      setVersion("");
      setBody("");
      setEffectiveDate("");
      void qc.invalidateQueries({ queryKey: ["platform-legal"] });
    },
    onError: () => toast.error("تعذّر نشر النسخة — تحقق من الصلاحية والبيانات"),
  });

  const errors = {
    version: version.trim() ? null : "أدخل رقم النسخة",
    date: /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate.trim()) ? null : "التاريخ بصيغة YYYY-MM-DD",
    body: body.trim().length >= 50 ? null : "نص الوثيقة 50 حرفًا على الأقل",
  };
  const valid = !errors.version && !errors.date && !errors.body;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CODES.map((item) => (
          <Button
            key={item.code}
            type="button"
            variant={code === item.code ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setCode(item.code)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Input
            value={version}
            className="min-h-11"
            placeholder="رقم النسخة، مثال 2.0"
            onChange={(event) => setVersion(event.target.value)}
          />
          {errors.version ? (
            <p className="mt-1 text-xs text-destructive">{errors.version}</p>
          ) : null}
        </div>
        <div>
          <Input
            value={effectiveDate}
            className="min-h-11"
            placeholder="تاريخ السريان YYYY-MM-DD"
            inputMode="numeric"
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
          {errors.date ? <p className="mt-1 text-xs text-destructive">{errors.date}</p> : null}
        </div>
      </div>

      <Textarea
        rows={6}
        value={body}
        placeholder="نص الوثيقة بصيغة Markdown"
        onChange={(event) => setBody(event.target.value)}
      />
      {errors.body ? <p className="text-xs text-destructive">{errors.body}</p> : null}

      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto"
        disabled={!valid || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Upload className="size-4" aria-hidden="true" />
        {mutation.isPending ? "جارٍ النشر…" : "نشر النسخة وجعلها سارية"}
      </Button>
    </div>
  );
}

function LegalAdminPage() {
  const fetchVersions = useServerFn(listLegalVersionsAdmin);
  const versions = useQuery({ queryKey: ["platform-legal"], queryFn: () => fetchVersions() });

  if (versions.isPending) return <CardsSkeleton cards={2} />;
  if (versions.isError) {
    return (
      <ErrorState description="تعذّر تحميل الوثائق القانونية." onRetry={() => void versions.refetch()} />
    );
  }

  const current = versions.data.filter((v) => v.is_current);

  return (
    <div className="space-y-6">
      <PageHero
        title="الوثائق القانونية"
        subtitle="نسخة واحدة سارية لكل وثيقة، والنشر يوقف السابقة ويطالب المستخدمين بالقبول عند الحاجة."
      />

      <StatGrid>
        <StatCard icon={ScrollText} label="نسخ سارية" value={formatCount(current.length)} />
        <StatCard icon={FileCheck2} label="إجمالي النسخ" value={formatCount(versions.data.length)} />
        <StatCard
          icon={FileCheck2}
          label="قبولات موثقة"
          value={formatCount(versions.data.reduce((sum, v) => sum + v.acceptances, 0))}
          tone="success"
        />
      </StatGrid>

      <SectionCard icon={Upload} title="نشر نسخة جديدة">
        <PublishForm />
      </SectionCard>

      <SectionCard icon={ScrollText} title="سجل النسخ" count={formatCount(versions.data.length)}>
        {versions.data.length === 0 ? (
          <SoftEmpty icon={ScrollText} message="لا توجد نسخ منشورة بعد." />
        ) : (
          <ul className="space-y-2">
            {versions.data.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{version.title_ar}</p>
                  <p className="text-xs text-muted-foreground">
                    النسخة {version.version} — سريان {formatDate(version.effective_date)} —{" "}
                    {formatCount(version.acceptances)} قبول
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    version.is_current ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {version.is_current ? "سارية" : "أرشيف"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
