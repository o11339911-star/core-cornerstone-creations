import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Handshake, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArchiveButton } from "@/components/archive/archive-button";
import { ErrorState, HeroBadge, PageHero, ResponsiveModal, SoftEmpty } from "@/components/rakeez";
import { useAccountUi } from "@/lib/account-ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  createDeal,
  DEAL_CONTEXTS,
  DEAL_STATUSES,
  listDeals,
  setDealArchived,
  updateDealStatus,
} from "@/lib/deals.functions";

export const Route = createFileRoute("/_authenticated/deals")({
  component: DealsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "صندوق التعاقد | ركيز" },
      {
        name: "description",
        content:
          "تابع معاملات التعاقد للحساب النشط: الطرف الآخر والسياق والحالة والمبلغ، مع إمكانية الأرشفة.",
      },
      { property: "og:title", content: "صندوق التعاقد | ركيز" },
      {
        property: "og:description",
        content: "معاملة تعاقد واحدة مربوطة بمشروع أو طلب أو تكليف أو إعلان.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  negotiating: "تفاوض",
  agreed: "اتفاق مبدئي",
  signed: "موقّع",
  cancelled: "ملغاة",
};

const CONTEXT_AR: Record<string, string> = {
  project: "مشروع",
  request: "طلب",
  assignment: "تكليف",
  listing: "إعلان",
  other: "أخرى",
};

const statusTone = (s: string): "success" | "warning" | "danger" | "neutral" =>
  s === "signed" ? "success" : s === "cancelled" ? "danger" : s === "agreed" ? "warning" : "neutral";

function DealsPage() {
  const qc = useQueryClient();
  const { activeEntity, loading } = useAccountUi();
  const entityId = activeEntity?.id ?? null;

  const fetchDeals = useServerFn(listDeals);
  const create = useServerFn(createDeal);
  const setStatus = useServerFn(updateDealStatus);
  const archive = useServerFn(setDealArchived);

  const [filter, setFilter] = React.useState<(typeof DEAL_STATUSES)[number] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    title: "",
    counterpartyName: "",
    contextType: "other" as (typeof DEAL_CONTEXTS)[number],
    amount: "",
    notes: "",
  });

  const list = useQuery({
    queryKey: ["deals", entityId, filter],
    queryFn: () => fetchDeals({ data: { entityId, status: filter, includeArchived: false } }),
    enabled: !loading,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          entityId,
          title: form.title.trim(),
          counterpartyName: form.counterpartyName.trim() || null,
          contextType: form.contextType,
          contextId: null,
          amount: form.amount.trim() ? Number(form.amount) : null,
          currency: "SAR",
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم إنشاء المعاملة");
      setOpen(false);
      setForm({ title: "", counterpartyName: "", contextType: "other", amount: "", notes: "" });
      void qc.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: () => toast.error("تعذّر إنشاء المعاملة"),
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: (typeof DEAL_STATUSES)[number] }) =>
      setStatus({ data: { dealId: v.id, status: v.status } }),
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      void qc.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: () => toast.error("تعذّر تحديث الحالة"),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { dealId: id, archived: true } }),
    onSuccess: () => {
      toast.success("تمت أرشفة المعاملة");
      void qc.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: () => toast.error("تعذّرت الأرشفة"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title="صندوق التعاقد"
        subtitle="كل معاملة تعاقد مع سياقها وحالتها — لا يمنح التعاقد أي وصول لبيانات المشروع."
        badge={<HeroBadge tone="neutral">{activeEntity?.name ?? "حساب شخصي"}</HeroBadge>}
      >
        <div className="mt-4">
          <Button type="button" className="min-h-11 gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> معاملة جديدة
          </Button>
        </div>
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
        {DEAL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
              filter === s ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {STATUS_AR[s]}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <div className="space-y-3" role="status" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState description="تعذّر تحميل صندوق التعاقد" onRetry={() => void list.refetch()} />
      ) : !list.data?.length ? (
        <SoftEmpty
          icon={Handshake}
          message="لا توجد معاملات تعاقد بعد — أنشئ أول معاملة واربطها بمشروع أو طلب."
          action={
            <Button type="button" className="min-h-11" onClick={() => setOpen(true)}>
              معاملة جديدة
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.data.map((deal) => (
            <li key={deal.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{deal.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {CONTEXT_AR[deal.context_type] ?? deal.context_type}
                    {deal.counterparty_name ? ` · ${deal.counterparty_name}` : ""}
                    {" · "}
                    <bdi dir="ltr">{formatDateTime(deal.created_at)}</bdi>
                  </p>
                  {deal.amount !== null && deal.amount !== undefined ? (
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      <bdi dir="ltr">{formatMoney(Number(deal.amount), deal.currency)}</bdi>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <HeroBadge tone={statusTone(deal.status)}>
                    {STATUS_AR[deal.status] ?? deal.status}
                  </HeroBadge>
                  <label className="sr-only" htmlFor={`status-${deal.id}`}>
                    تغيير حالة {deal.title}
                  </label>
                  <select
                    id={`status-${deal.id}`}
                    value={deal.status}
                    onChange={(e) =>
                      statusMutation.mutate({
                        id: deal.id,
                        status: e.target.value as (typeof DEAL_STATUSES)[number],
                      })
                    }
                    className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {DEAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_AR[s]}
                      </option>
                    ))}
                  </select>
                  <ArchiveButton
                    compact
                    title={deal.title}
                    kind="deal"
                    sourceTable="contracting_deals"
                    sourceId={deal.id}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => archiveMutation.mutate(deal.id)}
                    disabled={archiveMutation.isPending}
                  >
                    إخفاء
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="معاملة تعاقد جديدة"
        footer={
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={createMutation.isPending}
            onClick={() => {
              setError(null);
              if (form.title.trim().length < 2) {
                setError("اكتب عنوانًا واضحًا للمعاملة");
                return;
              }
              if (form.amount.trim() && Number.isNaN(Number(form.amount))) {
                setError("المبلغ يجب أن يكون رقمًا");
                return;
              }
              createMutation.mutate();
            }}
          >
            {createMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="d-title">عنوان المعاملة</Label>
            <Input
              id="d-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-party">الطرف الآخر (اختياري)</Label>
            <Input
              id="d-party"
              value={form.counterpartyName}
              onChange={(e) => setForm((f) => ({ ...f, counterpartyName: e.target.value }))}
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-context">السياق</Label>
            <select
              id="d-context"
              value={form.contextType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  contextType: e.target.value as (typeof DEAL_CONTEXTS)[number],
                }))
              }
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {DEAL_CONTEXTS.map((c) => (
                <option key={c} value={c}>
                  {CONTEXT_AR[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-amount">المبلغ بالريال (اختياري)</Label>
            <Input
              id="d-amount"
              dir="ltr"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-notes">ملاحظات</Label>
            <Textarea
              id="d-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
