import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import {
  TextField,
  AsyncBoundary,
  SoftEmpty,
  ErrorState,
  PageHero,
  SectionCard,
  CardsSkeleton,
  ResponsiveModal,
  Num,
} from "@/components/rakeez";
import { UserPlus, Users } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  containsNonAsciiDigits,
  isRealCalendarDate,
  riyadhToday,
  riyadhTomorrow,
  NON_ASCII_DIGITS_MESSAGE,
} from "@/lib/identity-format";
import {
  PARTY_ACTIONS,
  PARTY_MODULES,
  PARTY_ROLES,
  endProjectParty,
  inviteProjectPartyByIdentifier,
  lookupProjectPartyIdentifier,
  listProjectParties,
  listProjectStages,
  type PartyRole,
} from "@/lib/project-parties.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/parties")({
  component: PartiesPage,
  errorComponent: ErrorState,
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
  const invite = useServerFn(inviteProjectPartyByIdentifier);
  const lookup = useServerFn(lookupProjectPartyIdentifier);
  const endParty = useServerFn(endProjectParty);

  const partiesQuery = useQuery({
    queryKey: ["project-parties", projectId],
    queryFn: () => parties({ data: { projectId } }),
  });
  const stagesQuery = useQuery({
    queryKey: ["project-stages", projectId],
    queryFn: () => stages({ data: { projectId } }),
  });

  const [partyKind, setPartyKind] = React.useState<"person" | "entity">("entity");
  const [identifier, setIdentifier] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [role, setRole] = React.useState<PartyRole>("contractor");
  const [scopeAr, setScopeAr] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [stageIds, setStageIds] = React.useState<string[]>([]);
  const [perms, setPerms] = React.useState<PermKey[]>(["projects:view", "stages:view"]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const togglePerm = (key: PermKey) =>
    setPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  type LookupState =
    | { status: "idle" }
    | { status: "searching" }
    | { status: "invalid" }
    | { status: "throttled" }
    | { status: "registered"; displayName: string | null; last4: string }
    | { status: "unregistered"; last4: string };

  const [lookupState, setLookupState] = React.useState<LookupState>({ status: "idle" });

  const digits = identifier.replace(/[^0-9]/g, "").slice(0, 10);
  const identifierComplete =
    digits.length === 10 && (partyKind === "entity" || /^[12]/.test(digits));

  React.useEffect(() => {
    setLookupState({ status: "idle" });
    setDisplayName("");
    if (!identifierComplete) return;
    let cancelled = false;
    setLookupState({ status: "searching" });
    const timer = window.setTimeout(() => {
      void lookup({ data: { projectId, partyKind, identifier: digits } })
        .then((result) => {
          if (cancelled) return;
          setLookupState(result as LookupState);
          if (result.status === "registered" && result.displayName) {
            setDisplayName(result.displayName);
          }
        })
        .catch(() => {
          if (!cancelled) setLookupState({ status: "invalid" });
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [digits, identifierComplete, partyKind, projectId, lookup]);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const minEndsOn = React.useMemo(() => riyadhTomorrow(), []);

  /** أخطاء التحقق العميلية — نفس القواعد المفروضة خادميًا. */
  const validationError = React.useMemo((): string | null => {
    if (containsNonAsciiDigits(identifier) || containsNonAsciiDigits(endsOn)) {
      return `${NON_ASCII_DIGITS_MESSAGE}.`;
    }
    if (!identifierComplete) return t("parties.errIdentifier");
    if (!endsOn) return t("parties.errEndsRequired");
    if (!isRealCalendarDate(endsOn)) return t("parties.errEndsInvalid");
    if (endsOn <= riyadhToday()) return t("parties.errEndsFuture");
    if (stageIds.length === 0) return t("parties.errStages");
    if (perms.length === 0) return t("parties.errPerms");
    return null;
  }, [identifier, identifierComplete, endsOn, stageIds, perms, t]);

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          projectId,
          partyKind,
          identifier: digits,
          displayName: displayName.trim() || null,
          partyRole: role,
          scopeTextAr: scopeAr.trim() || null,
          endsOn,
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
    onSuccess: (result) => {
      setError(null);
      setConfirmOpen(false);
      setNotice(result.pending ? t("parties.invitedPending") : t("parties.invitedMatched"));
      setIdentifier("");
      setDisplayName("");
      setLookupState({ status: "idle" });
      setScopeAr("");
      setEndsOn("");
      setStageIds([]);
      void queryClient.invalidateQueries({ queryKey: ["project-parties", projectId] });
    },
    onError: (e: Error) => {
      setConfirmOpen(false);
      setError(e.message);
    },
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
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero title={t("parties.title")} subtitle={t("parties.subtitle")} />

      <SectionCard icon={UserPlus} title={t("parties.inviteTitle")}>
        <p className="mb-4 text-xs text-muted-foreground">{t("parties.inviteHint")}</p>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (inviteMutation.isPending || confirmOpen) return;
            if (validationError) {
              setNotice(null);
              setError(validationError);
              return;
            }
            setError(null);
            setConfirmOpen(true);
          }}
        >

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">{t("parties.partyKind")}</span>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={partyKind}
                onChange={(e) => {
                  setPartyKind(e.target.value as "person" | "entity");
                  setIdentifier("");
                }}
              >
                <option value="entity">{t("parties.kindEntity")}</option>
                <option value="person">{t("parties.kindPerson")}</option>
              </select>
            </label>
            <TextField
              id="party-identifier"
              label={
                partyKind === "person"
                  ? t("parties.identifierPerson")
                  : t("parties.identifierEntity")
              }
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              inputMode="numeric"
              maxLength={10}
              dir="ltr"
              required
              hint={
                partyKind === "person"
                  ? t("parties.identifierHintPerson")
                  : t("parties.identifierHintEntity")
              }
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

          <TextField
            id="party-name"
            label={t("parties.nameOptional")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            hint={t("parties.nameOptionalHint")}
          />

          {lookupState.status !== "idle" ? (
            <p
              aria-live="polite"
              className={
                lookupState.status === "invalid" || lookupState.status === "throttled"
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {lookupState.status === "searching" ? t("parties.lookupSearching") : null}
              {lookupState.status === "invalid" ? t("parties.lookupInvalid") : null}
              {lookupState.status === "throttled" ? t("parties.lookupThrottled") : null}
              {lookupState.status === "unregistered" ? t("parties.lookupUnregistered") : null}
              {lookupState.status === "registered"
                ? lookupState.displayName
                  ? t("parties.lookupRegistered", { name: lookupState.displayName })
                  : t("parties.lookupRegisteredNoName")
                : null}
            </p>
          ) : null}

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
            disabled={inviteMutation.isPending || !identifierComplete}
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {t("parties.send")}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm text-muted-foreground">{notice}</p> : null}
      </SectionCard>

      <SectionCard icon={Users} title={t("parties.list")} count={partiesQuery.data?.length ?? 0}>
        <AsyncBoundary
          isLoading={partiesQuery.isLoading}
          isError={partiesQuery.isError}
          onRetry={() => void partiesQuery.refetch()}
          loadingFallback={<CardsSkeleton cards={1} />}
        >
          {(partiesQuery.data ?? []).length === 0 ? (
            <SoftEmpty icon={Users} message={t("parties.none")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(partiesQuery.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="font-medium text-foreground">
                    {p.party_display_name ?? t("parties.unnamedParty")}
                  </span>
                  {p.identifier_last4 || p.cr_number ? (
                    <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
                      {p.cr_number ?? `\u2022\u2022\u2022\u2022${p.identifier_last4}`}
                    </bdi>
                  ) : null}
                  <span>{t(`parties.roles.${p.party_role}`)}</span>
                  <span className="text-muted-foreground">{t(`parties.statuses.${p.status}`)}</span>
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
      </SectionCard>
    </div>
  );
}
