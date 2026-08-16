import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { IdCard, Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard, SoftEmpty } from "@/components/rakeez";
import { useT } from "@/i18n";
import { toLatinDigits } from "@/lib/format";
import {
  addContractPersonParty,
  adminSearchIdentities,
  lookupIdentityForContract,
  type IdentityMatch,
} from "@/lib/identity.functions";

const errorKey = (message: string) =>
  [
    "INVALID_NATIONAL_ID",
    "FORBIDDEN",
    "RATE_LIMITED",
    "TARGET_NOT_FOUND",
  ].find((code) => message.includes(code)) ?? "UNKNOWN";

function StatusPill({ match }: { match: IdentityMatch }) {
  const t = useT();
  const verified = match.status === "verified" && match.verified_at;
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {verified ? t("profile.identity.verified") : t("profile.identity.pending")}
    </span>
  );
}

/** Platform-admin only. The database re-verifies platform admin status. */
export function AdminIdentitySearch() {
  const t = useT();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<IdentityMatch[] | null>(null);
  const search = useServerFn(adminSearchIdentities);

  const mutation = useMutation({
    mutationFn: () => search({ data: { query: query.trim() } }),
    onSuccess: (rows) => setResults(rows),
    onError: (e: Error) => toast.error(t(`identitySearch.errors.${errorKey(e.message)}`)),
  });

  return (
    <SectionCard icon={IdCard} title={t("identitySearch.adminTitle")}>
      <p className="mb-3 text-xs text-muted-foreground">{t("identitySearch.adminHint")}</p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) mutation.mutate();
        }}
      >
        <Input
          aria-label={t("identitySearch.adminField")}
          className="min-h-11"
          value={query}
          onChange={(e) => setQuery(toLatinDigits(e.target.value))}
          placeholder={t("identitySearch.adminField")}
        />
        <Button type="submit" className="min-h-11" disabled={mutation.isPending || query.trim().length < 2}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          {t("identitySearch.search")}
        </Button>
      </form>

      {results ? (
        results.length === 0 ? (
          <div className="mt-4">
            <SoftEmpty icon={IdCard} title={t("identitySearch.empty")} />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm">
            {results.map((match) => (
              <li key={match.user_id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">
                  {match.full_name ?? t("identitySearch.unnamed")}
                </span>
                <span className="tabular-nums text-muted-foreground" dir="ltr">
                  {match.national_id
                    ? toLatinDigits(match.national_id)
                    : `\u2022\u2022\u2022\u2022\u2022\u2022${match.last4 ?? ""}`}
                </span>
                <StatusPill match={match} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </SectionCard>
  );
}

/** Exact-match contractor lookup, then attach as a contract party. */
export function ContractIdentityLookup({
  projectId,
  contractId,
  onAttached,
}: {
  projectId: string;
  contractId: string;
  onAttached?: () => void;
}) {
  const t = useT();
  const [value, setValue] = React.useState("");
  const [role, setRole] = React.useState("");
  const [match, setMatch] = React.useState<IdentityMatch | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  const lookup = useServerFn(lookupIdentityForContract);
  const attach = useServerFn(addContractPersonParty);

  const onError = (e: Error) => toast.error(t(`identitySearch.errors.${errorKey(e.message)}`));

  const lookupMutation = useMutation({
    mutationFn: () => lookup({ data: { projectId, nationalId: value } }),
    onSuccess: (row) => {
      if (row.found) {
        setMatch(row);
        setNotFound(false);
      } else {
        setMatch(null);
        setNotFound(true);
      }
    },
    onError,
  });

  const attachMutation = useMutation({
    mutationFn: () =>
      attach({
        data: { contractId, userId: match?.user_id ?? "", contractRole: role.trim() },
      }),
    onSuccess: () => {
      toast.success(t("identitySearch.attached"));
      setMatch(null);
      setValue("");
      setRole("");
      onAttached?.();
    },
    onError,
  });

  return (
    <SectionCard icon={IdCard} title={t("identitySearch.contractTitle")}>
      <p className="mb-3 text-xs text-muted-foreground">{t("identitySearch.contractHint")}</p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.length === 10) lookupMutation.mutate();
        }}
      >
        <Input
          aria-label={t("identitySearch.contractField")}
          className="min-h-11 tabular-nums"
          dir="ltr"
          inputMode="numeric"
          value={value}
          onChange={(e) =>
            setValue(toLatinDigits(e.target.value).replace(/[^0-9]/g, "").slice(0, 10))
          }
          placeholder={t("identitySearch.contractField")}
        />
        <Button
          type="submit"
          className="min-h-11"
          disabled={lookupMutation.isPending || value.length !== 10}
        >
          {lookupMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          {t("identitySearch.search")}
        </Button>
      </form>

      {notFound ? (
        <div className="mt-4">
          <SoftEmpty icon={IdCard} title={t("identitySearch.empty")} />
        </div>
      ) : null}

      {match ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{match.full_name ?? t("identitySearch.unnamed")}</span>
            <span className="tabular-nums text-muted-foreground" dir="ltr">
              {toLatinDigits(match.national_id ?? "")}
            </span>
            <StatusPill match={match} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label={t("identitySearch.roleField")}
              className="min-h-11"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t("identitySearch.roleField")}
            />
            <Button
              type="button"
              className="min-h-11"
              disabled={attachMutation.isPending || role.trim().length < 2}
              onClick={() => attachMutation.mutate()}
            >
              {attachMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="size-4" aria-hidden="true" />
              )}
              {t("identitySearch.attach")}
            </Button>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
