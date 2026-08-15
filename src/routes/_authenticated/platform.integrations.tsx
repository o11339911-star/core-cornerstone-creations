import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, PlugZap, PlayCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, PageHero, SectionCard, SoftEmpty, StatCard, StatGrid } from "@/components/rakeez";
import {
  listIntegrationRequests,
  listIntegrations,
  runIntegrationCall,
  setIntegrationStatus,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/_authenticated/platform/integrations")({
  component: PlatformIntegrationsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "التكاملات الرسمية | إدارة ركيز" },
      {
        name: "description",
        content:
          "سجل التكاملات الحكومية والخارجية في ركيز: الغرض والسند النظامي وحالة الاتفاقية وسجل النداءات — بيانات تجريبية بلا اتصال فعلي.",
      },
      { property: "og:title", content: "التكاملات الرسمية | إدارة ركيز" },
      {
        property: "og:description",
        content: "بنية جاهزة للربط الرسمي: محوّلات تجريبية موسومة، سجل نداءات، ومراقبة إخفاقات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_AR: Record<string, string> = {
  planned: "مخطَّط",
  mock: "تجريبي",
  sandbox: "بيئة اختبار",
  live: "مباشر",
};

const AGREEMENT_AR: Record<string, string> = {
  none: "لا توجد اتفاقية",
  requested: "طلب مقدَّم",
  under_review: "قيد المراجعة",
  signed: "موقّعة",
};

const REQ_STATUS_AR: Record<string, string> = {
  pending: "قيد التنفيذ",
  success: "ناجح",
  failed: "فاشل",
  retried: "أُعيدت المحاولة",
};

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>
  );
}

function statusTone(status: string) {
  if (status === "live") return "bg-success-soft text-success";
  if (status === "sandbox") return "bg-warning-soft text-warning";
  return "bg-secondary text-primary";
}

