import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bell, Building2, PlusCircle, Repeat, ShieldCheck, User } from "lucide-react";

import { CardsSkeleton, ErrorState, PageHero, SectionCard } from "@/components/rakeez";
import { entityTypeLabel } from "@/components/app-shell";
import { useT } from "@/i18n";
import { useAccountUi } from "@/lib/account-ui";
import { getMyProfile } from "@/lib/auth.functions";
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
    </div>
  );
}
