import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { AsyncBoundary, EmptyState } from "@/components/rakeez";
import {
  listIncomingPartyInvitations,
  respondToProjectParty,
} from "@/lib/project-parties.functions";

export const Route = createFileRoute("/_authenticated/entities/$entityId/invitations")({
  component: IncomingInvitationsPage,
  head: () => ({
    meta: [
      { title: "دعوات المشاريع الواردة — ركيز" },
      {
        name: "description",
        content: "قبول أو رفض دعوات المشاركة في مشاريع خارجية الموجهة لكيانك في منصة ركيز.",
      },
      { property: "og:title", content: "دعوات المشاريع الواردة — ركيز" },
      {
        property: "og:description",
        content: "إدارة دعوات المشاركة كطرف خارجي في مشاريع العملاء.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function IncomingInvitationsPage() {
  const t = useT();
  const { entityId } = Route.useParams();
  const queryClient = useQueryClient();

  const list = useServerFn(listIncomingPartyInvitations);
  const respond = useServerFn(respondToProjectParty);

  const [error, setError] = React.useState<string | null>(null);

  const invitationsQuery = useQuery({
    queryKey: ["incoming-party-invitations", entityId],
    queryFn: () => list({ data: { entityId } }),
  });

  const respondMutation = useMutation({
    mutationFn: (vars: { partyId: string; accept: boolean }) => respond({ data: vars }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["incoming-party-invitations", entityId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("parties.incomingTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("parties.incomingSubtitle")}</p>
      </header>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <AsyncBoundary
        isLoading={invitationsQuery.isLoading}
        isError={invitationsQuery.isError}
        onRetry={() => void invitationsQuery.refetch()}
      >
        {(invitationsQuery.data ?? []).length === 0 ? (
          <EmptyState title={t("parties.noIncoming")} />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(invitationsQuery.data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-mono text-xs">{p.project_id.slice(0, 8)}</span>
                <span>{t(`parties.roles.${p.party_role}`)}</span>
                <span className="text-muted-foreground">{t(`parties.statuses.${p.status}`)}</span>
                <span className="truncate text-muted-foreground">{p.scope_text_ar ?? ""}</span>
                {p.status === "invited" ? (
                  <span className="ms-auto flex gap-2">
                    <button
                      type="button"
                      className="min-h-11 rounded-md bg-primary px-3 text-primary-foreground"
                      onClick={() => respondMutation.mutate({ partyId: p.id, accept: true })}
                    >
                      {t("parties.accept")}
                    </button>
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-input px-3"
                      onClick={() => respondMutation.mutate({ partyId: p.id, accept: false })}
                    >
                      {t("parties.reject")}
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}
