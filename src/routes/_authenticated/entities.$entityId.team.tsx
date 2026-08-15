import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, AsyncBoundary, EmptyState } from "@/components/rakeez";
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("team.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("team.subtitle")}</p>
      </header>

      <RakeezCard title={t("team.inviteTitle")} description={t("team.inviteHint")}>
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
          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {t("team.sendInvite")}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        {link ? (
          <div className="mt-4 rounded-md border border-border bg-muted/50 p-3">
            <p className="text-sm font-medium text-foreground">{t("team.copyLinkHint")}</p>
            <code className="mt-2 block break-all text-xs text-muted-foreground">{link}</code>
            <button
              type="button"
              className="mt-3 inline-flex min-h-11 items-center rounded-md border border-input px-3 text-sm"
              onClick={() => void navigator.clipboard.writeText(link)}
            >
              {t("team.copyLink")}
            </button>
          </div>
        ) : null}
      </RakeezCard>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("team.invitations")}</h2>
        <AsyncBoundary
          isLoading={invitesQuery.isLoading}
          isError={invitesQuery.isError}
          onRetry={() => void invitesQuery.refetch()}
        >
          {(invitesQuery.data ?? []).length === 0 ? (
            <EmptyState title={t("team.noInvitations")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(invitesQuery.data ?? []).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="truncate">{inv.email}</span>
                  <span className="text-muted-foreground">{t(`team.roles.${inv.role}`)}</span>
                  <span className="text-muted-foreground">{t(`team.status.${inv.status}`)}</span>
                  {inv.status === "pending" ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-input px-3"
                      onClick={() => revokeMutation.mutate(inv.id)}
                    >
                      {t("team.revoke")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("team.members")}</h2>
        <AsyncBoundary
          isLoading={membersQuery.isLoading}
          isError={membersQuery.isError}
          onRetry={() => void membersQuery.refetch()}
        >
          {(membersQuery.data ?? []).length === 0 ? (
            <EmptyState title={t("team.noMembers")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(membersQuery.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="truncate font-mono text-xs">{m.user_id.slice(0, 8)}</span>
                  <span>{t(`team.roles.${m.role}`)}</span>
                  <span className="text-muted-foreground">{m.status}</span>
                  {m.status === "active" ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-input px-3"
                      onClick={() => offboardMutation.mutate(m.user_id)}
                    >
                      {t("team.offboard")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </section>
    </div>
  );
}
