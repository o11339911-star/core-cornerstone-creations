import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail } from "lucide-react";

import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { CardsSkeleton, ErrorState, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import {
  listIncomingPartyInvitations,
  respondToProjectParty,
} from "@/lib/project-parties.functions";

export const Route = createFileRoute("/_authenticated/entities/invitations")({
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

  const rows = invitationsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <PageHero title={t("parties.incomingTitle")} subtitle={t("parties.incomingSubtitle")} />

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {invitationsQuery.isPending ? (
        <CardsSkeleton cards={2} />
      ) : invitationsQuery.isError ? (
        <ErrorState onRetry={() => void invitationsQuery.refetch()} />
      ) : (
        <SectionCard icon={Mail} title={t("parties.incomingTitle")} count={rows.length}>
          {rows.length === 0 ? (
            <SoftEmpty icon={Inbox} message={t("parties.noIncoming")} />
          ) : (
            <ul className="space-y-3">
              {rows.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-card"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.project_id.slice(0, 8)}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {t(`parties.roles.${p.party_role}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`parties.statuses.${p.status}`)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {p.scope_text_ar ?? ""}
                  </span>
                  {p.status === "invited" ? (
                    <span className="ms-auto flex gap-2">
                      <Button
                        className="min-h-11"
                        disabled={respondMutation.isPending}
                        onClick={() => respondMutation.mutate({ partyId: p.id, accept: true })}
                      >
                        {t("parties.accept")}
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={respondMutation.isPending}
                        onClick={() => respondMutation.mutate({ partyId: p.id, accept: false })}
                      >
                        {t("parties.reject")}
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
