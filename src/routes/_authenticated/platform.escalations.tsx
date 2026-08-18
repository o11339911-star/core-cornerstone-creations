import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Building2, Route as RouteIcon } from "lucide-react";

import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { listEscalationPoliciesAdmin } from "@/lib/platform-console.functions";
import { formatCount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/escalations")({
  component: EscalationsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "سياسات التصعيد | إدارة ركيز" },
      {
        name: "description",
        content: "عرض سياسات تصعيد المدد المتأخرة لكل كيان ومشروع وخطوات المخاطبة داخل منصة ركيز.",
      },
      { property: "og:title", content: "سياسات التصعيد | إدارة ركيز" },
      { property: "og:description", content: "سياسات التصعيد وخطواتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KIND_AR: Record<string, string> = {
  request: "الطلبات",
  stage: "المراحل",
  milestone: "الدفعات",
  retention: "الضمان المحتجز",
};

function EscalationsPage() {
  const fetchPolicies = useServerFn(listEscalationPoliciesAdmin);
  const policies = useQuery({
    queryKey: ["platform-escalations"],
    queryFn: () => fetchPolicies(),
  });

  if (policies.isPending) return <CardsSkeleton cards={2} />;
  if (policies.isError) {
    return (
      <ErrorState description="تعذّر تحميل سياسات التصعيد." onRetry={() => void policies.refetch()} />
    );
  }

  const rows = policies.data;
  const active = rows.filter((p) => p.is_active);

  return (
    <div className="space-y-6">
      <PageHero
        title="سياسات التصعيد"
        subtitle="متى تُصعَّد المدة المتأخرة، وإلى من، وبأي ترتيب — تُدار من داخل كل مشروع وتُراقَب من هنا."
      />

      <StatGrid>
        <StatCard icon={ArrowUpRight} label="سياسات فعّالة" value={formatCount(active.length)} />
        <StatCard icon={RouteIcon} label="إجمالي السياسات" value={formatCount(rows.length)} />
        <StatCard
          icon={Building2}
          label="كيانات مشمولة"
          value={formatCount(new Set(rows.map((p) => p.entity_id)).size)}
        />
      </StatGrid>

      <SectionCard icon={ArrowUpRight} title="السياسات" count={formatCount(rows.length)}>
        {rows.length === 0 ? (
          <SoftEmpty
            icon={ArrowUpRight}
            message="لا توجد سياسات تصعيد معرّفة بعد — تُنشأ من صفحة المدد داخل المشروع."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((policy) => (
              <li key={policy.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{policy.name_ar}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      policy.is_active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {policy.is_active ? "فعّالة" : "متوقفة"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {policy.entity_name ?? "كيان"} — {KIND_AR[policy.subject_kind] ?? policy.subject_kind} —
                  تبدأ بعد {formatCount(policy.trigger_after_hours)} ساعة
                </p>
                {policy.steps.length > 0 ? (
                  <ol className="mt-2 space-y-1">
                    {policy.steps.map((step) => (
                      <li key={`${policy.id}-${step.step_no}`} className="text-xs text-muted-foreground">
                        الخطوة {formatCount(step.step_no)}
                        {step.after_hours !== null
                          ? ` — بعد ${formatCount(step.after_hours)} ساعة`
                          : ""}
                        {step.recipient_kind ? ` — إلى ${step.recipient_kind}` : ""}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
