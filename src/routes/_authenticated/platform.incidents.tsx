import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, BookLock, ShieldAlert, Timer } from "lucide-react";

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
import {
  listDataIncidents,
  reportDataIncident,
  updateDataIncident,
  type DataIncident,
} from "@/lib/privacy.functions";
import { formatCount, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/incidents")({
  component: IncidentsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "حوادث البيانات | إدارة ركيز" },
      {
        name: "description",
        content: "تسجيل حوادث البيانات ومتابعة الاحتواء ومهلة إبلاغ الجهة المختصة داخل ركيز.",
      },
      { property: "og:title", content: "حوادث البيانات | إدارة ركيز" },
      { property: "og:description", content: "سجل الحوادث ومهلة الإبلاغ والاحتواء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SEVERITY_AR: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};

const STATUS_AR: Record<string, string> = {
  open: "مفتوحة",
  investigating: "قيد التحقيق",
  contained: "محتواة",
  closed: "مغلقة",
};

const OPEN_STATES = ["open", "investigating", "contained"];

/** مهلة نظامية: 72 ساعة من لحظة الاكتشاف لإبلاغ الجهة المختصة. */
function notifyDeadline(incident: DataIncident): { text: string; tone: string } {
  if (incident.authority_notified_at) {
    return { text: `أُبلغت الجهة في ${formatDateTime(incident.authority_notified_at)}`, tone: "text-success" };
  }
  const due = new Date(new Date(incident.detected_at).getTime() + 72 * 3600 * 1000);
  const hours = Math.round((due.getTime() - Date.now()) / 3600000);
  if (hours <= 0) {
    return { text: `تجاوزت مهلة الإبلاغ منذ ${formatCount(Math.abs(hours))} ساعة`, tone: "text-destructive" };
  }
  return { text: `يتبقى ${formatCount(hours)} ساعة لإبلاغ الجهة`, tone: "text-warning" };
}

function IncidentRow({ incident }: { incident: DataIncident }) {
  const qc = useQueryClient();
  const update = useServerFn(updateDataIncident);
  const [lessons, setLessons] = React.useState("");
  const deadline = notifyDeadline(incident);

  const mutate = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      update({ data: { incidentId: incident.id, ...payload } as never }),
    onSuccess: () => {
      toast.success("تم تحديث الحادثة");
      setLessons("");
      void qc.invalidateQueries({ queryKey: ["platform-incidents"] });
      void qc.invalidateQueries({ queryKey: ["platform-badges"] });
    },
    onError: () => toast.error("تعذّر تحديث الحادثة"),
  });

  const nowIso = () => new Date().toISOString();

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{incident.title}</span>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
            {SEVERITY_AR[incident.severity] ?? incident.severity}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
            {STATUS_AR[incident.status] ?? incident.status}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{incident.affected_scope_ar}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        اكتُشفت في {formatDateTime(incident.detected_at)}
      </p>
      <p className={`mt-1 text-xs font-medium ${deadline.tone}`}>{deadline.text}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!incident.contained_at ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate({ status: "contained", containedAt: nowIso() })}
          >
            تسجيل الاحتواء
          </Button>
        ) : null}
        {!incident.authority_notified_at ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate({ authorityNotifiedAt: nowIso() })}
          >
            تسجيل إبلاغ الجهة
          </Button>
        ) : null}
        {!incident.subjects_notified_at ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate({ subjectsNotifiedAt: nowIso() })}
          >
            تسجيل إشعار المتأثرين
          </Button>
        ) : null}
      </div>

      {incident.status !== "closed" ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            value={lessons}
            placeholder="الدروس المستفادة (تُسجَّل عند الإغلاق)"
            onChange={(event) => setLessons(event.target.value)}
          />
          <Button
            type="button"
            className="min-h-11"
            disabled={lessons.trim().length < 10 || mutate.isPending}
            onClick={() => mutate.mutate({ status: "closed", lessonsAr: lessons.trim() })}
          >
            {mutate.isPending ? "جارٍ الحفظ…" : "إغلاق الحادثة"}
          </Button>
        </div>
      ) : incident.lessons_ar ? (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">{incident.lessons_ar}</p>
      ) : null}
    </li>
  );
}

