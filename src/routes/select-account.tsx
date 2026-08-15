import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { CardsSkeleton, ErrorState, PageHero } from "@/components/rakeez";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/lib/active-account";
import { getMyMemberships, getMyProfile, type MembershipRow } from "@/lib/auth.functions";
import { queryClient } from "@/router";

export const Route = createFileRoute("/select-account")({
  component: SelectAccountPage,
  beforeLoad: async () => {
    // Ensure the user is authenticated before rendering the page.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: "/select-account" } });
    }
  },
  errorComponent: ErrorState,
});

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
