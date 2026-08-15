import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import { money } from "@/components/finance/money";
import {
  RETENTION_KINDS,
  cancelRetentionHold,
  createRetentionHold,
  forfeitRetention,
  listRetentionHolds,
  releaseRetention,
  type RetentionKind,
} from "@/lib/finance-ledger.functions";

/**
 * Contractual tracking only. The retained money stays with the parties; the
 * platform never holds it. Status is derived in the database from the events.
 */
export function RetentionTab({ projectId }: { projectId: string }) {
  const t = useT();
  const queryClient = useQueryClient();

  const fetchHolds = useServerFn(listRetentionHolds);
  const createHold = useServerFn(createRetentionHold);
  const release = useServerFn(releaseRetention);
  const forfeit = useServerFn(forfeitRetention);
  const cancelHold = useServerFn(cancelRetentionHold);

  const holdsQuery = useQuery({
    queryKey: ["finance", "retention", projectId],
    queryFn: () => fetchHolds({ data: { projectId } }),
  });

  const [kind, setKind] = React.useState<RetentionKind>("retention");
  const [heldAmount, setHeldAmount] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [openHold, setOpenHold] = React.useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["finance"] });
  };
  const onError = (e: Error) => setError(e.message);

  const createMutation = useMutation({
    mutationFn: () =>
      createHold({
        data: {
          projectId,
          heldAmount: Number(heldAmount),
          kind,
          expectedReleaseDate: expected || null,
          releaseTermsAr: terms.trim() || null,
        },
      }),
    onSuccess: () => {
      setError(null);
      setHeldAmount("");
      setTerms("");
      invalidate();
    },
    onError,
  });

  const releaseMutation = useMutation({
    mutationFn: (vars: { holdId: string; amount: number; note: string | null }) =>
      release({ data: vars }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const forfeitMutation = useMutation({
    mutationFn: (vars: { holdId: string; reason: string }) => forfeit({ data: vars }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const cancelMutation = useMutation({
    mutationFn: (vars: { holdId: string; reason: string }) => cancelHold({ data: vars }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const holds = holdsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <p
        role="note"
        className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
      >
        {t("finance.retentionHolds.disclaimer")}
      </p>

      <RakeezCard title={t("finance.retentionHolds.new")}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("finance.retentionHolds.kind")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as RetentionKind)}
            >
              {RETENTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`finance.retentionHolds.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id="rh-amount"
            label={t("finance.retentionHolds.held")}
            type="number"
            value={heldAmount}
            onChange={(e) => setHeldAmount(e.target.value)}
            required
          />
          <TextField
            id="rh-expected"
            label={t("finance.retentionHolds.expectedRelease")}
            type="date"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
          <TextField
            id="rh-terms"
            label={t("finance.retentionHolds.terms")}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {t("finance.retentionHolds.new")}
            </button>
          </div>
        </form>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </RakeezCard>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          {t("finance.retentionHolds.title")}
        </h2>
        <AsyncBoundary
          isLoading={holdsQuery.isLoading}
          isError={holdsQuery.isError}
          onRetry={() => void holdsQuery.refetch()}
        >
          {holds.length === 0 ? (
            <EmptyState title={t("finance.retentionHolds.empty")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {holds.map((h) => {
                const open = h.status === "active" || h.status === "partially_released";
                return (
                  <li key={h.id} className="space-y-3 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium">
                        {t(`finance.retentionHolds.kinds.${h.kind}`)}
                      </span>
                      <span className="text-muted-foreground">
                        {t("finance.retentionHolds.held")}:{" "}
                        {money(h.held_amount, h.currency, t("finance.masked"))}
                      </span>
                      <span className="text-muted-foreground">
                        {t("finance.retentionHolds.remaining")}:{" "}
                        {money(h.remaining_amount, h.currency, t("finance.masked"))}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                        {t(`finance.retentionHolds.holdStatus.${h.status}`)}
                      </span>
                      <button
                        type="button"
                        className="ms-auto min-h-11 rounded-md border border-input px-3"
                        onClick={() => setOpenHold(openHold === h.id ? null : h.id)}
                      >
                        {t("finance.retentionHolds.events")}
                      </button>
                      {open && !h.amounts_masked ? (
                        <button
                          type="button"
                          className="min-h-11 rounded-md border border-input px-3"
                          onClick={() => {
                            const value = window.prompt(t("finance.retentionHolds.releaseAmount"));
                            if (!value || Number(value) <= 0) return;
                            releaseMutation.mutate({
                              holdId: h.id,
                              amount: Number(value),
                              note: null,
                            });
                          }}
                        >
                          {t("finance.retentionHolds.release")}
                        </button>
                      ) : null}
                      {open ? (
                        <>
                          <button
                            type="button"
                            className="min-h-11 rounded-md border border-input px-3 text-destructive"
                            onClick={() => {
                              const reason = window.prompt(t("finance.cancelReason"));
                              if (reason && reason.trim().length >= 3) {
                                forfeitMutation.mutate({ holdId: h.id, reason: reason.trim() });
                              }
                            }}
                          >
                            {t("finance.retentionHolds.forfeit")}
                          </button>
                          <button
                            type="button"
                            className="min-h-11 rounded-md border border-input px-3 text-destructive"
                            onClick={() => {
                              const reason = window.prompt(t("finance.cancelReason"));
                              if (reason && reason.trim().length >= 3) {
                                cancelMutation.mutate({ holdId: h.id, reason: reason.trim() });
                              }
                            }}
                          >
                            {t("finance.documents.cancel")}
                          </button>
                        </>
                      ) : null}
                    </div>
                    {openHold === h.id ? (
                      <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
                        {h.events.map((e) => (
                          <li key={e.id} className="flex flex-wrap gap-3">
                            <span className="font-medium">
                              {t(`finance.retentionHolds.eventTypes.${e.event_type}`)}
                            </span>
                            <span>{money(e.amount, h.currency, t("finance.masked"))}</span>
                            <span className="text-muted-foreground">{e.note ?? "—"}</span>
                            <span className="ms-auto text-muted-foreground">{e.event_date}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </AsyncBoundary>
      </section>
    </div>
  );
}