function NewIncidentForm() {
  const qc = useQueryClient();
  const report = useServerFn(reportDataIncident);
  const [title, setTitle] = React.useState("");
  const [scope, setScope] = React.useState("");
  const [severity, setSeverity] = React.useState<"low" | "medium" | "high" | "critical">("high");

  const create = useMutation({
    mutationFn: () =>
      report({
        data: {
          title: title.trim(),
          severity,
          detectedAt: new Date().toISOString(),
          affectedScopeAr: scope.trim(),
          dataCategories: [],
          notificationRequired: severity === "high" || severity === "critical",
        },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل الحادثة");
      setTitle("");
      setScope("");
      void qc.invalidateQueries({ queryKey: ["platform-incidents"] });
      void qc.invalidateQueries({ queryKey: ["platform-badges"] });
    },
    onError: () => toast.error("تعذّر تسجيل الحادثة"),
  });

  const valid = title.trim().length >= 5 && scope.trim().length >= 5;

  return (
    <div className="space-y-3">
      <Input
        value={title}
        placeholder="عنوان الحادثة"
        className="min-h-11"
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        rows={2}
        value={scope}
        placeholder="النطاق المتأثر ووصف موجز"
        onChange={(event) => setScope(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {(["low", "medium", "high", "critical"] as const).map((level) => (
          <Button
            key={level}
            type="button"
            variant={severity === level ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setSeverity(level)}
          >
            {SEVERITY_AR[level]}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto"
        disabled={!valid || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "جارٍ التسجيل…" : "تسجيل الحادثة"}
      </Button>
    </div>
  );
}

function IncidentsPage() {
  const fetchIncidents = useServerFn(listDataIncidents);
  const incidents = useQuery({
    queryKey: ["platform-incidents"],
    queryFn: () => fetchIncidents(),
  });

  if (incidents.isPending) return <CardsSkeleton cards={2} />;
  if (incidents.isError) {
    return (
      <ErrorState
        description="تعذّر تحميل سجل الحوادث."
        onRetry={() => void incidents.refetch()}
      />
    );
  }

  const rows = incidents.data;
  const open = rows.filter((r) => OPEN_STATES.includes(r.status));
  const overdue = open.filter(
    (r) => !r.authority_notified_at && Date.now() > new Date(r.detected_at).getTime() + 72 * 3600 * 1000,
  );

  return (
    <div className="space-y-6">
      <PageHero
        title="حوادث البيانات"
        subtitle="تسجيل فوري، احتواء موثق، ومهلة إبلاغ الجهة المختصة خلال 72 ساعة من الاكتشاف."
        aside={
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/platform/breach-playbook">
              <BookLock className="size-4" aria-hidden="true" />
              خطة الحوادث
            </Link>
          </Button>
        }
      />

      <StatGrid>
        <StatCard icon={ShieldAlert} label="حوادث مفتوحة" value={formatCount(open.length)} tone="warning" />
        <StatCard icon={AlertTriangle} label="تجاوزت مهلة الإبلاغ" value={formatCount(overdue.length)} tone="warning" />
        <StatCard icon={Timer} label="إجمالي الحوادث" value={formatCount(rows.length)} />
      </StatGrid>

      <SectionCard icon={ShieldAlert} title="تسجيل حادثة جديدة">
        <NewIncidentForm />
      </SectionCard>

      <SectionCard icon={BookLock} title="سجل الحوادث" count={formatCount(rows.length)}>
        {rows.length === 0 ? (
          <SoftEmpty icon={ShieldAlert} message="لا توجد حوادث مسجّلة — وهذا هو الوضع المطلوب." />
        ) : (
          <ul className="space-y-3">
            {rows.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
