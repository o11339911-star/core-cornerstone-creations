import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Building2,
  IdCard,
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
    </div>
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
              <dd className="text-sm font-medium" dir="ltr">
                {data?.last4 ? `\u2022\u2022\u2022\u2022\u2022\u2022${data.last4}` : "—"}
              </dd>
            </div>
          </dl>

          <TextField
            id="national-id"
            label={t("profile.identity.field")}
            hint={t("profile.identity.hint")}
            inputMode="numeric"
            maxLength={10}
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
