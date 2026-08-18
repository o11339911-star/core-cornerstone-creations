import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Building2,
  ClipboardList,
  FolderKanban,
  Inbox,
  PlugZap,
  ShieldAlert,
  ShieldCheck,
  TimerOff,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { getPlatformOverview } from "@/lib/platform-console.functions";
import { formatCount, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/")({
  component: PlatformOverviewPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "نظرة عامة | إدارة ركيز" },
      {
        name: "description",
        content: "مؤشرات المنصة الحية: المستخدمون والكيانات والمشاريع والطابور والخصوصية والتكاملات.",
      },
      { property: "og:title", content: "نظرة عامة | إدارة ركيز" },
      { property: "og:description", content: "مركز قيادة إدارة منصة ركيز." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PROJECT_STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  on_hold: "متوقف",
  completed: "مكتمل",
  cancelled: "ملغى",
  closed: "مغلق",
};

const ENTITY_TYPE_AR: Record<string, string> = {
  individual: "فرد",
  establishment: "مؤسسة",
  company: "شركة",
  office: "مكتب",
  government: "جهة حكومية",
  nonprofit: "جمعية",
};

const INTEGRATION_STATUS_AR: Record<string, string> = {
  mock: "محاكاة",
  sandbox: "تجريبي",
  live: "تشغيلي",
  disabled: "معطّل",
};

function PlatformOverviewPage() {
  const fetchOverview = useServerFn(getPlatformOverview);
  const overview = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => fetchOverview(),
  });

  if (overview.isPending) return <CardsSkeleton cards={4} />;
  if (overview.isError) {
    return (
      <ErrorState
        description="تعذّر تحميل مؤشرات المنصة."
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const data = overview.data;
  const growth = data.growth.map((point) => ({
    week: point.week.slice(5),
    المستخدمون: point.users,
    الكيانات: point.entities,
  }));
  const projects = data.projectsByStatus.map((row) => ({
    name: PROJECT_STATUS_AR[row.key] ?? row.key,
    عدد: row.count,
  }));

  return (
    <div className="space-y-6">
      <PageHero
        title="نظرة عامة"
        subtitle="حالة المنصة الآن: الجهات والمشاريع والعمل المعلق على فريق التشغيل."
        aside={
          <Button asChild className="min-h-11">
            <Link to="/platform/queue">
              <Inbox className="size-4" aria-hidden="true" />
              افتح الطابور
            </Link>
          </Button>
        }
      />

      <StatGrid>
        <StatCard icon={Users} label="المستخدمون" value={formatCount(data.usersTotal)} />
        <StatCard
          icon={Building2}
          label="الكيانات"
          value={formatCount(data.entitiesTotal)}
          hint={`موثقة ${formatCount(data.entitiesVerified)} — بانتظار التوثيق ${formatCount(data.entitiesPendingVerification)}`}
        />
        <StatCard icon={FolderKanban} label="مشاريع نشطة" value={formatCount(data.projectsActive)} />
        <StatCard icon={ClipboardList} label="طلبات مفتوحة" value={formatCount(data.requestsOpen)} />
        <StatCard
          icon={TimerOff}
          label="مدد متأخرة"
          value={formatCount(data.timersOverdue)}
          tone="warning"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={Inbox}
          title="طابور المراجعة"
          action={
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/platform/queue">فتح</Link>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Inbox} label="مفتوح" value={formatCount(data.queueOpen)} />
            <StatCard icon={Users} label="مُسند" value={formatCount(data.queueAssigned)} tone="info" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            مدد قاربت الاستحقاق: {formatCount(data.timersDueSoon)}
          </p>
        </SectionCard>

        <SectionCard
          icon={ShieldCheck}
          title="الخصوصية والحوادث"
          action={
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/platform/dsr">فتح</Link>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={ShieldCheck} label="طلبات خصوصية مفتوحة" value={formatCount(data.dsrOpen)} />
            <StatCard
              icon={ShieldAlert}
              label="حوادث مفتوحة"
              value={formatCount(data.incidentsOpen)}
              tone="warning"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {data.dsrNextDueAt
              ? `أقرب استحقاق خصوصية: ${formatDateTime(data.dsrNextDueAt)}`
              : "لا توجد استحقاقات خصوصية قريبة"}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.incidentsNotifyDueAt
              ? `أقرب مهلة إبلاغ حادثة: ${formatDateTime(data.incidentsNotifyDueAt)}`
              : "لا توجد مهلة إبلاغ قائمة"}
          </p>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Activity} title="نمو المستخدمين والكيانات">
          {growth.length === 0 ? (
            <SoftEmpty icon={Activity} message="لا توجد بيانات نمو كافية بعد." />
          ) : (
            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growth} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="المستخدمون"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="الكيانات"
                    stroke="hsl(var(--info))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={FolderKanban} title="المشاريع بحسب الحالة">
          {projects.length === 0 ? (
            <SoftEmpty icon={FolderKanban} message="لا توجد مشاريع مسجّلة بعد." />
          ) : (
            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projects} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Bar dataKey="عدد" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Building2} title="الكيانات بحسب النوع">
          {data.entitiesByType.length === 0 ? (
            <SoftEmpty icon={Building2} message="لا توجد كيانات مسجّلة." />
          ) : (
            <ul className="space-y-2">
              {data.entitiesByType.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="text-sm text-foreground">{ENTITY_TYPE_AR[row.key] ?? row.key}</span>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    {formatCount(row.count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={PlugZap}
          title="التكاملات بحسب الحالة"
          action={
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/platform/integrations">فتح</Link>
            </Button>
          }
        >
          {data.integrationsByStatus.length === 0 ? (
            <SoftEmpty icon={PlugZap} message="لا توجد تكاملات مسجّلة." />
          ) : (
            <ul className="space-y-2">
              {data.integrationsByStatus.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="text-sm text-foreground">
                    {INTEGRATION_STATUS_AR[row.key] ?? row.key}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    {formatCount(row.count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard icon={Activity} title="آخر النشاط" count={formatCount(data.activity.length)}>
        {data.activity.length === 0 ? (
          <SoftEmpty icon={Activity} message="لا يوجد نشاط مسجّل بعد." />
        ) : (
          <ul className="space-y-2">
            {data.activity.map((item) => (
              <li key={item.id} className="rounded-lg border border-border px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(item.at)}</span>
                </div>
                {item.detail ? (
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
