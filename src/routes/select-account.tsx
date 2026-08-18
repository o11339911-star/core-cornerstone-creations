import * as React from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { PolicyAcceptanceGate } from "@/components/legal/policy-acceptance-gate";
import { CardsSkeleton, ErrorState, PageHero } from "@/components/rakeez";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/lib/active-account";
import { getMyMemberships, getMyProfile, type MembershipRow } from "@/lib/auth.functions";
import { getPlatformMe } from "@/lib/platform-admin.functions";
import { hasPlatformAccess, PLATFORM_HOME } from "@/lib/platform-access";
import { queryClient } from "@/router";

export const Route = createFileRoute("/select-account")({
  component: SelectAccountRoute,
  errorComponent: ErrorState,
});

/**
 * Phase 29F: the auth guard runs after hydration (not in `beforeLoad`), so the
 * first client render always matches the server shell — a `beforeLoad` redirect
 * swapped the tree mid-hydration and raised a React hydration error.
 */
function SelectAccountRoute() {
  const navigate = useNavigate();
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        void navigate({ to: "/auth", search: { redirect: "/select-account" }, replace: true });
        return;
      }
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!checked) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6 lg:px-8">
        <CardsSkeleton cards={2} />
      </div>
    );
  }

  return <PlatformAccountGate />;
}

function PlatformAccountGate() {
  const navigate = useNavigate();
  const fetchPlatformMe = useServerFn(getPlatformMe);
  const platform = useQuery({
    queryKey: ["platform-me"],
    queryFn: () => fetchPlatformMe(),
    retry: false,
  });

  React.useEffect(() => {
    if (hasPlatformAccess(platform.data)) {
      void navigate({ to: PLATFORM_HOME, replace: true });
    }
  }, [navigate, platform.data]);

  if (platform.isPending || hasPlatformAccess(platform.data)) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6 lg:px-8">
        <CardsSkeleton cards={2} />
      </div>
    );
  }

  if (platform.isError) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6 lg:px-8">
        <ErrorState
          title="تعذّر التحقق من نوع الحساب"
          description="لم نتمكن من التحقق من صلاحية إدارة النظام. أعد المحاولة للمتابعة بأمان."
          onRetry={() => void platform.refetch()}
        />
      </div>
    );
  }

  // Only a conclusive server-side negative result reaches ordinary account
  // selection. An unavailable check never downgrades an administrator silently.
  return (
    <PolicyAcceptanceGate>
      <SelectAccountPage />
    </PolicyAcceptanceGate>
  );
}

function SelectAccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const { setScope } = useActiveAccount();

  const profileQuery = useSuspenseQuery({
    queryKey: ["my-profile"],
    queryFn: () => getMyProfile(),
  });

  const membershipsQuery = useSuspenseQuery({
    queryKey: ["my-memberships"],
    queryFn: () => getMyMemberships(),
  });

  const profile = profileQuery.data;
  const memberships = membershipsQuery.data ?? [];

  const selectPersonal = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    setScope({ kind: "personal" });
    navigate({ to: "/dashboard", replace: true });
  };

  const selectEntity = async (entityId: string) => {
    await queryClient.cancelQueries();
    queryClient.clear();
    setScope({ kind: "entity", entityId });
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-12 sm:px-6 lg:px-8">
        <PageHero title={t("account.selectTitle")} subtitle={t("account.selectSubtitle")} />

        {profileQuery.isLoading || membershipsQuery.isLoading ? (
          <CardsSkeleton cards={2} />
        ) : (
          <div className="space-y-4">
            <AccountOption
              title={t("account.personal")}
              description={t("account.personalDescription")}
              meta={profile?.full_name ?? ""}
              onClick={selectPersonal}
            />

            <div className="pt-4">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("account.entities")}</h2>
              {memberships.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{t("account.noEntities")}</p>
                  <p className="mt-1">{t("account.noEntitiesDescription")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {memberships.map((membership) => (
                    <EntityOption
                      key={membership.id}
                      membership={membership}
                      onClick={() => selectEntity(membership.entity.id)}
                    />
                  ))}
                </div>
              )}

              <Link
                to="/entities/new"
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                {t("entities.new.cta")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountOption({
  title,
  description,
  meta,
  onClick,
}: {
  title: string;
  description: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-5 text-start shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {meta && <p className="mt-2 text-xs text-muted-foreground">{meta}</p>}
      </div>
      <span className="text-sm font-medium text-primary">{"←"}</span>
    </button>
  );
}

function EntityOption({
  membership,
  onClick,
}: {
  membership: MembershipRow;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-5 text-start shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div>
        <h3 className="font-semibold text-foreground">{membership.entity.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("account.role")}: {membership.role}
        </p>
      </div>
      <span className="text-sm font-medium text-primary">{"←"}</span>
    </button>
  );
}
