import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/i18n";
import { RakeezCard, TextField, AsyncBoundary, EmptyState } from "@/components/rakeez";
import { listContracts } from "@/lib/contracts.functions";
import { listStages } from "@/lib/stages.functions";
import {
  EXECUTION_METHODS,
  MILESTONE_BASIS,
  approveDisbursementRequest,
  cancelPaymentMilestone,
  createPaymentMilestone,
  executeDisbursement,
  listDisbursementEvidence,
  listDisbursementRequests,
  listEvidenceOptions,
  listFinancialExecutions,
  listPaymentMilestones,
  rejectDisbursementRequest,
  resubmitDisbursementRequest,
  startDisbursementReview,
  submitDisbursementRequest,
  type DisbursementRequest,
  type ExecutionMethod,
  type MilestoneBasis,
  type PaymentMilestone,
} from "@/lib/finance.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/finance")({
  component: FinancePage,
  head: () => ({
    meta: [
      { title: "مالية المشروع ودفعات العقد — ركيز" },
      {
        name: "description",
        content:
          "مراحل الدفع المرتبطة بالعقد ودورة صرف بأربعة فاعلين منفصلين مع إثبات إنجاز وسجل تنفيذ لا يُعدَّل، في منصة ركيز.",
      },
      { property: "og:title", content: "مالية المشروع ودفعات العقد — ركيز" },
      {
        property: "og:description",
        content:
          "سجل تعاقدي ومحاسبي فقط: ركيز لا تحتفظ بأموال ولا تنفّذ تحويلات ولا تقدّم خدمة مالية مرخصة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Never remove: the platform must not look like it holds or moves money. */
function FinanceDisclaimer() {
  const t = useT();
  return (
    <p
      role="note"
      className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
    >
      {t("finance.disclaimer")}
    </p>
  );
}

function money(value: number | null, currency: string | null, maskedLabel: string) {
  if (value === null) return maskedLabel;
  return `${value.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${currency ?? ""}`.trim();
}

function FinancePage() {
  const t = useT();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchMilestones = useServerFn(listPaymentMilestones);
  const fetchContracts = useServerFn(listContracts);
  const fetchStages = useServerFn(listStages);
  const fetchExecutions = useServerFn(listFinancialExecutions);
  const addMilestone = useServerFn(createPaymentMilestone);
  const cancelMilestone = useServerFn(cancelPaymentMilestone);

  const milestonesQuery = useQuery({
    queryKey: ["finance", "milestones", projectId],
    queryFn: () => fetchMilestones({ data: { projectId } }),
  });
  const contractsQuery = useQuery({
    queryKey: ["contracts", projectId],
    queryFn: () => fetchContracts({ data: { projectId } }),
  });
  const stagesQuery = useQuery({
    queryKey: ["stages", projectId],
    queryFn: () => fetchStages({ data: { projectId } }),
  });
  const executionsQuery = useQuery({
    queryKey: ["finance", "executions", projectId],
    queryFn: () => fetchExecutions({ data: { projectId } }),
  });

  const [contractId, setContractId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [percent, setPercent] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [basis, setBasis] = React.useState<MilestoneBasis>("on_stage_approval");
  const [dueDate, setDueDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [openMilestone, setOpenMilestone] = React.useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["finance"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      addMilestone({
        data: {
          contractId,
          titleAr: title.trim(),
          amount: Number(amount),
          stageId: stageId || null,
          basis,
          dueDate: dueDate || null,
          percentOfContract: percent ? Number(percent) : null,
        },
      }),
    onSuccess: () => {
      setError(null);
      setTitle("");
      setAmount("");
      setPercent("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (vars: { milestoneId: string; reason: string }) =>
      cancelMilestone({ data: vars }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const milestones = milestonesQuery.data ?? [];
  const anyMasked = milestones.some((m) => m.amounts_masked);

  const tabs = ["milestones", "documents", "retention", "ledger"] as const;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("finance.title")}</h1>
      </header>

      <FinanceDisclaimer />

      <div role="tablist" aria-label={t("finance.title")} className="mt-6 flex flex-wrap gap-2">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
              tab === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:bg-muted"
            }`}
          >
            {t(`finance.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === "documents" ? <div className="mt-6"><DocumentsTab projectId={projectId} /></div> : null}
      {tab === "retention" ? <div className="mt-6"><RetentionTab projectId={projectId} /></div> : null}
      {tab === "ledger" ? <div className="mt-6"><LedgerTab projectId={projectId} /></div> : null}

      {tab !== "milestones" ? null : (
      <>
      <RakeezCard className="mt-6" title={t("finance.newMilestone")} description={t("finance.sodHint")}>
        <form

          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("finance.contract")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              required
            >
              <option value="">—</option>
              {(contractsQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id="m-title"
            label={t("finance.milestoneTitle")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <TextField
            id="m-amount"
            label={t("finance.amount")}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <TextField
            id="m-percent"
            label={t("finance.percent")}
            type="number"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("finance.stage")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
            >
              <option value="">—</option>
              {(stagesQuery.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("finance.basis")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={basis}
              onChange={(e) => setBasis(e.target.value as MilestoneBasis)}
            >
              {MILESTONE_BASIS.map((b) => (
                <option key={b} value={b}>
                  {t(`finance.basisOptions.${b}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id="m-due"
            label={t("finance.dueDate")}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {t("finance.newMilestone")}
            </button>
          </div>
        </form>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </RakeezCard>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("finance.milestones")}</h2>
        {anyMasked ? (
          <p className="mb-2 text-xs text-muted-foreground">{t("finance.maskedHint")}</p>
        ) : null}
        <AsyncBoundary
          isLoading={milestonesQuery.isLoading}
          isError={milestonesQuery.isError}
          onRetry={() => void milestonesQuery.refetch()}
        >
          {milestones.length === 0 ? (
            <EmptyState title={t("finance.emptyMilestones")} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {milestones.map((m) => (
                <li key={m.id} className="space-y-3 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">
                      {m.seq}. {m.title_ar}
                    </span>
                    <span className="text-muted-foreground">
                      {money(m.amount, m.currency, t("finance.masked"))}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {t(`finance.milestoneStatus.${m.status}`)}
                    </span>
                    <button
                      type="button"
                      className="ms-auto min-h-11 rounded-md border border-input px-3"
                      onClick={() => setOpenMilestone(openMilestone === m.id ? null : m.id)}
                    >
                      {t("finance.requests")}
                    </button>
                    {m.status !== "settled" && m.status !== "cancelled" ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-md border border-input px-3 text-destructive"
                        onClick={() => {
                          const reason = window.prompt(t("finance.cancelReason"));
                          if (reason && reason.trim().length >= 3) {
                            cancelMutation.mutate({ milestoneId: m.id, reason: reason.trim() });
                          }
                        }}
                      >
                        {t("finance.cancelMilestone")}
                      </button>
                    ) : null}
                  </div>
                  {openMilestone === m.id ? (
                    <MilestoneRequests milestone={m} projectId={projectId} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("finance.executions")}</h2>
        {(executionsQuery.data ?? []).length === 0 ? (
          <EmptyState title={t("finance.emptyRequests")} />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(executionsQuery.data ?? []).map((x) => (
              <li key={x.id} className="flex flex-wrap gap-3 p-3 text-sm">
                <span>{t(`finance.methods.${x.method}`)}</span>
                <span className="text-muted-foreground">{x.external_reference ?? "—"}</span>
                <span className="ms-auto text-muted-foreground">
                  {String(x.executed_at).slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MilestoneRequests({
  milestone,
  projectId,
}: {
  milestone: PaymentMilestone;
  projectId: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();

  const fetchRequests = useServerFn(listDisbursementRequests);
  const fetchOptions = useServerFn(listEvidenceOptions);
  const submitFn = useServerFn(submitDisbursementRequest);
  const resubmitFn = useServerFn(resubmitDisbursementRequest);

  const requestsQuery = useQuery({
    queryKey: ["finance", "requests", milestone.id],
    queryFn: () => fetchRequests({ data: { projectId, milestoneId: milestone.id } }),
  });
  const optionsQuery = useQuery({
    queryKey: ["finance", "evidence-options", projectId],
    queryFn: () => fetchOptions({ data: { projectId } }),
  });

  const [gross, setGross] = React.useState("");
  const [retention, setRetention] = React.useState("0");
  const [evidenceKind, setEvidenceKind] = React.useState<"stage_progress" | "site_visit">(
    "stage_progress",
  );
  const [evidenceId, setEvidenceId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["finance"] });

  const submitMutation = useMutation({
    mutationFn: (rejectedId: string | null) => {
      const payload = {
        grossAmount: Number(gross),
        retentionAmount: Number(retention || 0),
        note: note.trim() || null,
        evidence: [{ kind: evidenceKind, id: evidenceId }],
      };
      return rejectedId
        ? resubmitFn({ data: { rejectedRequestId: rejectedId, ...payload } })
        : submitFn({ data: { milestoneId: milestone.id, ...payload } });
    },
    onSuccess: () => {
      setError(null);
      setGross("");
      setNote("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const options =
    evidenceKind === "stage_progress"
      ? (optionsQuery.data?.progress ?? [])
      : (optionsQuery.data?.visits ?? []);

  const requests = requestsQuery.data ?? [];
  const lastRejected = requests.find((r) => r.status === "rejected");
  const hasOpen = requests.some((r) =>
    ["submitted", "under_review", "approved"].includes(r.status),
  );
  const canRequest = !hasOpen && milestone.status !== "settled" && milestone.status !== "cancelled";

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      {canRequest ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!evidenceId) {
              setError(t("finance.evidenceRequired"));
              return;
            }
            submitMutation.mutate(lastRejected ? lastRejected.id : null);
          }}
        >
          <TextField
            id={`g-${milestone.id}`}
            label={t("finance.gross")}
            type="number"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            required
          />
          <TextField
            id={`r-${milestone.id}`}
            label={t("finance.retention")}
            type="number"
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t("finance.evidence")}</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={evidenceKind}
              onChange={(e) => {
                setEvidenceKind(e.target.value as "stage_progress" | "site_visit");
                setEvidenceId("");
              }}
            >
              <option value="stage_progress">{t("finance.evidenceProgress")}</option>
              <option value="site_visit">{t("finance.evidenceVisit")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">—</span>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={evidenceId}
              onChange={(e) => setEvidenceId(e.target.value)}
              required
            >
              <option value="">—</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <TextField
            id={`n-${milestone.id}`}
            label={t("finance.note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {lastRejected ? t("finance.resubmit") : t("finance.newRequest")}
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <ul className="mt-4 space-y-3">
        {requests.length === 0 ? (
          <li className="text-sm text-muted-foreground">{t("finance.emptyRequests")}</li>
        ) : null}
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} onChanged={invalidate} />
        ))}
      </ul>
    </div>
  );
}

function RequestRow({
  request,
  onChanged,
}: {
  request: DisbursementRequest;
  onChanged: () => void;
}) {
  const t = useT();
  const reviewFn = useServerFn(startDisbursementReview);
  const approveFn = useServerFn(approveDisbursementRequest);
  const rejectFn = useServerFn(rejectDisbursementRequest);
  const executeFn = useServerFn(executeDisbursement);
  const fetchEvidence = useServerFn(listDisbursementEvidence);

  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<ExecutionMethod>("bank_transfer_offline");
  const [reference, setReference] = React.useState("");

  const evidenceQuery = useQuery({
    queryKey: ["finance", "evidence", request.id],
    queryFn: () => fetchEvidence({ data: { requestId: request.id } }),
  });

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    setInfo(null);
    void fn()
      .then((res) => {
        const dedup =
          typeof res === "object" && res !== null && "deduplicated" in res
            ? Boolean((res as { deduplicated: boolean }).deduplicated)
            : false;
        if (dedup) setInfo(t("finance.executedAlready"));
        onChanged();
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <li className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-border px-2 py-0.5 text-xs">
          {t(`finance.requestStatus.${request.status}`)}
        </span>
        <span>
          {t("finance.gross")}: {money(request.gross_amount, request.currency, t("finance.masked"))}
        </span>
        <span>
          {t("finance.net")}: {money(request.net_amount, request.currency, t("finance.masked"))}
        </span>
        <span className="text-muted-foreground">
          {t("finance.evidence")}: {(evidenceQuery.data ?? []).length}
        </span>
      </div>

      {request.reason_text ? (
        <p className="mt-2 text-xs text-destructive">{request.reason_text}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {request.status === "submitted" ? (
          <button
            type="button"
            className="min-h-11 rounded-md border border-input px-3"
            onClick={() => run(() => reviewFn({ data: { requestId: request.id } }))}
          >
            {t("finance.startReview")}
          </button>
        ) : null}
        {request.status === "under_review" ? (
          <button
            type="button"
            className="min-h-11 rounded-md bg-primary px-3 text-primary-foreground"
            onClick={() => run(() => approveFn({ data: { requestId: request.id } }))}
          >
            {t("finance.approve")}
          </button>
        ) : null}
        {["submitted", "under_review", "approved"].includes(request.status) ? (
          <button
            type="button"
            className="min-h-11 rounded-md border border-input px-3 text-destructive"
            onClick={() => {
              const reason = window.prompt(t("finance.rejectReason"));
              if (reason && reason.trim().length >= 3) {
                run(() => rejectFn({ data: { requestId: request.id, reason: reason.trim() } }));
              }
            }}
          >
            {t("finance.reject")}
          </button>
        ) : null}
        {request.status === "approved" ? (
          <>
            <select
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as ExecutionMethod)}
              aria-label={t("finance.method")}
            >
              {EXECUTION_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`finance.methods.${m}`)}
                </option>
              ))}
            </select>
            <input
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              placeholder={t("finance.externalReference")}
              aria-label={t("finance.externalReference")}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <button
              type="button"
              className="min-h-11 rounded-md bg-primary px-3 text-primary-foreground"
              onClick={() =>
                run(() =>
                  executeFn({
                    data: {
                      requestId: request.id,
                      method,
                      externalReference: reference.trim() || null,
                    },
                  }),
                )
              }
            >
              {t("finance.execute")}
            </button>
            <p className="w-full text-xs text-muted-foreground">{t("finance.executeHint")}</p>
          </>
        ) : null}
      </div>

      {info ? <p className="mt-2 text-xs text-muted-foreground">{info}</p> : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </li>
  );
}
