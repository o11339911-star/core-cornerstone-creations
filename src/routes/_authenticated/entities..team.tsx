import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Send, UserCog, UserPlus, Users } from "lucide-react";

import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/rakeez";
import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import {
  APP_ROLES,
  createInvitation,
  listEntityMembers,
  listInvitations,
  offboardMember,
  revokeInvitation,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/entities/$entityId/team")({
  component: TeamPage,
  head: () => ({
    meta: [
      { title: "فريق الكيان — ركيز" },
      {
        name: "description",
        content: "إدارة أعضاء الكيان والدعوات والإسنادات ومستويات الظهور في منصة ركيز.",
      },
      { property: "og:title", content: "فريق الكيان — ركيز" },
      {
        property: "og:description",
        content: "دعوة الأعضاء، إدارة الأدوار، إنهاء الخدمة ونقل المهام.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TeamPage() {
  const t = useT();
  const { entityId } = Route.useParams();
  const queryClient = useQueryClient();

  const members = useServerFn(listEntityMembers);
  const invitations = useServerFn(listInvitations);
  const invite = useServerFn(createInvitation);
  const revoke = useServerFn(revokeInvitation);
  const offboard = useServerFn(offboardMember);

  const membersQuery = useQuery({
    queryKey: ["entity-members", entityId],
    queryFn: () => members({ data: { entityId } }),
  });
  const invitesQuery = useQuery({
    queryKey: ["entity-invitations", entityId],
    queryFn: () => invitations({ data: { entityId } }),
  });

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<(typeof APP_ROLES)[number]>("member");
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { entityId, email, role, validDays: 7 } }),
    onSuccess: (result) => {
      setError(null);
      setEmail("");
      setLink(`${window.location.origin}/invite/accept?token=${result.token}`);
      void queryClient.invalidateQueries({ queryKey: ["entity-invitations", entityId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revoke({ data: { invitationId } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["entity-invitations", entityId] }),
  });

  const offboardMutation = useMutation({
    mutationFn: (userId: string) => offboard({ data: { entityId, userId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["entity-members", entityId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const isLoading = membersQuery.isPending || invitesQuery.isPending;
  const isError = membersQuery.isError || invitesQuery.isError;
  const memberRows = membersQuery.data ?? [];
  const inviteRows = invitesQuery.data ?? [];
  const activeMembers = memberRows.filter((m) => m.status === "active").length;
  const pendingInvites = inviteRows.filter((i) => i.status === "pending").length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <PageHero title={t("team.title")} subtitle={t("team.subtitle")} />

      {isLoading ? (
        <CardsSkeleton cards={2} />
      ) : isError ? (
        <ErrorState
          onRetry={() => {
            void membersQuery.refetch();
            void invitesQuery.refetch();
          }}
        />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={Users} label={t("team.members")} value={memberRows.length} tone="primary" />
            <StatCard icon={UserCog} label="أعضاء نشِطون" value={activeMembers} tone="success" />
            <StatCard icon={Send} label={t("team.invitations")} value={pendingInvites} tone="warning" />
          </StatGrid>

          <SectionCard icon={UserPlus} title={t("team.inviteTitle")}>
            <p className="mb-4 text-xs text-muted-foreground">{t("team.inviteHint")}</p>
            <form
              className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                inviteMutation.mutate();
              }}
            >
              <TextField
                id="invite-email"
                label={t("team.email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground">{t("team.role")}</span>
                <select
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as (typeof APP_ROLES)[number])}
                >
                  {APP_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`team.roles.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" className="min-h-11" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? t("common.loading") : t("team.sendInvite")}
              </Button>
            </form>

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            {link ? (
              <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3">
                <p className="text-sm font-medium text-foreground">{t("team.copyLinkHint")}</p>
                <code className="mt-2 block break-all text-xs text-muted-foreground">{link}</code>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() => void navigator.clipboard.writeText(link)}
                >
                  <Copy className="me-2 size-4" aria-hidden="true" />
                  {t("team.copyLink")}
                </Button>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard icon={Send} title={t("team.invitations")} count={inviteRows.length}>
            {inviteRows.length === 0 ? (
              <SoftEmpty icon={Send} message={t("team.noInvitations")} />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {inviteRows.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <span className="truncate">{inv.email}</span>
                    <span className="text-muted-foreground">{t(`team.roles.${inv.role}`)}</span>
                    <span className="text-muted-foreground">{t(`team.status.${inv.status}`)}</span>
                    {inv.status === "pending" ? (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => revokeMutation.mutate(inv.id)}
                      >
                        {t("team.revoke")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon={Users} title={t("team.members")} count={memberRows.length}>
            {memberRows.length === 0 ? (
              <SoftEmpty icon={Users} message={t("team.noMembers")} />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {memberRows.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <span className="truncate font-mono text-xs">{m.user_id.slice(0, 8)}</span>
                    <span>{t(`team.roles.${m.role}`)}</span>
                    <span className="text-muted-foreground">{m.status}</span>
                    {m.status === "active" ? (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => offboardMutation.mutate(m.user_id)}
                      >
                        {t("team.offboard")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
