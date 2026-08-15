import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import { money } from "@/components/finance/money";
import {
  DOC_DIRECTIONS,
  DOC_TYPES,
  cancelFinancialDocument,
  createFinancialDocument,
  issueFinancialDocument,
  listFinancialDocuments,
  reviseFinancialDocument,
  type FinancialDocDirection,
  type FinancialDocType,
} from "@/lib/finance-ledger.functions";

/**
 * Financial documents are a record of what the parties issued OUTSIDE the
 * platform. Corrections never edit a version: they append a new one.
 */
export function DocumentsTab({ projectId }: { projectId: string }) {
  const t = useT();
  const queryClient = useQueryClient();

  const fetchDocs = useServerFn(listFinancialDocuments);
  const createDoc = useServerFn(createFinancialDocument);
  const reviseDoc = useServerFn(reviseFinancialDocument);
  const issueDoc = useServerFn(issueFinancialDocument);
  const cancelDoc = useServerFn(cancelFinancialDocument);

  const docsQuery = useQuery({
    queryKey: ["finance", "documents", projectId],
    queryFn: () => fetchDocs({ data: { projectId } }),
  });

  const [docType, setDocType] = React.useState<FinancialDocType>("invoice");
  const [direction, setDirection] = React.useState<FinancialDocDirection>("issued");
  const [docNumber, setDocNumber] = React.useState("");
  const [issueDate, setIssueDate] = React.useState("");
  const [subtotal, setSubtotal] = React.useState("");
  const [taxRate, setTaxRate] = React.useState("");
  const [taxAmount, setTaxAmount] = React.useState("");
  const [referencesId, setReferencesId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [openDoc, setOpenDoc] = React.useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["finance"] });
  };
  const onError = (e: Error) => setError(e.message);

  const createMutation = useMutation({
    mutationFn: () =>
      createDoc({
        data: {
          projectId,
          docType,
          direction,
          docNumber: docNumber.trim() || null,
          issueDate: issueDate || null,
          referencesDocumentId: referencesId || null,
          subtotal: Number(subtotal),
          taxRate: taxRate ? Number(taxRate) : 0,
          taxAmount: taxAmount ? Number(taxAmount) : 0,
          retentionAmount: 0,
        },
      }),
    onSuccess: () => {
      setError(null);
      setDocNumber("");
      setSubtotal("");
      setTaxRate("");
      setTaxAmount("");
      setReferencesId("");
      invalidate();
    },
    onError,
  });

  const issueMutation = useMutation({
    mutationFn: (documentId: string) => issueDoc({ data: { documentId } }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const cancelMutation = useMutation({
    mutationFn: (vars: { documentId: string; reason: string }) => cancelDoc({ data: vars }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const reviseMutation = useMutation({
    mutationFn: (vars: {
      documentId: string;
      changeReason: string;
      subtotal: number;
      taxRate: number;
      taxAmount: number;
      retentionAmount: number;
    }) => reviseDoc({ data: vars }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const docs = docsQuery.data ?? [];
  const notes: FinancialDocType[] = ["credit_note", "debit_note"];

  return (
    <div className="space-y-8">
      <p
        role="note"
        className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
      >
        {t("finance.documents.disclaimer")}
      </p>

      <RakeezCard title={t("finance.documents.new")}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("finance.documents.docType")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={docType}
              onChange={(e) => setDocType(e.target.value as FinancialDocType)}
            >
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`finance.documents.types.${d}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("finance.documents.direction")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={direction}
              onChange={(e) => setDirection(e.target.value as FinancialDocDirection)}
            >
              {DOC_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`finance.documents.directions.${d}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id="fd-number"
            label={t("finance.documents.number")}
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
          />
          <TextField
            id="fd-date"
            label={t("finance.documents.issueDate")}
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
          <TextField
            id="fd-subtotal"
            label={t("finance.documents.subtotal")}
            type="number"
            step="0.01"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            required
          />
          <TextField
            id="fd-taxrate"
            label={t("finance.documents.taxRate")}
            type="number"
            step="0.01"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
          />
          <TextField
            id="fd-taxamount"
            label={t("finance.documents.taxAmount")}
            type="number"
            step="0.01"
            value={taxAmount}
            onChange={(e) => setTaxAmount(e.target.value)}
          />
          {notes.includes(docType) ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">
                {t("finance.documents.referencesDoc")}
              </span>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={referencesId}
                onChange={(e) => setReferencesId(e.target.value)}
                required
              >
                <option value="">—</option>
                {docs
                  .filter((d) => !notes.includes(d.doc_type))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {t(`finance.documents.types.${d.doc_type}`)} {d.doc_number ?? d.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {t("finance.documents.new")}
            </button>
          </div>
        </form>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </RakeezCard>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          {t("finance.documents.title")}
        </h2>
        <AsyncBoundary
          isLoading={docsQuery.isLoading}
          isError={docsQuery.isError}
          onRetry={() => void docsQuery.refetch()}
        >
          {docs.length === 0 ? (
            <EmptyState title={t("finance.documents.empty")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {docs.map((doc) => {
                const current = doc.versions.find((v) => v.is_current) ?? null;
                return (
                  <li key={doc.id} className="space-y-3 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium">
                        {t(`finance.documents.types.${doc.doc_type}`)}{" "}
                        {doc.doc_number ?? doc.id.slice(0, 8)}
                      </span>
                      <span className="text-muted-foreground">
                        {t(`finance.documents.directions.${doc.direction}`)}
                      </span>
                      <span className="text-muted-foreground">
                        {money(current?.total ?? null, current?.currency ?? null, t("finance.masked"))}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                        {t(`finance.documents.status.${doc.status}`)}
                      </span>
                      <button
                        type="button"
                        className="ms-auto min-h-11 rounded-md border border-input px-3"
                        onClick={() => setOpenDoc(openDoc === doc.id ? null : doc.id)}
                      >
                        {t("finance.documents.versions")}
                      </button>
                      {doc.status === "draft" ? (
                        <button
                          type="button"
                          className="min-h-11 rounded-md border border-input px-3"
                          onClick={() => issueMutation.mutate(doc.id)}
                        >
                          {t("finance.documents.issue")}
                        </button>
                      ) : null}
                      {doc.status !== "cancelled" && !doc.amounts_masked ? (
                        <button
                          type="button"
                          className="min-h-11 rounded-md border border-input px-3"
                          onClick={() => {
                            const reason = window.prompt(t("finance.documents.changeReason"));
                            if (!reason || reason.trim().length < 3) return;
                            const value = window.prompt(t("finance.documents.subtotal"));
                            if (!value) return;
                            const tax = window.prompt(t("finance.documents.taxAmount")) ?? "0";
                            reviseMutation.mutate({
                              documentId: doc.id,
                              changeReason: reason.trim(),
                              subtotal: Number(value),
                              taxRate: current?.tax_rate ?? 0,
                              taxAmount: Number(tax || 0),
                              retentionAmount: current?.retention_amount ?? 0,
                            });
                          }}
                        >
                          {t("finance.documents.revise")}
                        </button>
                      ) : null}
                      {doc.status !== "cancelled" ? (
                        <button
                          type="button"
                          className="min-h-11 rounded-md border border-input px-3 text-destructive"
                          onClick={() => {
                            const reason = window.prompt(t("finance.documents.changeReason"));
                            if (reason && reason.trim().length >= 3) {
                              cancelMutation.mutate({ documentId: doc.id, reason: reason.trim() });
                            }
                          }}
                        >
                          {t("finance.documents.cancel")}
                        </button>
                      ) : null}
                    </div>
                    {openDoc === doc.id ? (
                      <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
                        {doc.versions.map((v) => (
                          <li key={v.id} className="flex flex-wrap gap-3">
                            <span className="font-medium">
                              {t("finance.documents.version")} {v.version_no}
                            </span>
                            <span>
                              {money(v.subtotal, v.currency, t("finance.masked"))} +{" "}
                              {money(v.tax_amount, v.currency, t("finance.masked"))} ={" "}
                              {money(v.total, v.currency, t("finance.masked"))}
                            </span>
                            <span className="text-muted-foreground">{v.change_reason ?? "—"}</span>
                            <span className="ms-auto text-muted-foreground">
                              {v.is_current
                                ? t("finance.documents.current")
                                : t("finance.documents.superseded")}
                            </span>
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
