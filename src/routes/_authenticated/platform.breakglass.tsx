import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

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
import { formatDateTime } from "@/lib/format";
import {
  approveBreakglass,
  denyBreakglass,
  listBreakglassRequests,
  requestBreakglass,
} from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/platform/breakglass")({
  component: BreakglassPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الوصول الطارئ | إدارة ركيز" },
      {
        name: "description",
        content:
          "طلبات الوصول الطارئ في ركيز: سبب إلزامي، موافقة شخص ثانٍ، تنبيه فوري، مدة قصيرة تنتهي تلقائيًا، وسجل تدقيق كامل.",
      },
      { property: "og:title", content: "الوصول الطارئ | إدارة ركيز" },
      {
        property: "og:description",
        content: "فصل واجبات صارم على الوصول الاستثنائي لملفات المشاريع.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_AR: Record<string, string> = {
  pending: "بانتظار موافقة شخص ثانٍ",
  approved: "معتمد",
  denied: "مرفوض",
  expired: "منتهٍ",
};

function BreakglassPage() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [reason, setReason] = useState("");

  const fetchRequests = useServerFn(listBreakglassRequests);
  const create = useServerFn(requestBreakglass);
  const approve = useServerFn(approveBreakglass);
  const deny = useServerFn(denyBreakglass);

  const list = useQuery({ queryKey: ["breakglass"], queryFn: () => fetchRequests() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["breakglass"] });

  const createMut = useMutation({
    mutationFn: () => create({ data: { projectId, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("سُجّل الطلب وينتظر موافقة شخص ثانٍ");
      setProjectId("");
      setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (requestId: string) => approve({ data: { requestId, minutes: 60 } }),
    onSuccess: () => {
      toast.success("اعتُمد الوصول الطارئ — أُرسل تنبيه فوري وسُجّل في التدقيق");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const denyMut = useMutation({
    mutationFn: (requestId: string) => deny({ data: { requestId, reason: "رُفض من المراجع" } }),
    onSuccess: () => {
      toast.success("رُفض الطلب");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        title="الوصول الطارئ (Break-glass)"
        subtitle="استثناء نادر: سبب مكتوب، موافقة شخص ثانٍ، ومدة قصيرة تنتهي تلقائيًا."
        aside={<RefreshAction onRefresh={() => void list.refetch()} busy={list.isFetching} />}
      />

      <StatGrid>
        <StatCard
          icon={ShieldAlert}
          label="بانتظار الموافقة"
          value={rows.filter((r) => r.status === "pending").length}
          tone="warning"
        />
        <StatCard
          icon={ShieldCheck}
          label="معتمد"
          value={rows.filter((r) => r.status === "approved").length}
          tone="success"
        />
        <StatCard
          icon={ShieldX}
          label="مرفوض"
          value={rows.filter((r) => r.status === "denied").length}
          tone="info"
        />
        <StatCard
          icon={ShieldAlert}
          label="منتهٍ"
          value={rows.filter((r) => r.status === "expired").length}
          tone="primary"
        />
        <StatCard icon={ShieldAlert} label="الإجمالي" value={rows.length} tone="primary" />
      </StatGrid>

      <SectionCard icon={ShieldAlert} title="طلب وصول طارئ جديد">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="معرّف المشروع (UUID)"
            className="min-h-11"
            aria-label="معرّف المشروع"
          />
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="السبب (10 أحرف فأكثر)"
            className="min-h-11"
            aria-label="سبب الوصول الطارئ"
          />
          <Button
            className="min-h-11"
            disabled={projectId.length < 10 || reason.trim().length < 10 || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            تقديم الطلب
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={ShieldCheck} title="الطلبات" count={rows.length}>
        {list.isPending ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState description={(list.error as Error).message} />
        ) : rows.length === 0 ? (
          <SoftEmpty icon={ShieldCheck} message="لا طلبات وصول طارئ — وهذا هو الوضع الطبيعي." />
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    مشروع {r.project_id.slice(0, 8)} · {STATUS_AR[r.status] ?? r.status}
                    {r.expires_at ? ` · ينتهي ${formatDateTime(r.expires_at)}` : ""}
                  </p>
                </div>
                {r.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button className="min-h-11" onClick={() => approveMut.mutate(r.id)}>
                      اعتماد
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => denyMut.mutate(r.id)}
                    >
                      رفض
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
