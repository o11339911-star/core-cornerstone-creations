import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, HeroBadge, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import { useAccountUi } from "@/lib/account-ui";
import { listMessagingChannels, saveMessagingChannel } from "@/lib/messaging.functions";

export const Route = createFileRoute("/_authenticated/settings/messaging")({
  component: MessagingSettingsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "ربط البريد والواتساب | ركيز" },
      {
        name: "description",
        content:
          "إعداد قنوات المراسلة للكيان: مزوّد البريد أو الواتساب وعنوان الإرسال واسم متغير البيئة للمفتاح، دون تخزين أي سر.",
      },
      { property: "og:title", content: "ربط البريد والواتساب | ركيز" },
      {
        property: "og:description",
        content: "حالة اتصال واضحة لكل قناة، ولا يدّعي التطبيق اتصالًا غير حقيقي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CHANNELS = [
  { value: "email" as const, label: "البريد الإلكتروني", icon: Mail, hint: "مثال: RESEND_API_KEY" },
  {
    value: "whatsapp" as const,
    label: "واتساب",
    icon: MessageCircle,
    hint: "مثال: WHATSAPP_ACCESS_TOKEN",
  },
];

const STATUS_LABEL: Record<string, { text: string; tone: "success" | "warning" | "neutral" }> = {
  connected: { text: "متصل", tone: "success" },
  awaiting_credentials: { text: "بانتظار بيانات الاعتماد", tone: "warning" },
  not_configured: { text: "غير مُعد", tone: "neutral" },
};

function MessagingSettingsPage() {
  const qc = useQueryClient();
  const { activeEntity, loading } = useAccountUi();
  const entityId = activeEntity?.id ?? null;

  const fetchChannels = useServerFn(listMessagingChannels);
  const save = useServerFn(saveMessagingChannel);

  const channels = useQuery({
    queryKey: ["messaging-channels", entityId],
    queryFn: () => fetchChannels({ data: { entityId: entityId as string } }),
    enabled: Boolean(entityId),
  });

  const [drafts, setDrafts] = React.useState<
    Record<string, { provider: string; fromAddress: string; secretEnvName: string }>
  >({});

  const draftFor = (channel: string) => {
    const existing = (channels.data ?? []).find((c) => c.channel === channel);
    return (
      drafts[channel] ?? {
        provider: existing?.provider ?? "",
        fromAddress: existing?.from_address ?? "",
        secretEnvName: existing?.secret_env_name ?? "",
      }
    );
  };

  const mutation = useMutation({
    mutationFn: (channel: "email" | "whatsapp") => {
      const d = draftFor(channel);
      return save({
        data: {
          entityId: entityId as string,
          channel,
          provider: d.provider.trim() || null,
          fromAddress: d.fromAddress.trim() || null,
          secretEnvName: d.secretEnvName.trim() || null,
          note: null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(res.connected ? "تم الحفظ — القناة متصلة" : "تم الحفظ — بانتظار بيانات الاعتماد");
      void qc.invalidateQueries({ queryKey: ["messaging-channels"] });
    },
    onError: () => toast.error("تعذّر حفظ إعداد القناة"),
  });

  if (!loading && !entityId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <SoftEmpty
          icon={ShieldCheck}
          message="قنوات المراسلة تُربط بكيان تجاري — بدّل إلى كيان نشط أولًا."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title="ربط البريد والواتساب"
        subtitle="لا تُخزَّن أي مفاتيح في التطبيق — نحفظ اسم متغير البيئة فقط، وتُشتق حالة الاتصال خادميًا من وجود القيمة."
        badge={<HeroBadge tone="neutral">{activeEntity?.name ?? ""}</HeroBadge>}
      />

      {channels.isPending ? (
        <div className="space-y-4" role="status" aria-busy="true">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      ) : channels.isError ? (
        <ErrorState description="تعذّر تحميل قنوات المراسلة" onRetry={() => void channels.refetch()} />
      ) : (
        CHANNELS.map((c) => {
          const row = (channels.data ?? []).find((r) => r.channel === c.value);
          const status = STATUS_LABEL[row?.status ?? "not_configured"]!;
          const d = draftFor(c.value);
          return (
            <SectionCard
              key={c.value}
              icon={c.icon}
              title={c.label}
              action={<HeroBadge tone={status.tone}>{status.text}</HeroBadge>}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${c.value}-provider`}>المزوّد</Label>
                  <Input
                    id={`${c.value}-provider`}
                    value={d.provider}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [c.value]: { ...d, provider: e.target.value } }))
                    }
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${c.value}-from`}>
                    {c.value === "email" ? "عنوان الإرسال" : "رقم الإرسال"}
                  </Label>
                  <Input
                    id={`${c.value}-from`}
                    dir="ltr"
                    value={d.fromAddress}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [c.value]: { ...d, fromAddress: e.target.value },
                      }))
                    }
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`${c.value}-secret`}>اسم متغير البيئة للمفتاح</Label>
                  <Input
                    id={`${c.value}-secret`}
                    dir="ltr"
                    placeholder={c.hint}
                    value={d.secretEnvName}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [c.value]: { ...d, secretEnvName: e.target.value.toUpperCase() },
                      }))
                    }
                    className="min-h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    أضف قيمة المفتاح في إعدادات المشروع ← الأسرار. لا تكتب القيمة هنا أبدًا.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(c.value)}
                >
                  {mutation.isPending ? "جارٍ الحفظ…" : "حفظ الإعداد"}
                </Button>
              </div>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
