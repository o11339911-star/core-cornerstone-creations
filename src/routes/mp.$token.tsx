import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { verifyMarketingPackage } from "@/lib/marketing.functions";

export const Route = createFileRoute("/mp/$token")({
  ssr: false,
  loader: ({ params }) => verifyMarketingPackage({ data: { token: params.token } }),
  component: VerifyMarketingPage,
  head: () => ({
    meta: [
      { title: "التحقق من حقيبة تسويقية — ركيز" },
      {
        name: "description",
        content:
          "تحقّق من صحة حقيبة تسويق عقاري صادرة عبر منصة ركيز باستخدام رمز التحقق أو رمز QR المطبوع عليها.",
      },
      { property: "og:title", content: "التحقق من حقيبة تسويقية — ركيز" },
      {
        property: "og:description",
        content: "صفحة تحقّق عامة تعرض الحد الأدنى: رقم الحقيبة والمسوّق وترخيصه وصلاحية الحقيبة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function VerifyMarketingPage() {
  const result = Route.useLoaderData();
  const valid = !!result && result.status === "valid";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold text-foreground">التحقق من حقيبة تسويقية</h1>
      {valid && result ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-card">
          <p className="flex items-center gap-2 text-success">
            <BadgeCheck className="size-5" aria-hidden="true" />
            <span className="text-sm font-semibold">حقيبة سارية وموثّقة</span>
          </p>
          <Row label="رقم الحقيبة" value={String(result.package_no ?? "—")} />
          <Row label="العرض التسويقي" value={result.listing_title ?? "—"} />
          <Row label="المسوّق" value={result.marketer_name ?? "—"} />
          <Row label="رقم الترخيص" value={result.license_number ?? "—"} />
          <Row label="القناة" value={result.channel_code ?? "—"} />
          <Row
            label="ينتهي في"
            value={result.expires_at ? new Date(result.expires_at).toLocaleDateString("ar") : "—"}
          />
          <p className="pt-2 text-xs text-muted-foreground">
            لا يعرض هذا التحقق تفاصيل المشروع أو أي بيانات مالية.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>رمز التحقق غير صالح أو الحقيبة منتهية/ملغاة.</span>
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-4 border-b border-border/50 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </p>
  );
}
