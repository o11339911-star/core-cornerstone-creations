import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, Plus, ReceiptText, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArchiveButton } from "@/components/archive/archive-button";
import { ErrorState, HeroBadge, PageHero, ResponsiveModal, SoftEmpty } from "@/components/rakeez";
import { useAccountUi } from "@/lib/account-ui";
import { formatDateTime } from "@/lib/format";
import {
  createCorrespondence,
  listCorrespondence,
  listMessagingChannels,
  setCorrespondenceArchived,
} from "@/lib/messaging.functions";

export const Route = createFileRoute("/_authenticated/correspondence")({
  component: CorrespondencePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "المراسلات | ركيز" },
      {
        name: "description",
        content:
          "سجل مراسلات الكيان: البريد والواتساب وطلبات عروض الأسعار وبقية المراسلات، مع ربطها بالمشاريع والطلبات وأرشفتها.",
      },
      { property: "og:title", content: "المراسلات | ركيز" },
      {
        property: "og:description",
        content: "المراسلات للبريد والرسائل وطلبات الأسعار، والاتصالات تبقى للمكالمات والاجتماعات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CHANNELS = [
  { value: "email", label: "بريد إلكتروني", icon: Mail },
  { value: "whatsapp", label: "واتساب", icon: MessageCircle },
  { value: "rfq", label: "طلب عرض سعر", icon: ReceiptText },
  { value: "other", label: "أخرى", icon: Mail },
] as const;

type ChannelValue = (typeof CHANNELS)[number]["value"];

const channelLabel = (v: string) => CHANNELS.find((c) => c.value === v)?.label ?? v;

function CorrespondencePage() {
  const qc = useQueryClient();
  const { activeEntity, loading } = useAccountUi();
  const entityId = activeEntity?.id ?? null;

  const fetchList = useServerFn(listCorrespondence);
  const fetchChannels = useServerFn(listMessagingChannels);
  const create = useServerFn(createCorrespondence);
  const setArchived = useServerFn(setCorrespondenceArchived);

  const [filter, setFilter] = React.useState<ChannelValue | null>(null);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    channel: "email" as ChannelValue,
    direction: "outgoing" as "incoming" | "outgoing",
    subject: "",
    body: "",
    counterpartyName: "",
    counterpartyAddress: "",
  });
  const [error, setError] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey: ["correspondence", entityId, filter],
    queryFn: () => fetchList({ data: { entityId, channel: filter, includeArchived: false } }),
    enabled: !loading,
  });

  const channels = useQuery({
    queryKey: ["messaging-channels", entityId],
    queryFn: () => fetchChannels({ data: { entityId: entityId as string } }),
    enabled: Boolean(entityId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          entityId,
          channel: form.channel,
          direction: form.direction,
          subject: form.subject.trim(),
          body: form.body,
          counterpartyName: form.counterpartyName.trim() || null,
          counterpartyAddress: form.counterpartyAddress.trim() || null,
          projectId: null,
          requestId: null,
        },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل المراسلة");
      setOpen(false);
      setForm((f) => ({ ...f, subject: "", body: "", counterpartyName: "", counterpartyAddress: "" }));
      void qc.invalidateQueries({ queryKey: ["correspondence"] });
    },
    onError: () => toast.error("تعذّر حفظ المراسلة"),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => setArchived({ data: { id, archived: true } }),
    onSuccess: () => {
      toast.success("تمت أرشفة المراسلة");
      void qc.invalidateQueries({ queryKey: ["correspondence"] });
    },
    onError: () => toast.error("تعذّرت الأرشفة"),
  });

  const connected = (channels.data ?? []).filter((c) => c.status === "connected");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title="المراسلات"
        subtitle="البريد والواتساب وطلبات عروض الأسعار — المكالمات والاجتماعات تبقى في صفحة الاتصالات."
        badge={<HeroBadge tone="neutral">{activeEntity?.name ?? "حساب شخصي"}</HeroBadge>}
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" className="min-h-11 gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> مراسلة جديدة
          </Button>
          {entityId ? (
            <Link
              to="/settings/messaging"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground"
            >
              <Settings2 className="size-4" aria-hidden="true" /> إعداد قنوات الربط
            </Link>
          ) : null}
        </div>
        {entityId ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {connected.length > 0
              ? `القنوات المتصلة: ${connected.map((c) => channelLabel(c.channel)).join("، ")}`
              : "لا توجد قناة مرتبطة بعد — تُسجَّل المراسلات يدويًا دون إرسال خارجي."}
          </p>
        ) : null}
      </PageHero>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
            filter === null ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"
          }`}
        >
          الكل
        </button>
        {CHANNELS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setFilter(c.value)}
            className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
              filter === c.value
                ? "border-primary bg-secondary text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section aria-live="polite" className="space-y-3">
        {list.isPending ? (
          <div className="space-y-3" role="status" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState description="تعذّر تحميل المراسلات" onRetry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          <SoftEmpty
            icon={Mail}
            message="لا توجد مراسلات بعد — سجّل أول مراسلة أو اربط قناة البريد أو الواتساب."
            action={
              <Button type="button" className="min-h-11" onClick={() => setOpen(true)}>
                مراسلة جديدة
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {list.data.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{row.subject}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {channelLabel(row.channel)}
                      {" · "}
                      {row.direction === "incoming" ? "واردة" : "صادرة"}
                      {row.counterparty_name ? ` · ${row.counterparty_name}` : ""}
                      {" · "}
                      <bdi dir="ltr">{formatDateTime(row.created_at)}</bdi>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ArchiveButton
                      compact
                      title={row.subject}
                      kind="message"
                      sourceTable="entity_correspondence"
                      sourceId={row.id}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => archiveMutation.mutate(row.id)}
                      disabled={archiveMutation.isPending}
                    >
                      إخفاء
                    </Button>
                  </div>
                </div>
                {row.body ? (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {row.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="مراسلة جديدة"
        description="تُسجَّل المراسلة في سجل الكيان. لا يتم أي إرسال خارجي ما لم تكن القناة مرتبطة فعليًا."
        footer={
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              if (form.subject.trim().length < 1) {
                setError("اكتب موضوع المراسلة");
                return;
              }
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-channel">القناة</Label>
            <select
              id="c-channel"
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as ChannelValue }))}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-direction">الاتجاه</Label>
            <select
              id="c-direction"
              value={form.direction}
              onChange={(e) =>
                setForm((f) => ({ ...f, direction: e.target.value as "incoming" | "outgoing" }))
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="outgoing">صادرة</option>
              <option value="incoming">واردة</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-subject">الموضوع</Label>
            <Input
              id="c-subject"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-name">الطرف الآخر (اختياري)</Label>
            <Input
              id="c-name"
              value={form.counterpartyName}
              onChange={(e) => setForm((f) => ({ ...f, counterpartyName: e.target.value }))}
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-address">البريد أو رقم الجوال (اختياري)</Label>
            <Input
              id="c-address"
              value={form.counterpartyAddress}
              onChange={(e) => setForm((f) => ({ ...f, counterpartyAddress: e.target.value }))}
              className="min-h-11"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-body">النص</Label>
            <Textarea
              id="c-body"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={5}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </ResponsiveModal>
    </div>
  );
}
