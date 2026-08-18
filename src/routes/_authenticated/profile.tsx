import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Building2,
  IdCard,
  Copy,
  MapPin,
  Loader2,
  PlusCircle,
  Repeat,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { CardsSkeleton, ErrorState, PageHero, SectionCard, TextField } from "@/components/rakeez";
import { Button } from "@/components/ui/button";
import { entityTypeLabel } from "@/components/app-shell";
import { useT } from "@/i18n";
import { useAccountUi } from "@/lib/account-ui";
import { getMyProfile } from "@/lib/auth.functions";
import { getMyAddress, setMyAddress } from "@/lib/person-address.functions";
import { toLatinDigits } from "@/lib/format";
import { getMyIdentityStatus, isValidSaudiId, linkPersonalIdentity } from "@/lib/identity.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الملف الشخصي | ركيز" },
      {
        name: "description",
        content: "بياناتك الشخصية وحسابك النشط ودورك داخل الكيان في منصة ركيز.",
      },
      { property: "og:title", content: "الملف الشخصي | ركيز" },
      {
        property: "og:description",
        content: "اطّلع على بياناتك وحسابك النشط ودورك، وبدّل الحساب أو اضبط الأمان والإشعارات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-foreground sm:text-end">
        {value}
      </dd>
    </div>
  );
}

function ProfilePage() {
  const t = useT();
  const account = useAccountUi();

  const profileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getMyProfile(),
  });

  const emailQuery = useQuery({
    queryKey: ["my-auth-email"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.email ?? null,
    staleTime: 5 * 60_000,
  });

  const roleLabel = (role: string) => {
    const key = `team.roles.${role}`;
    const value = t(key);
    return value === key ? role : value;
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero title={t("profile.title")} subtitle={t("profile.subtitle")} />

      {profileQuery.isPending || account.loading ? (
        <CardsSkeleton cards={2} />
      ) : profileQuery.isError ? (
        <ErrorState description={t("profile.loadError")} />
      ) : (
        <SectionCard title={t("profile.title")} icon={User}>
          <dl className="divide-y-0">
            <Row
              label={t("profile.fullName")}
              value={profileQuery.data?.full_name || t("profile.noName")}
            />
            <Row label={t("profile.email")} value={emailQuery.data ?? "—"} />
            <Row
              label={t("profile.phone")}
              value={profileQuery.data?.phone || t("profile.noPhone")}
            />
            <Row
              label={t("profile.activeAccount")}
              value={account.activeEntity?.name ?? t("profile.personalAccount")}
            />
            {account.activeEntity ? (
              <>
                <Row
                  label={t("profile.entityType")}
                  value={entityTypeLabel(t, account.activeEntity.type)}
                />
                <Row
                  label={t("profile.role")}
                  value={roleLabel(account.activeMembership?.role ?? "")}
                />
              </>
            ) : (
              <Row label={t("profile.role")} value={t("profile.personalAccountHint")} />
            )}
          </dl>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {account.activeEntity ? (
              <Link
                to="/entities/$entityId"
                params={{ entityId: account.activeEntity.id }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
              >
                <Building2 className="size-4" aria-hidden="true" />
                {t("entities.detail.manage")}
              </Link>
            ) : null}
            <Link
              to="/entities/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <PlusCircle className="size-4" aria-hidden="true" />
              {t("entities.new.cta")}
            </Link>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Link
              to="/select-account"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              <Repeat className="size-4" aria-hidden="true" />
              {t("shell.switchAccount")}
            </Link>
            <Link
              to="/settings/security"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t("common.security")}
            </Link>
            <Link
              to="/settings/notifications"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              <Bell className="size-4" aria-hidden="true" />
              {t("shell.notifications")}
            </Link>
          </div>
        </SectionCard>
      )}

      <IdentityCard />
      <PersonAddressCard />
    </div>
  );
}

