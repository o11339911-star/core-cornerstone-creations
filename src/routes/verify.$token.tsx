import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { PageHero, SectionCard } from "@/components/rakeez";

import { verifyReport } from "@/lib/reports.functions";

export const Route = createFileRoute("/verify/$token")({
  ssr: false,
  loader: ({ params }) => verifyReport({ data: { token: params.token } }),
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "التحقّق من تقرير هندسي — ركيز" },
      {
        name: "description",
        content: "تحقّق من صحة تقرير هندسي صادر عبر منصة ركيز باستخدام رمز التحقّق المطبوع على التقرير.",
      },
      { property: "og:title", content: "التحقّق من تقرير هندسي — ركيز" },
      {
        property: "og:description",
        content: "صفحة تحقّق عامة تعرض الحد الأدنى من البيانات: رقم التقرير وحالته وجهة الإصدار.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function VerifyPage() {
  const result = Route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-5 px-4 py-12">
      <PageHero title="التحقّق من التقرير" subtitle="تحقّق من صحة تقرير هندسي صادر عبر منصة ركيز." />
      {result ? (
        <SectionCard icon={BadgeCheck} title="نتيجة التحقّق">
          <div className="space-y-3">
            <Row label="رقم التقرير" value={result.report_number} />
            <Row label="جهة الإصدار" value={result.entity_name} />
            <Row
              label="الحالة"
              value={result.status === "approved" ? "معتمد وموثّق" : "غير معتمد"}
            />
            <Row
              label="تاريخ الاعتماد"
              value={result.approved_at ? new Date(result.approved_at).toLocaleDateString("ar") : "—"}
            />
            <p className="pt-2 text-xs text-muted-foreground">
              لا يعرض هذا التحقّق محتوى التقرير — للاطلاع على التفاصيل يلزم الدخول بصلاحية.
            </p>
          </div>
        </SectionCard>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>رمز التحقّق غير صالح أو التقرير غير معتمد.</span>
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </p>
  );
}