function PlatformIntegrationsPage() {
  const queryClient = useQueryClient();
  const fetchIntegrations = useServerFn(listIntegrations);
  const fetchRequests = useServerFn(listIntegrationRequests);
  const callFn = useServerFn(runIntegrationCall);
  const statusFn = useServerFn(setIntegrationStatus);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const integrations = useQuery({
    queryKey: ["integrations"],
    queryFn: () => fetchIntegrations(),
  });
  const requests = useQuery({
    queryKey: ["integration-requests"],
    queryFn: () => fetchRequests({ data: { limit: 30 } }),
  });

  const stats = useMemo(() => {
    const rows = integrations.data ?? [];
    const reqs = requests.data ?? [];
    return {
      total: rows.length,
      mock: rows.filter((r) => r.status === "mock").length,
      live: rows.filter((r) => r.status === "live").length,
      failed: reqs.filter((r) => r.status === "failed").length,
    };
  }, [integrations.data, requests.data]);

  const testCall = useMutation({
    mutationFn: async (vars: { code: string; operation: string; fail: boolean }) =>
      callFn({
        data: {
          code: vars.code,
          operation: vars.operation,
          idempotencyKey: `ui-${vars.code}-${Date.now()}`,
          payload: vars.fail ? { __simulate_failure: true } : { sample: "MOCK-INPUT" },
        },
      }),
    onSuccess: (res) => {
      if (res.status === "success") toast.success(res.safeMessageAr);
      else toast.error(res.safeMessageAr);
      void queryClient.invalidateQueries({ queryKey: ["integration-requests"] });
    },
    onError: () => toast.error("تعذّر تنفيذ النداء التجريبي، حاول مرة أخرى."),
    onSettled: () => setBusyCode(null),
  });

  const changeStatus = useMutation({
    mutationFn: async (vars: { code: string; status: "planned" | "mock" | "sandbox" | "live" }) =>
      statusFn({ data: vars }),
    onSuccess: () => {
      toast.success("تم تحديث حالة التكامل.");
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("LIVE")
          ? "لا يمكن التفعيل المباشر بلا اتفاقية موقّعة ومرجع اعتماد."
          : "تعذّر تحديث الحالة.",
      ),
  });

  if (integrations.isError) {
    return (
      <SectionCard icon={PlugZap} title="التكاملات الرسمية">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>تعذّر تحميل سجل التكاملات.</p>
          <Button onClick={() => void integrations.refetch()}>إعادة المحاولة</Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="التكاملات الرسمية والخارجية"
        badge="المرحلة ٢٥"
        subtitle="سجل معلن لكل جهة يمكن الربط معها مستقبلًا: الغرض، السند النظامي، الحقول المتبادلة، وأسماء متغيرات الأسرار فقط. كل النداءات هنا تجريبية موسومة ولا تتصل بأي جهة فعليًا."
      />

      <StatGrid>
        <StatCard label="جهات مسجّلة" value={stats.total} icon={PlugZap} />
        <StatCard label="بوضع تجريبي" value={stats.mock} icon={ShieldCheck} />
        <StatCard label="مفعّلة مباشرة" value={stats.live} icon={ShieldCheck} />
        <StatCard label="نداءات فاشلة" value={stats.failed} icon={AlertTriangle} />
      </StatGrid>

      <SectionCard icon={PlugZap} title="سجل الجهات" count="لا يُخزَّن أي مفتاح أو سر — أسماء المتغيرات فقط">
        {integrations.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : (integrations.data ?? []).length === 0 ? (
          <SoftEmpty
            icon={PlugZap}
            message="لا توجد جهات مسجّلة بعد — أضِف جهة لتوثيق الغرض والسند النظامي."
          />
        ) : (
          <ul className="space-y-3">
            {(integrations.data ?? []).map((row) => (
              <li key={row.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-primary">{row.provider_name_ar}</h3>
                      <Chip label={STATUS_AR[row.status] ?? row.status} tone={statusTone(row.status)} />
                      <Chip
                        label={AGREEMENT_AR[row.agreement_status] ?? row.agreement_status}
                        tone="bg-secondary text-muted-foreground"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{row.purpose}</p>
                    {row.legal_basis ? (
                      <p className="text-xs text-muted-foreground">السند النظامي: {row.legal_basis}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      متغيرات الأسرار المطلوبة:{" "}
                      <span dir="ltr" className="font-mono">
                        {row.secret_env_names.join(" · ") || "—"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testCall.isPending && busyCode === row.code}
                      onClick={() => {
                        setBusyCode(row.code);
                        testCall.mutate({ code: row.code, operation: defaultOperation(row.code), fail: false });
                      }}
                    >
                      <PlayCircle className="size-4" aria-hidden="true" />
                      {testCall.isPending && busyCode === row.code ? "جارٍ النداء…" : "نداء تجريبي"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        changeStatus.mutate({ code: row.code, status: row.status === "mock" ? "sandbox" : "mock" })
                      }
                    >
                      {row.status === "mock" ? "نقل لبيئة اختبار" : "إرجاع لوضع تجريبي"}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon={PlayCircle} title="سجل النداءات" count="الأخطاء منقّاة من أي معرّفات أو مفاتيح">
        {requests.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (requests.data ?? []).length === 0 ? (
          <SoftEmpty
            icon={PlayCircle}
            message="لا توجد نداءات مسجّلة — نفّذ نداءً تجريبيًا من قائمة الجهات أعلاه."
          />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">العملية</th>
                  <th className="px-3 py-2 font-medium">الحالة</th>
                  <th className="px-3 py-2 font-medium">المحاولات</th>
                  <th className="px-3 py-2 font-medium">رسالة آمنة</th>
                  <th className="px-3 py-2 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {(requests.data ?? []).map((req) => (
                  <tr key={req.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-primary">{req.operation}</td>
                    <td className="px-3 py-2">
                      <Chip
                        label={REQ_STATUS_AR[req.status] ?? req.status}
                        tone={
                          req.status === "success"
                            ? "bg-success-soft text-success"
                            : req.status === "failed"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-secondary text-primary"
                        }
                      />
                    </td>
                    <td className="px-3 py-2" dir="ltr">
                      {req.attempts}/{req.max_attempts}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{req.safe_error ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground" dir="ltr">
                      {new Date(req.created_at).toLocaleString("ar-SA-u-nu-latn")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function defaultOperation(code: string) {
  switch (code) {
    case "nafath":
      return "verify_identity";
    case "rega":
      return "check_license";
    case "real_estate_registry":
      return "lookup_deed";
    case "municipality":
      return "check_building_license";
    default:
      return "connection_status";
  }
}
