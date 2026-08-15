import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/rakeez";
import {
  listEscalationEvents,
  listEscalationPolicies,
  listProjectTimers,
} from "@/lib/durations.functions";
import { formatRiyadh } from "@/lib/riyadh-time";

export const Route = createFileRoute("/_authenticated/projects/$projectId/durations")({
  component: DurationsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "المدد والتصعيد | ركيز" },
      {
        name: "description",
        content:
          "عدادات المدد بتوقيت الرياض مع التوقف والاستئناف، وسياسات التصعيد الصريحة وسجل أحداثها.",
      },
      { property: "og:title", content: "المدد والتصعيد | ركيز" },
      {
        property: "og:description",
        content: "متابعة المدد المتبقية والتصعيد المرتبط بسياسة معتمدة فقط.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KIND_AR: Record<string, string> = {
  request: "طلب",
  stage: "مرحلة",
  milestone: "دفعة استحقاق",
  retention: "محتجز",
};

const STATE_AR: Record<string, string> = {
  running: "يعمل",
  paused: "موقوف مؤقتًا",
  stopped: "منتهٍ",
};

function DurationsPage() {
  const { projectId } = Route.useParams();
  const fetchTimers = useServerFn(listProjectTimers);
  const fetchPolicies = useServerFn(listEscalationPolicies);
  const fetchEvents = useServerFn(listEscalationEvents);

  const timers = useQuery({
    queryKey: ["timers", projectId],
    queryFn: () => fetchTimers({ data: { projectId } }),
  });
  const policies = useQuery({
    queryKey: ["escalation-policies", projectId],
    queryFn: () => fetchPolicies({ data: { projectId } }),
  });
  const events = useQuery({
    queryKey: ["escalation-events", projectId],
    queryFn: () => fetchEvents({ data: { projectId } }),
  });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">المدد والتصعيد</h1>
        <p className="text-sm text-muted-foreground">
          كل المدد تُحسب بتوقيت الرياض من مصدر زمني واحد في القاعدة. التصعيد لا يحدث إلا بوجود سياسة
          صريحة تحدد الجهة المستلمة.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">عدادات المدد</h2>
        {timers.data && timers.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {timers.data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {KIND_AR[t.subject_kind] ?? t.subject_kind}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الاستحقاق: {t.due_at ? formatRiyadh(t.due_at) : "غير محدد"} · توقف تراكمي:{" "}
                    {Math.round(t.total_paused_seconds / 3600)} ساعة
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.last_overdue_bucket ? <Badge variant="destructive">متأخر</Badge> : null}
                  <Badge variant={t.state === "running" ? "default" : "secondary"}>
                    {STATE_AR[t.state] ?? t.state}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد عدادات نشطة لهذا المشروع.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">سياسات التصعيد</h2>
        {policies.data && policies.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {policies.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name_ar}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_AR[p.subject_kind] ?? p.subject_kind} · يبدأ بعد {p.trigger_after_hours}{" "}
                    ساعة من التأخر
                  </p>
                </div>
                <Badge variant={p.is_active ? "default" : "secondary"}>
                  {p.is_active ? "مفعّلة" : "متوقفة"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            لا توجد سياسة تصعيد لهذا المشروع — لن يُصعَّد أي تأخر إلى أي جهة.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">سجل التصعيد</h2>
        {events.data && events.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {events.data.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="text-foreground">
                  الخطوة {e.step_no} —{" "}
                  {e.resolved_recipient_user_id ? "أُبلغت الجهة المحددة" : "تعذّر تحديد جهة مستلمة"}
                </span>
                <span className="text-xs text-muted-foreground">{formatRiyadh(e.raised_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد أحداث تصعيد.</p>
        )}
      </section>
    </main>
  );
}