/** العنوان الوطني للفرد: تعديل وحفظ حقيقي ثم عرض القيم المحفوظة من القاعدة. */
function PersonAddressCard() {
  const queryClient = useQueryClient();
  const fetchAddress = useServerFn(getMyAddress);
  const saveAddress = useServerFn(setMyAddress);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    buildingNo: "",
    street: "",
    district: "",
    city: "",
    postalCode: "",
    additionalNo: "",
    unitNo: "",
  });

  const query = useQuery({ queryKey: ["my-address"], queryFn: () => fetchAddress() });

  const mutation = useMutation({
    mutationFn: () => saveAddress({ data: form }),
    onSuccess: (row) => {
      toast.success("تم حفظ العنوان الوطني");
      setEditing(false);
      queryClient.setQueryData(["my-address"], row);
      void queryClient.invalidateQueries({ queryKey: ["my-address"] });
    },
    onError: () => toast.error("تعذّر حفظ العنوان الوطني، حاول مرة أخرى"),
  });

  const openEdit = () => {
    const d = query.data;
    setForm({
      buildingNo: d?.building_no ?? "",
      street: d?.street ?? "",
      district: d?.district ?? "",
      city: d?.city ?? "",
      postalCode: d?.postal_code ?? "",
      additionalNo: d?.additional_no ?? "",
      unitNo: d?.unit_no ?? "",
    });
    setEditing(true);
  };

  const digits = (v: string, max: number) =>
    toLatinDigits(v).replace(/[^0-9]/g, "").slice(0, max);

  const d = query.data;
  const dash = "—";

  return (
    <SectionCard title="العنوان الوطني" icon={MapPin}>
      {query.isPending ? (
        <CardsSkeleton cards={1} />
      ) : query.isError ? (
        <ErrorState
          description="تعذّر تحميل العنوان الوطني"
          onRetry={() => void query.refetch()}
        />
      ) : editing ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="addr-building"
              label="رقم المبنى"
              value={form.buildingNo}
              onChange={(e) => setForm((f) => ({ ...f, buildingNo: digits(e.target.value, 4) }))}
            />
            <TextField
              id="addr-street"
              label="الشارع"
              value={form.street}
              onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
            />
            <TextField
              id="addr-district"
              label="الحي"
              value={form.district}
              onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
            />
            <TextField
              id="addr-city"
              label="المدينة"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <TextField
              id="addr-postal"
              label="الرمز البريدي"
              value={form.postalCode}
              onChange={(e) => setForm((f) => ({ ...f, postalCode: digits(e.target.value, 5) }))}
            />
            <TextField
              id="addr-additional"
              label="الرقم الإضافي"
              value={form.additionalNo}
              onChange={(e) => setForm((f) => ({ ...f, additionalNo: digits(e.target.value, 4) }))}
            />
            <TextField
              id="addr-unit"
              label="رقم الوحدة"
              value={form.unitNo}
              onChange={(e) => setForm((f) => ({ ...f, unitNo: e.target.value.slice(0, 10) }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              حفظ العنوان
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={mutation.isPending}
              onClick={() => setEditing(false)}
            >
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <dl>
            <Row label="رقم المبنى" value={d?.building_no ? toLatinDigits(d.building_no) : dash} />
            <Row label="الشارع" value={d?.street || dash} />
            <Row label="الحي" value={d?.district || dash} />
            <Row label="المدينة" value={d?.city || dash} />
            <Row
              label="الرمز البريدي"
              value={d?.postal_code ? toLatinDigits(d.postal_code) : dash}
            />
            <Row
              label="الرقم الإضافي"
              value={d?.additional_no ? toLatinDigits(d.additional_no) : dash}
            />
            <Row label="رقم الوحدة" value={d?.unit_no || dash} />
          </dl>
          <Button className="min-h-11" onClick={openEdit}>
            تعديل العنوان الوطني
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Compact identity card: status, masked tail and a single 10-digit input.
 * The value is cleared after a successful link and the full number is never
 * rendered back — the server only ever returns the last four digits.
 */
function IdentityCard() {
  const t = useT();
  const queryClient = useQueryClient();
  const submit = useServerFn(linkPersonalIdentity);

  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | undefined>(undefined);

  const statusQuery = useQuery({
    queryKey: ["my-identity-status"],
    queryFn: () => getMyIdentityStatus(),
  });

  const mutation = useMutation({
    mutationFn: () => submit({ data: { nationalId: value } }),
    onSuccess: async () => {
      setValue("");
      setError(undefined);
      toast.success(t("profile.identity.saved"));
      await queryClient.invalidateQueries({ queryKey: ["my-identity-status"] });
    },
    onError: (err: Error) => {
      const key = `profile.identity.errors.${err.message}`;
      const message = t(key);
      toast.error(message === key ? t("profile.identity.errors.UNKNOWN") : message);
    },
  });

  const data = statusQuery.data;
  const statusLabel = !data?.linked
    ? t("profile.identity.none")
    : data.status === "verified" && data.verified_at
      ? t("profile.identity.verified")
      : data.status === "rejected"
        ? t("profile.identity.rejected")
        : t("profile.identity.pending");

  const onSubmit = () => {
    const normalized = toLatinDigits(value).replace(/[^0-9]/g, "");
    if (!isValidSaudiId(normalized)) {
      setError(t("profile.identity.errors.INVALID_NATIONAL_ID"));
      return;
    }
    setError(undefined);
    mutation.mutate();
  };

  return (
    <SectionCard title={t("profile.identity.title")} icon={IdCard}>
      {statusQuery.isPending ? (
        <CardsSkeleton cards={1} />
      ) : statusQuery.isError ? (
        <ErrorState
          description={t("profile.identity.loadError")}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t("profile.identity.status")}</dt>
              <dd className="text-sm font-medium">{statusLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("profile.identity.number")}</dt>
              <dd className="flex items-center gap-2 text-sm font-medium" dir="ltr">
                {/* Owner-only: the RPC returns the full number solely to auth.uid(). */}
                <span className="tabular-nums">
                  {data?.national_id
                    ? toLatinDigits(data.national_id)
                    : data?.last4
                      ? `\u2022\u2022\u2022\u2022\u2022\u2022${data.last4}`
                      : "—"}
                </span>
                {data?.national_id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t("profile.identity.copy")}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(toLatinDigits(data.national_id ?? ""))
                        .then(() => toast.success(t("profile.identity.copied")));
                    }}
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </dd>
            </div>
          </dl>

          <TextField
            id="national-id"
            label={t("profile.identity.field")}
            hint={t("profile.identity.hint")}
            value={value}
            error={error}
            onChange={(event) => {
              setValue(toLatinDigits(event.target.value).replace(/[^0-9]/g, "").slice(0, 10));
              setError(undefined);
            }}
          />

          <Button
            className="min-h-11 w-full sm:w-auto"
            disabled={mutation.isPending || value.length !== 10}
            onClick={onSubmit}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {t("profile.identity.submit")}
          </Button>

          <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            {t("profile.identity.nafathDisabled")} {t("profile.identity.privacyNote")}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
