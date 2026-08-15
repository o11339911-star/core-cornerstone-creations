import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT, useI18n } from "@/i18n";
import { AsyncBoundary, EmptyState } from "@/components/rakeez";
import { money } from "@/components/finance/money";
import { listLedgerEntries, reverseLedgerEntry } from "@/lib/finance-ledger.functions";

/**
 * Read-only view of an append-only ledger. Nothing here can be edited or
 * deleted; the single correction path is a reversing entry.
 */
export function LedgerTab({ projectId }: { projectId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const fetchEntries = useServerFn(listLedgerEntries);
  const reverse = useServerFn(reverseLedgerEntry);

  const entriesQuery = useQuery({
    queryKey: ["finance", "ledger", projectId],
    queryFn: () => fetchEntries({ data: { projectId } }),
  });

  const [error, setError] = React.useState<string | null>(null);
  const [openEntry, setOpenEntry] = React.useState<string | null>(null);

  const reverseMutation = useMutation({
    mutationFn: (vars: { entryId: string; reason: string }) => reverse({ data: vars }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const entries = entriesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <p
        role="note"
        className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
      >
        {t("finance.ledger.disclaimer")}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AsyncBoundary
        isLoading={entriesQuery.isLoading}
        isError={entriesQuery.isError}
        onRetry={() => void entriesQuery.refetch()}
      >
        {entries.length === 0 ? (
          <EmptyState title={t("finance.ledger.empty")} />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {entries.map((entry) => (
              <li key={entry.id} className="space-y-3 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{entry.entry_date}</span>
                  <span className="text-muted-foreground">
                    {t(`finance.ledger.sources.${entry.source_type}`)}
                  </span>
                  <span className="text-muted-foreground">{entry.memo ?? "—"}</span>
                  {entry.is_reversal ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {t("finance.ledger.isReversal")}
                    </span>
                  ) : null}
                  {entry.reversed_by_entry_id ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {t("finance.ledger.alreadyReversed")}
                    </span>
                  ) : null}
                  <span className="ms-auto text-muted-foreground">
                    {money(entry.total_debit, "SAR", t("finance.masked"))}
                  </span>
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-input px-3"
                    onClick={() => setOpenEntry(openEntry === entry.id ? null : entry.id)}
                  >
                    {t("finance.ledger.account")}
                  </button>
                  {!entry.reversed_by_entry_id && !entry.amounts_masked ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-input px-3 text-destructive"
                      onClick={() => {
                        const reason = window.prompt(t("finance.ledger.reverseReason"));
                        if (reason && reason.trim().length >= 3) {
                          reverseMutation.mutate({ entryId: entry.id, reason: reason.trim() });
                        }
                      }}
                    >
                      {t("finance.ledger.reverse")}
                    </button>
                  ) : null}
                </div>
                {openEntry === entry.id ? (
                  entry.amounts_masked ? (
                    <p className="text-xs text-muted-foreground">{t("finance.maskedHint")}</p>
                  ) : (
                    <table className="w-full rounded-md border border-border bg-muted/30 text-xs">
                      <thead>
                        <tr className="text-start">
                          <th className="p-2 text-start">{t("finance.ledger.account")}</th>
                          <th className="p-2 text-start">{t("finance.ledger.debit")}</th>
                          <th className="p-2 text-start">{t("finance.ledger.credit")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.lines.map((line) => (
                          <tr key={line.id} className="border-t border-border">
                            <td className="p-2">
                              {line.account_code} —{" "}
                              {locale === "ar" ? line.account_name_ar : line.account_name_en}
                            </td>
                            <td className="p-2">
                              {line.side === "debit"
                                ? money(line.amount, line.currency, t("finance.masked"))
                                : ""}
                            </td>
                            <td className="p-2">
                              {line.side === "credit"
                                ? money(line.amount, line.currency, t("finance.masked"))
                                : ""}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-border font-medium">
                          <td className="p-2">{t("finance.ledger.balanced")}</td>
                          <td className="p-2">
                            {money(entry.total_debit, "SAR", t("finance.masked"))}
                          </td>
                          <td className="p-2">
                            {money(entry.total_credit, "SAR", t("finance.masked"))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}
