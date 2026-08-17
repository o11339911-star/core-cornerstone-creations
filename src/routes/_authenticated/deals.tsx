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
import { isValidSaudiId } from "@/lib/identity-format";
import { lookupDealCounterpartyFn } from "@/lib/deal-lookup.functions";
import {
  createDeal,
  DEAL_CONTEXTS,
  DEAL_STATUSES,
  listDeals,
  PARTY_KINDS,
  respondToDeal,
  setDealArchived,
  updateDealStatus,
} from "@/lib/deals.functions";

export const Route = createFileRoute("/_authenticated/deals")({
  component: DealsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "التعاقد | ركيز" },
      {
        name: "description",
        content:
          "تابع معاملات التعاقد للحساب النشط: الطرف الآخر والسياق والحالة والمبلغ، مع إمكانية الأرشفة.",
      },
      { property: "og:title", content: "التعاقد | ركيز" },
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
  s === "signed"
    ? "success"
    : s === "cancelled"
      ? "danger"
      : s === "agreed"
        ? "warning"
        : "neutral";

function DealsPage() {
  const qc = useQueryClient();
  const { activeEntity, loading } = useAccountUi();
  const entityId = activeEntity?.id ?? null;

  const fetchDeals = useServerFn(listDeals);
  const create = useServerFn(createDeal);
  const setStatus = useServerFn(updateDealStatus);
  const archive = useServerFn(setDealArchived);
  const respond = useServerFn(respondToDeal);

  const [scope, setScope] = React.useState<"mine" | "incoming">("mine");
  const [filter, setFilter] = React.useState<(typeof DEAL_STATUSES)[number] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    title: "",
    partyKind: "person" as (typeof PARTY_KINDS)[number],
    identifier: "",
    counterpartyName: "",
    /** هل الاسم الحالي مستخرج تلقائيًا من ركيز؟ */
    autoName: false,
    contextType: "other" as (typeof DEAL_CONTEXTS)[number],
    amount: "",
    notes: "",
  });

  const resetForm = () =>
    setForm({
      title: "",
      partyKind: "person",
      identifier: "",
      counterpartyName: "",
      autoName: false,
      contextType: "other",
      amount: "",
      notes: "",
    });

  // ——— بحث تلقائي عن الطرف الثاني بعد اكتمال رقم صحيح ———
  const lookupParty = useServerFn(lookupDealCounterpartyFn);
  const [lookup, setLookup] = React.useState<{
    state: "idle" | "checking" | "registered" | "unregistered" | "failed";
    name?: string | null;
  }>({ state: "idle" });
  const [retryToken, setRetryToken] = React.useState(0);

  const digits = form.identifier.replace(/[^0-9]/g, "");
  const identifierValid =
    form.partyKind === "person" ? isValidSaudiId(digits) : /^[0-9]{10}$/.test(digits);

  React.useEffect(() => {
    // أي تغيير في الرقم يمسح نتيجة المطابقة السابقة والاسم المستخرج فورًا.
    setLookup({ state: "idle" });
    setForm((f) => (f.autoName ? { ...f, counterpartyName: "", autoName: false } : f));
    if (!identifierValid) return;

    let cancelled = false;
    setLookup({ state: "checking" });
    const timer = window.setTimeout(() => {
      void lookupParty({ data: { partyKind: form.partyKind, identifier: digits } })
        .then((res: Awaited<ReturnType<typeof lookupParty>>) => {
          if (cancelled) return;
          if (res.status === "registered") {
            setLookup({ state: "registered", name: res.displayName });
            // الاسم النظامي المسموح عرضه فقط؛ الربط يُعاد التحقق منه خادميًا.
            if (res.displayName) {
              setForm((f) => ({ ...f, counterpartyName: res.displayName!, autoName: true }));
            }
          } else if (res.status === "unregistered") {
            setLookup({ state: "unregistered" });
          } else {
            // invalid / throttled: تعذّر التحقق — لا يمنع الإنشاء.
            setLookup({ state: "failed" });
          }
        })
        .catch(() => {
          if (!cancelled) setLookup({ state: "failed" });
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [digits, form.partyKind, identifierValid, lookupParty, retryToken]);

  const list = useQuery({
    queryKey: ["deals", entityId, filter, scope],
    queryFn: () =>
      fetchDeals({ data: { entityId, status: filter, includeArchived: false, scope } }),
    enabled: !loading,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          entityId,
          title: form.title.trim(),
          partyKind: form.partyKind,
          nationalId: form.partyKind === "person" ? form.identifier.trim() : null,
          crNumber: form.partyKind === "entity" ? form.identifier.trim() : null,
          counterpartyName: form.counterpartyName.trim() || null,
          contextType: form.contextType,
          contextId: null,
          amount: form.amount.trim() ? Number(form.amount) : null,
          currency: "SAR",
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res.matched
          ? "تم إنشاء المعاملة وربطها بحساب الطرف الثاني — بانتظار قبوله"
          : "تم إنشاء المعاملة — الطرف الثاني غير مسجل في ركيز وسيُربط تلقائيًا عند انضمامه",
      );
      setOpen(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        SECOND_PARTY_ID_INVALID: "رقم الهوية غير صحيح — تحقق من الأرقام العشرة",
        SECOND_PARTY_CR_INVALID: "رقم السجل التجاري يجب أن يكون عشرة أرقام",
        SECOND_PARTY_IS_SELF: "لا يمكن أن يكون الطرف الثاني هو نفسه الطرف الأول",
        NOT_ENTITY_MEMBER: "لست عضوًا فعّالًا في هذا الحساب",
      };
      const message = map[e.message] ?? "تعذّر إنشاء المعاملة";
      setError(message);
      toast.error(message);
    },
  });

  const respondMutation = useMutation({
    mutationFn: (v: { dealId: string; accept: boolean }) => respond({ data: v }),
    onSuccess: (res) => {
      toast.success(res.status === "accepted" ? "تم قبول المعاملة" : "تم رفض المعاملة");
      void qc.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: () => toast.error("تعذّر تسجيل ردّك على المعاملة"),
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: (typeof DEAL_STATUSES)[number] }) =>
      setStatus({ data: { dealId: v.id, status: v.status } }),
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      void qc.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "SECOND_PARTY_NOT_ACCEPTED"
          ? "لا يمكن الانتقال إلى اتفاق أو توقيع قبل قبول الطرف الثاني"
          : "تعذّر تحديث الحالة",
      ),
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
        title="التعاقد"
        subtitle="كل معاملة تعاقد مع سياقها وحالتها — لا يمنح التعاقد أي وصول لبيانات المشروع."
        badge={<HeroBadge tone="neutral">{activeEntity?.name ?? "حساب شخصي"}</HeroBadge>}
      >
        <div className="mt-4">
          <Button type="button" className="min-h-11 gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> معاملة جديدة
          </Button>
        </div>
      </PageHero>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="نطاق المعاملات">
        {(["mine", "incoming"] as const).map((sc) => (
          <button
            key={sc}
            type="button"
            role="tab"
            aria-selected={scope === sc}
            onClick={() => setScope(sc)}
            className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${
              scope === sc
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {sc === "mine" ? "معاملاتي" : "واردة إليّ"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
            filter === null
              ? "border-primary bg-secondary text-primary"
              : "border-border text-muted-foreground"
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
              filter === s
                ? "border-primary bg-secondary text-primary"
                : "border-border text-muted-foreground"
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
        <ErrorState description="تعذّر تحميل التعاقد" onRetry={() => void list.refetch()} />
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
                  {(() => {
                    const second = deal.parties.find((p) => p.party_role === "second");
                    if (!second) return null;
                    return (
                      <p className="mt-1 text-xs text-muted-foreground">
                        الطرف الثاني: {second.display_name ?? "بدون اسم"}
                        {second.identifier_kind === "national_id" && second.identifier_last4 ? (
                          <>
                            {" · هوية تنتهي بـ "}
                            <bdi dir="ltr">{second.identifier_last4}</bdi>
                          </>
                        ) : null}
                        {second.identifier_kind === "cr_number" && second.cr_number ? (
                          <>
                            {" · سجل تجاري "}
                            <bdi dir="ltr">{second.cr_number}</bdi>
                          </>
                        ) : null}
                        {second.is_registered ? " · مسجّل في ركيز" : " · غير مسجّل بعد"}
                      </p>
                    );
                  })()}
                  {deal.amount !== null && deal.amount !== undefined ? (
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      <bdi dir="ltr">{formatMoney(Number(deal.amount), deal.currency)}</bdi>
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                  <HeroBadge tone={statusTone(deal.status)}>
                    {STATUS_AR[deal.status] ?? deal.status}
                  </HeroBadge>
                  <HeroBadge
                    tone={
                      deal.second_party_status === "accepted"
                        ? "success"
                        : deal.second_party_status === "declined"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {deal.second_party_status === "accepted"
                      ? "الطرف الثاني قَبِل"
                      : deal.second_party_status === "declined"
                        ? "الطرف الثاني رفض"
                        : "بانتظار الطرف الثاني"}
                  </HeroBadge>
                  {deal.can_respond ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11"
                        disabled={respondMutation.isPending}
                        onClick={() => respondMutation.mutate({ dealId: deal.id, accept: true })}
                      >
                        قبول
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={respondMutation.isPending}
                        onClick={() => respondMutation.mutate({ dealId: deal.id, accept: false })}
                      >
                        رفض
                      </Button>
                    </>
                  ) : null}
                  {deal.is_owner ? (
                    <>
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
                        className="min-h-11 max-w-full rounded-md border border-input bg-background px-3 text-sm"
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
                    </>
                  ) : null}
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
              if (!identifierValid) {
                setError(
                  form.partyKind === "person"
                    ? "رقم هوية الطرف الثاني يجب أن يكون عشرة أرقام"
                    : "رقم السجل التجاري يجب أن يكون عشرة أرقام",
                );
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
          <fieldset className="space-y-3 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-foreground">
              الطرف الثاني — المعرّف إلزامي
            </legend>
            <div className="flex gap-2">
              {PARTY_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={form.partyKind === kind}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      partyKind: kind,
                      identifier: "",
                      counterpartyName: f.autoName ? "" : f.counterpartyName,
                      autoName: false,
                    }))
                  }
                  className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium ${
                    form.partyKind === kind
                      ? "border-primary bg-secondary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {kind === "person" ? "شخص — رقم هوية" : "منشأة — سجل تجاري"}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-identifier">
                {form.partyKind === "person" ? "رقم هوية الطرف الثاني" : "رقم السجل التجاري"}
              </Label>
              <Input
                id="d-identifier"
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
                value={form.identifier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, identifier: e.target.value.replace(/[^0-9]/g, "") }))
                }
                className="min-h-11"
              />
              <p className="text-xs text-muted-foreground">
                يُطابَق الرقم داخليًا فقط؛ إن كان الطرف مسجلًا في ركيز يُربط بحسابه مباشرة، وإلا
                تبقى المعاملة بانتظار انضمامه.
              </p>
              <p aria-live="polite" className="text-xs font-medium">
                {lookup.state === "checking" ? (
                  <span className="text-muted-foreground">جارٍ التحقق…</span>
                ) : lookup.state === "registered" ? (
                  <span className="text-primary">طرف مسجل في ركيز — سيرسل له طلب قبول</span>
                ) : lookup.state === "unregistered" ? (
                  <span className="text-muted-foreground">
                    لم يُعثر على طرف مسجل في ركيز؛ يمكنك إدخال الاسم اختياريًا.
                  </span>
                ) : lookup.state === "failed" ? (
                  <span className="text-destructive">
                    تعذّر التحقق الآن — يمكنك المتابعة أو{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setRetryToken((n) => n + 1)}
                    >
                      إعادة المحاولة
                    </button>
                  </span>
                ) : null}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-party">اسم الطرف الثاني (اختياري)</Label>
              <Input
                id="d-party"
                value={form.counterpartyName}
                readOnly={form.autoName}
                aria-readonly={form.autoName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, counterpartyName: e.target.value, autoName: false }))
                }
                className="min-h-11"
              />
              <p className="text-xs text-muted-foreground">
                {form.autoName
                  ? "الاسم مستخرج تلقائيًا من ركيز."
                  : "المعرّف وحده إلزامي؛ يمكن ترك الاسم فارغًا."}
              </p>
            </div>
          </fieldset>
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
