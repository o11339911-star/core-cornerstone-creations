import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, FileCheck2, ScrollText, ShieldCheck } from "lucide-react";

import {
  CardsSkeleton,
  ErrorState,
  Field,
  FieldGrid,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { listDpiaRegister, listProcessingRegister } from "@/lib/privacy.functions";
import { listLegalVersionsAdmin } from "@/lib/platform-console.functions";
import { formatCount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/privacy")({
  component: PrivacyRegistersPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "سجل المعالجة وتقييم الأثر | إدارة ركيز" },
      {
        name: "description",
        content: "سجل أنشطة المعالجة وتقييمات أثر الخصوصية وإحصاءات قبول الوثائق في منصة ركيز.",
      },
      { property: "og:title", content: "سجل المعالجة وتقييم الأثر | إدارة ركيز" },
      { property: "og:description", content: "أنشطة المعالجة وDPIA وقبول الوثائق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PrivacyRegistersPage() {
  const fetchProcessing = useServerFn(listProcessingRegister);
  const fetchDpia = useServerFn(listDpiaRegister);
  const fetchLegal = useServerFn(listLegalVersionsAdmin);

  const processing = useQuery({ queryKey: ["platform-processing"], queryFn: () => fetchProcessing() });
  const dpia = useQuery({ queryKey: ["platform-dpia"], queryFn: () => fetchDpia() });
  const legal = useQuery({ queryKey: ["platform-legal"], queryFn: () => fetchLegal() });

  if (processing.isPending || dpia.isPending || legal.isPending) return <CardsSkeleton cards={3} />;

  if (processing.isError || dpia.isError || legal.isError) {
    return (
      <ErrorState
        description="تعذّر تحميل سجلات الخصوصية."
        onRetry={() => {
          void processing.refetch();
          void dpia.refetch();
          void legal.refetch();
        }}
      />
    );
  }

  const currentVersions = legal.data.filter((v) => v.is_current);
  const totalAcceptances = legal.data.reduce((sum, v) => sum + v.acceptances, 0);

  return (
    <div className="space-y-6">
      <PageHero
        title="سجل المعالجة وتقييم الأثر"
        subtitle="ما تعالجه المنصة من بيانات، ولماذا، وبأي ضوابط — إضافة إلى قبول المستخدمين للوثائق السارية."
      />

      <StatGrid>
        <StatCard icon={ClipboardList} label="أنشطة المعالجة" value={formatCount(processing.data.length)} />
        <StatCard icon={ShieldCheck} label="نطاقات تقييم الأثر" value={formatCount(dpia.data.length)} />
        <StatCard icon={FileCheck2} label="قبولات موثقة" value={formatCount(totalAcceptances)} tone="success" />
      </StatGrid>

      <SectionCard
        icon={ClipboardList}
        title="سجل أنشطة المعالجة"
        count={formatCount(processing.data.length)}
      >
        {processing.data.length === 0 ? (
          <SoftEmpty icon={ClipboardList} message="لا توجد أنشطة معالجة مسجّلة بعد." />
        ) : (
          <ul className="space-y-3">
            {processing.data.map((activity, index) => (
              <li key={`${activity.activity_ar}-${index}`} className="rounded-xl border border-border p-4">
                <p className="font-semibold text-foreground">{activity.activity_ar}</p>
                <FieldGrid>
                  <Field label="الأساس النظامي" value={activity.legal_basis_ar} />
                  <Field label="الغرض" value={activity.purpose_ar} />
                  <Field label="مدة الاحتفاظ" value={activity.retention_period_ar} />
                  <Field label="فئات البيانات" value={activity.data_categories.join("، ")} />
                  <Field label="المستفيدون" value={activity.recipients.join("، ")} />
                </FieldGrid>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon={ShieldCheck} title="تقييم أثر الخصوصية" count={formatCount(dpia.data.length)}>
        {dpia.data.length === 0 ? (
          <SoftEmpty icon={ShieldCheck} message="لا توجد نطاقات تقييم أثر مسجّلة." />
        ) : (
          <ul className="space-y-3">
            {dpia.data.map((entry, index) => (
              <li key={`${entry.scope_ar}-${index}`} className="rounded-xl border border-border p-4">
                <p className="font-semibold text-foreground">{entry.scope_ar}</p>
                <FieldGrid>
                  <Field label="مستوى الخطورة" value={entry.risk_level} />
                  <Field label="المخاطر" value={entry.risks.map((r) => r.risk).join("، ")} />
                  <Field
                    label="الضوابط"
                    value={entry.controls.map((c) => c.description_ar).join("، ")}
                  />
                  <Field label="الخطورة المتبقية" value={entry.residual_risk_ar} />
                </FieldGrid>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon={ScrollText} title="قبول الوثائق السارية" count={formatCount(currentVersions.length)}>
        {currentVersions.length === 0 ? (
          <SoftEmpty icon={ScrollText} message="لا توجد نسخ سارية منشورة." />
        ) : (
          <ul className="space-y-2">
            {currentVersions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{version.title_ar}</p>
                  <p className="text-xs text-muted-foreground">النسخة {version.version}</p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold tabular-nums text-primary">
                  {formatCount(version.acceptances)} قبول
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
