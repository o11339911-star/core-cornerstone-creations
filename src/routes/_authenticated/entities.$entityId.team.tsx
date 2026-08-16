import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Send, ShieldAlert, UserCog, UserPlus, Users } from "lucide-react";

import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextField, ResponsiveModal } from "@/components/rakeez";
import {
  CardsSkeleton,
  ErrorState,
  PageHero,
  SectionCard,
  SoftEmpty,
  StatCard,
  StatGrid,
} from "@/components/rakeez";
import { formatDateTime } from "@/lib/format";
import {
  APP_ROLES,
  changeMemberRole,
  createInvitation,
  listEntityTeam,
  listInvitations,
  offboardMemberSafely,
  revokeInvitation,
  type TeamRosterRow,
} from "@/lib/team.functions";
import { getMyPermissions } from "@/lib/permissions.functions";

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

  const team = useServerFn(listEntityTeam);
  const invitations = useServerFn(listInvitations);
  const invite = useServerFn(createInvitation);
  const revoke = useServerFn(revokeInvitation);
  const changeRole = useServerFn(changeMemberRole);
  const offboard = useServerFn(offboardMemberSafely);
  const permissionsFn = useServerFn(getMyPermissions);

  const teamQuery = useQuery({
    queryKey: ["entity-team", entityId],
    queryFn: () => team({ data: { entityId } }),
  });
  const permissionsQuery = useQuery({
    queryKey: ["entity-permissions", entityId],
    queryFn: () => permissionsFn({ data: { entityId } }),
  });
  const canManage = (permissionsQuery.data ?? []).includes("members.manage_members");
  const invitesQuery = useQuery({
    queryKey: ["entity-invitations", entityId],
    queryFn: () => invitations({ data: { entityId } }),
    enabled: canManage,
  });

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<(typeof APP_ROLES)[number]>("member");
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [offboardTarget, setOffboardTarget] = React.useState<TeamRosterRow | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { entityId, email, role, validDays: 7 } }),
    onSuccess: (result) => {
      setError(null);
      setEmail("");
      setLink(`${window.location.origin}/invite/accept?token=${result.token}`);
      void queryClient.invalidateQueries({ queryKey: ["entity-invitations", entityId] });
    },
    onError: (e: Error) => setError(t(e.message)),
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revoke({ data: { invitationId } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["entity-invitations", entityId] }),
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { membershipId: string; newRole: (typeof APP_ROLES)[number] }) =>
      changeRole({ data: { entityId, membershipId: vars.membershipId, newRole: vars.newRole } }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["entity-team", entityId] });
    },
    onError: (e: Error) => setError(t(e.message)),
  });

  const isLoading = teamQuery.isPending || permissionsQuery.isPending || (canManage && invitesQuery.isPending);
  const isError = teamQuery.isError || permissionsQuery.isError || (canManage && invitesQuery.isError);
  const teamRows = teamQuery.data ?? [];
  const inviteRows = canManage ? (invitesQuery.data ?? []) : [];
  const activeMembers = teamRows.filter((m) => m.status === "active").length;
  const pendingInvites = inviteRows.filter((i) => i.status === "pending").length;
  const activeOwners = teamRows.filter((m) => m.role === "owner" && m.status === "active").length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <PageHero title={t("team.title")} subtitle={t("team.subtitle")} />

      {isLoading ? (
        <CardsSkeleton cards={2} />
      ) : isError ? (
        <ErrorState
          onRetry={() => {
            void teamQuery.refetch();
            void permissionsQuery.refetch();
            if (canManage) void invitesQuery.refetch();
          }}
        />
      ) : (
        <>
          <StatGrid>
            <StatCard icon={Users} label={t("team.members")} value={teamRows.length} tone="primary" />
            <StatCard icon={UserCog} label={t("team.activeMembers")} value={activeMembers} tone="success" />
            {canManage ? (
              <StatCard icon={Send} label={t("team.invitations")} value={pendingInvites} tone="warning" />
            ) : null}
          </StatGrid>

          {canManage ? (
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
          ) : null}

          {canManage ? (
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
          ) : null}

          <SectionCard icon={Users} title={t("team.members")} count={teamRows.length}>
            {teamRows.length === 0 ? (
              <SoftEmpty icon={Users} message={t("team.noMembers")} />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {teamRows.map((m) => {
                  const isLastOwner = m.role === "owner" && activeOwners <= 1;
                  const lockedBySelf = m.is_self;
                  const canManageRow = (row: TeamRosterRow) =>
                    !row.is_self && !(row.role === "owner" && activeOwners <= 1 && row.status === "active");
                  return (
                    <li key={m.membership_id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {m.full_name}
                          {m.is_self ? (
                            <span className="ms-2 text-xs text-muted-foreground">{t("team.you")}</span>
                          ) : null}
                        </p>
                        {m.email ? (
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        ) : null}
                      </div>
                      {canManage ? (
                        <select
                          className="min-h-11 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                          value={m.role}
                          disabled={!canManageRow(m) || roleMutation.isPending}
                          onChange={(e) =>
                            roleMutation.mutate({
                              membershipId: m.membership_id,
                              newRole: e.target.value as (typeof APP_ROLES)[number],
                            })
                          }
                        >
                          {APP_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`team.roles.${r}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant="secondary">{t(`team.roles.${m.role}`)}</Badge>
                      )}
                      <span className="text-muted-foreground">{t(`team.status.${m.status}`)}</span>
                      {canManage && m.status === "active" ? (
                        <Button
                          variant="outline"
                          className="min-h-11"
                          disabled={!canManageRow(m)}
                          title={
                            lockedBySelf
                              ? t("team.cannotOffboardSelf")
                              : isLastOwner
                                ? t("team.lastOwnerProtected")
                                : undefined
                          }
                          onClick={() => setOffboardTarget(m)}
                        >
                          {t("team.offboard")}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {activeOwners <= 1 ? (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
                {t("team.lastOwnerNotice")}
              </p>
            ) : null}
          </SectionCard>
        </>
      )}

      {offboardTarget ? (
        <OffboardModalWrapper
          entityId={entityId}
          member={offboardTarget}
          roster={teamRows}
          onClose={() => setOffboardTarget(null)}
        />
      ) : null}
    </div>
  );
}

function OffboardModalWrapper(props: {
  entityId: string;
  member: TeamRosterRow;
  roster: TeamRosterRow[];
  onClose: () => void;
}) {
  return <OffboardDialogFixed {...props} />;
}

/** Wired offboarding dialog: needs the member's real user_id, which the
 * safe-directory RPC intentionally does not expose to the UI layer beyond
 * the membership row itself — the server fn resolves it from membershipId. */
function OffboardDialogFixed({
  entityId,
  member,
  roster,
  onClose,
}: {
  entityId: string;
  member: TeamRosterRow;
  roster: TeamRosterRow[];
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const offboard = useServerFn(offboardMemberSafely);
  const [needsReplacement, setNeedsReplacement] = React.useState(false);
  const [replacementUserId, setReplacementUserId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const otherMembers = roster.filter(
    (m) => m.membership_id !== member.membership_id && m.status === "active",
  );

  const mutation = useMutation({
    mutationFn: () =>
      offboard({
        data: {
          entityId,
          membershipId: member.membership_id,
          replacementMembershipId: replacementUserId || null,
        },
      }),
    onSuccess: (result) => {
      if (result.needsReplacement) {
        setNeedsReplacement(true);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["entity-team", entityId] });
      onClose();
    },
    onError: (e: Error) => setError(t(e.message)),
  });

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("team.offboardTitle")}
      description={t("team.offboardHint", { name: member.full_name })}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={mutation.isPending || (needsReplacement && !replacementUserId)}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("common.loading") : t("team.offboardConfirm")}
          </Button>
        </div>
      }
    >
      {needsReplacement ? (
        <div className="space-y-3">
          <p className="text-sm text-warning">{t("team.needsReplacementHint")}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("team.replacement")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={replacementUserId}
              onChange={(e) => setReplacementUserId(e.target.value)}
            >
              <option value="">{t("team.selectReplacement")}</option>
              {otherMembers.map((m) => (
                <option key={m.membership_id} value={m.membership_id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </ResponsiveModal>
  );
}
