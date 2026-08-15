import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import {
  PARTY_ACTIONS,
  PARTY_MODULES,
  PARTY_ROLES,
  endProjectParty,
  inviteProjectParty,
  listProjectParties,
  listProjectStages,
  type PartyRole,
} from "@/lib/project-parties.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/parties")({
  component: PartiesPage,
  head: () => ({
    meta: [
      { title: "أطراف المشروع — ركيز" },
      {
        name: "description",
        content:
          "دعوة الكيانات الخارجية للمشاركة في المشروع ضمن نطاق ومراحل وصلاحيات محددة في منصة ركيز.",
      },
      { property: "og:title", content: "أطراف المشروع — ركيز" },
      {
        property: "og:description",
        content: "إدارة المكاتب الهندسية والمقاولين والفاحصين المشاركين في المشروع.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type PermKey = `${(typeof PARTY_MODULES)[number]}:${(typeof PARTY_ACTIONS)[number]}`;

function PartiesPage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const parties = useServerFn(listProjectParties);
  const stages = useServerFn(listProjectStages);
  const invite = useServerFn(inviteProjectParty);
  const endParty = useServerFn(endProjectParty);

  const partiesQuery = useQuery({
    queryKey: ["project-parties", projectId],
    queryFn: () => parties({ data: { projectId } }),
  });
  const stagesQuery = useQuery({
    queryKey: ["project-stages", projectId],
    queryFn: () => stages({ data: { projectId } }),
  });

  const [entityId, setEntityId] = React.useState("");
  const [role, setRole] = React.useState<PartyRole>("contractor");
  const [scopeAr, setScopeAr] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [stageIds, setStageIds] = React.useState<string[]>([]);
  const [perms, setPerms] = React.useState<PermKey[]>(["projects:view", "stages:view"]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const togglePerm = (key: PermKey) =>
    setPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          projectId,
          partyEntityId: entityId.trim(),
          partyRole: role,
          scopeTextAr: scopeAr.trim() || null,
          endsOn: endsOn || null,
          stageIds,
          permissions: perms.map((p) => {
            const [module, action] = p.split(":");
            return {
              module: module as (typeof PARTY_MODULES)[number],
              action: action as (typeof PARTY_ACTIONS)[number],
            };
          }),
        },
      }),
    onSuccess: () => {
      setError(null);
      setEntityId("");
      setScopeAr("");
      setStageIds([]);
      void queryClient.invalidateQueries({ queryKey: ["project-parties", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const endMutation = useMutation({
    mutationFn: (partyId: string) => endParty({ data: { partyId } }),
    onSuccess: (result) => {
      setError(null);
      setNotice(t("parties.ended", { count: result.endedAssignments }));
      void queryClient.invalidateQueries({ queryKey: ["project-parties", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("parties.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("parties.subtitle")}</p>
      </header>

      <RakeezCard title={t("parties.inviteTitle")} description={t("parties.inviteHint")}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            inviteMutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="party-entity"
              label={t("parties.entityId")}
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              required
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{t("parties.role")}</span>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as PartyRole)}
              >
                {PARTY_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`parties.roles.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              id="party-scope"
              label={t("parties.scope")}
              value={scopeAr}
              onChange={(e) => setScopeAr(e.target.value)}
            />
            <TextField
              id="party-ends"
              label={t("parties.endsOn")}
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>

          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium text-foreground">
              {t("parties.stages")}
            </legend>
            <p className="mb-2 text-xs text-muted-foreground">{t("parties.stagesHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(stagesQuery.data ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stageIds.includes(s.id)}
                    onChange={() =>
                      setStageIds((prev) =>
                        prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                  />
                  <span>{s.name_ar}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium text-foreground">
              {t("parties.permissions")}
            </legend>
            <p className="mb-2 text-xs text-muted-foreground">{t("parties.permissionsHint")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-1 text-start font-medium" />
                    {PARTY_ACTIONS.map((a) => (
                      <th key={a} className="p-1 text-center font-medium">
                        {t(`parties.actions.${a}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PARTY_MODULES.map((m) => (
                    <tr key={m}>
                      <td className="p-1">{t(`parties.modules.${m}`)}</td>
                      {PARTY_ACTIONS.map((a) => {
                        const key = `${m}:${a}` as PermKey;
                        return (
                          <td key={a} className="p-1 text-center">
                            <input
                              type="checkbox"
                              aria-label={`${t(`parties.modules.${m}`)} — ${t(`parties.actions.${a}`)}`}
                              checked={perms.includes(key)}
                              onChange={() => togglePerm(key)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {t("parties.send")}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm text-muted-foreground">{notice}</p> : null}
      </RakeezCard>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("parties.list")}</h2>
        <AsyncBoundary
          isLoading={partiesQuery.isLoading}
          isError={partiesQuery.isError}
          onRetry={() => void partiesQuery.refetch()}
        >
          {(partiesQuery.data ?? []).length === 0 ? (
            <EmptyState title={t("parties.none")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(partiesQuery.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="font-mono text-xs">{p.party_entity_id.slice(0, 8)}</span>
                  <span>{t(`parties.roles.${p.party_role}`)}</span>
                  <span className="text-muted-foreground">
                    {t(`parties.statuses.${p.status}`)}
                  </span>
                  <span className="truncate text-muted-foreground">{p.scope_text_ar ?? ""}</span>
                  {p.status === "invited" || p.status === "accepted" ? (
                    <button
                      type="button"
                      className="ms-auto min-h-11 rounded-md border border-input px-3"
                      title={t("parties.endHint")}
                      onClick={() => endMutation.mutate(p.id)}
                    >
                      {t("parties.end")}
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
