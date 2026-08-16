import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Inbox, KeyRound, ShuffleIcon, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import {
  autoAssignQueueItem,
  grantCaseAccess,
  listPlatformStaff,
  listQueueItems,
  reassignQueueItem,
  resolveQueueItem,
  type QueueItem,
} from "@/lib/platform-admin.functions";
import { AdminIdentitySearch } from "@/components/identity/identity-search";

export const Route = createFileRoute("/_authenticated/platform/queue")({
  component: PlatformQueuePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "طابور المراجعة | إدارة ركيز" },
      {
        name: "description",
        content:
          "طابور موحّد لمهام تشغيل منصة ركيز: توثيق الكيانات، مراجعة القوالب، البلاغات وتذاكر الدعم مع توزيع آلي متوازن.",
      },
      { property: "og:title", content: "طابور المراجعة | إدارة ركيز" },
      {
        property: "og:description",
        content: "توزيع آلي متوازن ووصول مؤقت محدود النطاق لفريق تشغيل المنصة.",
      },
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
  resolved: "مغلق",
  cancelled: "ملغى",
};

function statusChip(status: string) {
  const tone =
    status === "resolved"
      ? "bg-success-soft text-success"
      : status === "open"
        ? "bg-warning-soft text-warning"
        : "bg-secondary text-primary";
  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {STATUS_AR[status] ?? status}
    </span>
  );
}

function PlatformQueuePage() {
  const qc = useQueryClient();
  const [onlyMine, setOnlyMine] = useState(false);

  const fetchItems = useServerFn(listQueueItems);
  const fetchStaff = useServerFn(listPlatformStaff);
  const autoAssign = useServerFn(autoAssignQueueItem);
  const reassign = useServerFn(reassignQueueItem);
  const resolve = useServerFn(resolveQueueItem);
  const grantAccess = useServerFn(grantCaseAccess);

  const items = useQuery({
    queryKey: ["platform-queue", onlyMine],
    queryFn: () => fetchItems({ data: { mine: onlyMine } }),
  });
  const staff = useQuery({ queryKey: ["platform-staff"], queryFn: () => fetchStaff() });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["platform-queue"] });
    void qc.invalidateQueries({ queryKey: ["platform-staff"] });
  };

  const assignMut = useMutation({
    mutationFn: (itemId: string) => autoAssign({ data: { itemId } }),
    onSuccess: () => {
      toast.success("تم الإسناد تلقائيًا للأقل حملًا");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reassignMut = useMutation({
    mutationFn: (v: { itemId: string; toUser: string; reason: string }) =>
      reassign({ data: v }),
    onSuccess: () => {
      toast.success("تمت إعادة التوزيع وسُجّلت في سجل التدقيق");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: (v: { itemId: string; reason: string }) => resolve({ data: v }),
    onSuccess: () => {
      toast.success("أُغلق عنصر الطابور");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grantMut = useMutation({
    mutationFn: (v: { itemId: string; staffUserId: string; minutes: number; reason: string }) =>
      grantAccess({ data: v }),
    onSuccess: () => toast.success("مُنح وصول مؤقت للقراءة فقط، وينتهي تلقائيًا"),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = items.data ?? [];
  const open = rows.filter((r) => r.status === "open").length;
  const assigned = rows.filter((r) => r.status === "assigned" || r.status === "in_progress").length;
  const resolved = rows.filter((r) => r.status === "resolved").length;
  const availableStaff = (staff.data ?? []).filter((s) => s.availability === "available").length;

  return (
    <div className="space-y-6">
      <PageHero
        title="طابور المراجعة الموحّد"
        subtitle="توثيق الكيانات، مراجعة القوالب، البلاغات وتذاكر الدعم — من مصادرها مباشرة بلا نسخ بيانات."
        aside={
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => setOnlyMine((v) => !v)}
          >
            {onlyMine ? "عرض كل العناصر" : "عناصري فقط"}
          </Button>
        }
      />

      <StatGrid>
        <StatCard icon={Inbox} label="مفتوح" value={open} tone="warning" />
        <StatCard icon={UserCheck} label="قيد المعالجة" value={assigned} tone="primary" />
        <StatCard icon={CheckCircle2} label="مغلق" value={resolved} tone="success" />
        <StatCard icon={ShuffleIcon} label="موظفون متاحون" value={availableStaff} tone="info" />
        <StatCard icon={KeyRound} label="إجمالي العناصر" value={rows.length} tone="primary" />
      </StatGrid>

      <AdminIdentitySearch />

      <SectionCard icon={Inbox} title="العناصر" count={rows.length}>
        {items.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : items.isError ? (
          <ErrorState description={(items.error as Error).message} />
        ) : rows.length === 0 ? (
          <SoftEmpty icon={Inbox} message="لا عناصر في الطابور حاليًا — لا شيء ينتظر المراجعة." />
        ) : (
          <ul className="space-y-3">
            {rows.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                staff={staff.data ?? []}
                onAutoAssign={() => assignMut.mutate(item.id)}
                onReassign={(toUser, reason) =>
                  reassignMut.mutate({ itemId: item.id, toUser, reason })
                }
                onResolve={(reason) => resolveMut.mutate({ itemId: item.id, reason })}
                onGrant={(staffUserId, minutes, reason) =>
                  grantMut.mutate({ itemId: item.id, staffUserId, minutes, reason })
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function QueueRow({
  item,
  staff,
  onAutoAssign,
  onReassign,
  onResolve,
  onGrant,
}: {
  item: QueueItem;
  staff: { user_id: string; full_name: string | null; current_load: number; availability: string }[];
  onAutoAssign: () => void;
  onReassign: (toUser: string, reason: string) => void;
  onResolve: (reason: string) => void;
  onGrant: (staffUserId: string, minutes: number, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("60");

  const closed = item.status === "resolved" || item.status === "cancelled";

  return (
    <li className="rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {SOURCE_AR[item.source_type] ?? item.source_type}
            {item.assigned_to ? " · مُسند" : " · بلا مسؤول"}
            {` · أولوية ${item.priority}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusChip(item.status)}
          {!closed ? (
            <Button variant="outline" className="min-h-11" onClick={() => setOpen((v) => !v)}>
              إجراءات
            </Button>
          ) : null}
        </div>
      </div>

      {open && !closed ? (
        <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
          <Button className="min-h-11" onClick={onAutoAssign}>
            توزيع آلي للأقل حملًا
          </Button>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              aria-label="الموظف المستهدف"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">اختر موظفًا…</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name ?? s.user_id.slice(0, 8)} — حِمل {s.current_load} ({s.availability})
                </option>
              ))}
            </select>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب إعادة التوزيع / المنح"
              className="min-h-11"
            />
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={!target || reason.trim().length < 5}
              onClick={() => onReassign(target, reason.trim())}
            >
              إعادة توزيع
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              inputMode="numeric"
              placeholder="مدة الوصول بالدقائق"
              className="min-h-11"
              aria-label="مدة الوصول بالدقائق"
            />
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={!target || reason.trim().length < 5 || !item.project_id}
              onClick={() => onGrant(target, Number(minutes) || 60, reason.trim())}
            >
              منح وصول مؤقت (قراءة فقط)
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={reason.trim().length < 3}
              onClick={() => onResolve(reason.trim())}
            >
              إغلاق العنصر
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            الوصول المؤقت للقراءة فقط، مرتبط بهذا العنصر، وينتهي تلقائيًا عند انقضاء المدة.
          </p>
        </div>
      ) : null}
    </li>
  );
}
