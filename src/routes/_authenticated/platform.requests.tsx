import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, ListChecks } from "lucide-react";


import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { listQueueItems, type QueueItem } from "@/lib/platform-admin.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/platform/requests")({
  component: PlatformRequestsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الطلبات | إدارة ركيز" },
      {
        name: "description",
        content: "طلبات وبلاغات وتذاكر منصة ركيز الواردة لفريق التشغيل مع الحالة والأولوية وتاريخ الورود.",
      },
      { property: "og:title", content: "الطلبات | إدارة ركيز" },
      { property: "og:description", content: "متابعة طلبات المنصة الواردة لفريق التشغيل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SOURCE_AR: Record<string, string> = {
  entity_verification: "توثيق كيان",
  template_review: "مراجعة قالب",
  report: "بلاغ",
  support_ticket: "تذكرة دعم",
  compliance: "مهمة تنظيمية",
};

const STATUS_AR: Record<string, string> = {
  open: "مفتوح",
  assigned: "مُسند",
  in_progress: "قيد المعالجة",
  resolved: "منجز",
  closed: "مغلق",
};

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "open", label: "مفتوح" },
  { key: "assigned", label: "مُسند" },
  { key: "resolved", label: "منجز" },
] as const;

/**
 * الطلب الأصلي هو المصدر: لا نعيد إنشاء سجل موازٍ، بل نفتح الصف الأصلي
 * بنفس `source_id` من جدوله (`requests` مثلًا)، ولا نكتفي بـ `entity_id`
 * إلا حين لا يوجد مسار للأصل نفسه. المنطق والاختبارات في `platform-queue-links`.
 */


function PlatformRequestsPage() {
  const fetchItems = useServerFn(listQueueItems);
  const [status, setStatus] = useState<(typeof FILTERS)[number]["key"]>("all");

  const query = useQuery({
    queryKey: ["platform-requests", status],
    queryFn: () => fetchItems({ data: status === "all" ? {} : { status } }),
  });

  const rows: QueueItem[] = query.data ?? [];
  const openCount = rows.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-6">
      <PageHero
        title="الطلبات"
        subtitle="الطلبات والبلاغات والتذاكر الواردة للمنصة — نفس مصدر طابور المراجعة دون نظام موازٍ."
      />

      <StatGrid>
        <StatCard icon={ListChecks} label="إجمالي المعروض" value={rows.length} />
        <StatCard icon={ListChecks} label="مفتوح" value={openCount} tone="warning" />
      </StatGrid>

      <SectionCard icon={ListChecks} title="قائمة الطلبات" count={rows.length}>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              variant={status === f.key ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setStatus(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {query.isPending ? (
          <CardsSkeleton cards={4} />
        ) : query.isError ? (
          <ErrorState
            description="تعذّر تحميل الطلبات الآن."
            onRetry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          <SoftEmpty icon={ListChecks} message="لا توجد طلبات مطابقة لهذا الفلتر." />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const source = sourceLink(r);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {SOURCE_AR[r.source_type] ?? r.source_type} ·{" "}
                      <span dir="ltr" className="inline-block">
                        {formatDateTime(r.created_at)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      رقم الطلب الأصلي:{" "}
                      <span dir="ltr" className="inline-block font-mono">
                        {r.source_id}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {source ? (
                      <Button asChild variant="outline" size="sm" className="min-h-11 gap-2">
                        <Link to={source.to} params={source.params}>
                          <ExternalLink className="size-4" aria-hidden="true" />
                          فتح الأصل
                        </Link>
                      </Button>
                    ) : null}
                    <Badge variant="secondary">{STATUS_AR[r.status] ?? r.status}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>

        )}
        <p className="mt-4 text-xs text-muted-foreground">
          الإجراءات التشغيلية (الإسناد، الإنجاز، الوصول المؤقت) تتم من «طابور المراجعة».
        </p>
      </SectionCard>
    </div>
  );
}
