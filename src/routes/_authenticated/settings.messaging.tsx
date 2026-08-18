import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Mail, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, HeroBadge, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import { OfficialEmailCard } from "@/components/rakeez/official-email-card";
import { useAccountUi } from "@/lib/account-ui";
import {
  disconnectMailbox,
  getMailboxOverview,
  startMailboxConnect,
  syncMailbox,
} from "@/lib/mailbox.functions";

export const Route = createFileRoute("/_authenticated/settings/messaging")({
  component: MessagingSettingsPage,
  errorComponent: ErrorState,
  validateSearch: (search: Record<string, unknown>): { mail?: string } =>
    typeof search['mail'] === "string" ? { mail: search['mail'] as string } : {},
  head: () => ({
    meta: [
      { title: "البريد الرسمي وصندوق البريد | ركيز" },
      {
        name: "description",
        content:
          "اربط بريدك الرسمي الموثق وصندوق بريد Gmail أو Microsoft داخل ركيز، واقرأ رسائلك وأرسلها دون مغادرة المنصة.",
      },
      { property: "og:title", content: "البريد الرسمي وصندوق البريد | ركيز" },
      {
        property: "og:description",
        content: "ربط آمن بموافقتك، وتخزين محمي لبيانات الدخول على الخادم وحده.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PROVIDER_CARDS = [
  {
    key: "gmail" as const,
    title: "Gmail",
    hint: "بريد Google الشخصي أو بريد المؤسسة على Workspace.",
  },
  {
    key: "microsoft" as const,
    title: "Microsoft / Outlook",
    hint: "بريد Outlook.com أو بريد المؤسسة على Microsoft 365.",
  },
];

const CALLBACK_MESSAGE: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "تم ربط صندوق البريد بنجاح", ok: true },
  expired: { text: "انتهت مهلة الربط — أعد المحاولة", ok: false },
  unconfigured: { text: "خدمة الربط غير مُفعّلة بعد لدى مدير النظام", ok: false },
  failed: { text: "تعذّر إكمال الربط مع مزوّد البريد", ok: false },
};

function MessagingSettingsPage() {
  const qc = useQueryClient();
  const { activeEntity } = useAccountUi();
  const entityId = activeEntity?.id ?? null;
  const search = useSearch({ from: "/_authenticated/settings/messaging" });

  const fetchOverview = useServerFn(getMailboxOverview);
  const connect = useServerFn(startMailboxConnect);
  const sync = useServerFn(syncMailbox);
  const disconnect = useServerFn(disconnectMailbox);

  const overview = useQuery({
    queryKey: ["mailbox-overview", entityId],
    queryFn: () => fetchOverview({ data: { entityId } }),
  });

  const notified = React.useRef(false);
  React.useEffect(() => {
    if (notified.current || !search.mail) return;
    notified.current = true;
    const m = CALLBACK_MESSAGE[search.mail];
    if (m) (m.ok ? toast.success : toast.error)(m.text);
    if (m?.ok) void qc.invalidateQueries({ queryKey: ["mailbox-overview"] });
  }, [search.mail, qc]);

  const connectMutation = useMutation({
    mutationFn: (provider: "gmail" | "microsoft") =>
      connect({ data: { entityId, provider } }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: () => toast.error("تعذّر بدء الربط — تأكد من تفعيل الخدمة لدى مدير النظام"),
  });

  const syncMutation = useMutation({
    mutationFn: (connectionId: string) => sync({ data: { connectionId } }),
    onSuccess: (res) => {
      toast.success(`تم تحديث الصندوق: ${res.inbox} واردة و${res.sent} صادرة`);
      void qc.invalidateQueries({ queryKey: ["mailbox-overview"] });
    },
    onError: () => toast.error("تعذّر تحديث الصندوق — قد تحتاج إعادة الربط"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (connectionId: string) =>
      disconnect({ data: { connectionId, keepArchive: true } }),
    onSuccess: () => {
      toast.success("تم فصل صندوق البريد");
      void qc.invalidateQueries({ queryKey: ["mailbox-overview"] });
    },
    onError: () => toast.error("تعذّر فصل صندوق البريد"),
  });

  const connections = overview.data?.connections ?? [];
  const configuredOf = (p: string) =>
    Boolean(overview.data?.providers.find((x) => x.provider === p)?.configured);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title="البريد الرسمي وصندوق البريد"
        subtitle="وثّق بريدك الرسمي، واربط صندوق بريدك لقراءة الرسائل وإرسالها من داخل ركيز. الربط بموافقتك وحدك، ويمكنك فصله في أي وقت."
        badge={<HeroBadge tone="neutral">{activeEntity?.name ?? "حسابي"}</HeroBadge>}
      />

      <OfficialEmailCard entityId={entityId} />

      {overview.isPending ? (
        <div className="space-y-4" role="status" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : overview.isError ? (
        <ErrorState description="تعذّر تحميل صناديق البريد" onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <SectionCard icon={Inbox} title="صناديق البريد المربوطة">
            {connections.length === 0 ? (
              <SoftEmpty
                icon={Mail}
                message="لا يوجد صندوق بريد مربوط بعد — اختر مزوّدًا من الأسفل للربط."
              />
            ) : (
              <ul className="space-y-3">
                {connections.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium" dir="ltr">
                        {c.email_address}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <HeroBadge tone={c.status === "connected" ? "success" : "warning"}>
                          {c.status === "connected" ? "متصل" : "يحتاج إعادة ربط"}
                        </HeroBadge>
                        <span className="text-xs text-muted-foreground">
                          {c.provider === "gmail" ? "Gmail" : "Microsoft"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11"
                        disabled={syncMutation.isPending}
                        onClick={() => syncMutation.mutate(c.id)}
                      >
                        <RefreshCw className="size-4" />
                        تحديث
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11 text-destructive"
                        disabled={disconnectMutation.isPending}
                        onClick={() => disconnectMutation.mutate(c.id)}
                      >
                        <Unlink className="size-4" />
                        فصل
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={ShieldCheck} title="ربط صندوق بريد جديد">
            <div className="grid gap-3 sm:grid-cols-2">
              {PROVIDER_CARDS.map((p) => {
                const ready = configuredOf(p.key);
                return (
                  <div
                    key={p.key}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-border/60 p-4"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.hint}</p>
                    </div>
                    <Button
                      type="button"
                      className="min-h-11 w-full"
                      disabled={!ready || connectMutation.isPending}
                      onClick={() => connectMutation.mutate(p.key)}
                    >
                      {ready ? "ربط الآن" : "غير مُفعّل بعد"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              بريد آخر: يحتاج موصلًا متوافقًا يعمل عبر واجهات ويب آمنة. الربط المباشر بخوادم البريد
              التقليدية غير متاح في بيئة التشغيل الحالية، ولا نعرض خيارًا لا يعمل فعلًا.
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
