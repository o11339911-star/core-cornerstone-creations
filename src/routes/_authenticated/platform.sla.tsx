import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlarmClock, Timer, TimerOff } from "lucide-react";

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
import { listSlaTimers } from "@/lib/platform-console.functions";
import { formatCount, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/sla")({
  component: SlaPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "مؤقتات الالتزام | إدارة ركيز" },
      {
        name: "description",
        content: "متابعة مؤقتات المدد داخل ركيز: ما اقترب استحقاقه وما تجاوز موعده حسب نوع الموضوع.",
      },
      { property: "og:title", content: "مؤقتات الالتزام | إدارة ركيز" },
      { property: "og:description", content: "لوحة المدد والاستحقاقات المتأخرة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KIND_AR: Record<string, string> = {
  request: "طلب",
  stage: "مرحلة",
  milestone: "دفعة",
  retention: "ضمان محتجز",
};

const FILTERS = [
  { key: "overdue", label: "متأخر" },
  { key: "due", label: "قبل الاستحقاق" },
  { key: "all", label: "الكل" },
] as const;

function SlaPage() {
  const [only, setOnly] = React.useState<"overdue" | "due" | "all">("overdue");
  const fetchTimers = useServerFn(listSlaTimers);
  const timers = useQuery({
    queryKey: ["platform-sla", only],
    queryFn: () => fetchTimers({ data: { only } }),
  });

  return (
    <div className="space-y-6">
      <PageHero
        title="مؤقتات الالتزام"
        subtitle="كل مدة مفتوحة في المنصة بحسب نوعها وحالتها، مع تمييز ما تجاوز استحقاقه."
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.key}
            type="button"
            variant={only === filter.key ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setOnly(filter.key)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {timers.isPending ? (
        <CardsSkeleton cards={2} />
      ) : timers.isError ? (
        <ErrorState description="تعذّر تحميل المؤقتات." onRetry={() => void timers.refetch()} />
      ) : (
        <>
          <StatGrid>
            <StatCard
              icon={TimerOff}
              label="متأخر"
              value={formatCount(timers.data.filter((t) => t.overdue).length)}
              tone="warning"
            />
            <StatCard
              icon={AlarmClock}
              label="قبل الاستحقاق"
              value={formatCount(timers.data.filter((t) => !t.overdue).length)}
            />
            <StatCard icon={Timer} label="المعروض" value={formatCount(timers.data.length)} />
          </StatGrid>

          <SectionCard icon={Timer} title="المؤقتات" count={formatCount(timers.data.length)}>
            {timers.data.length === 0 ? (
              <SoftEmpty icon={Timer} message="لا توجد مؤقتات مطابقة لهذا الفلتر." />
            ) : (
              <ul className="space-y-2">
                {timers.data.map((timer) => (
                  <li
                    key={timer.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {KIND_AR[timer.subject_kind] ?? timer.subject_kind}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        بدأ في {formatDateTime(timer.started_at)}
                        {timer.due_at ? ` — يستحق في ${formatDateTime(timer.due_at)}` : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        timer.overdue
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-primary"
                      }`}
                    >
                      {timer.overdue
                        ? "تجاوز الاستحقاق"
                        : timer.hours_left === null
                          ? "بلا موعد استحقاق"
                          : `يتبقى ${formatCount(Math.round(timer.hours_left))} ساعة`}
                    </span>
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
