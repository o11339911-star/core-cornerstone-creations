import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 16-A — payment milestones and the disbursement cycle.
 *
 * Rakeez keeps a contractual record only: it does not hold funds, does not
 * move money, and is not a licensed financial service. Every rule
 * (status flow, segregation of duties, evidence, idempotency, settlement)
 * is enforced in the database. This layer only shapes data for the UI.
 */

export const MILESTONE_STATUSES = [
  "planned",
  "claimable",
  "claimed",
  "settled",
  "cancelled",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_BASIS = ["on_stage_approval", "on_date", "manual"] as const;
export type MilestoneBasis = (typeof MILESTONE_BASIS)[number];

export const DISBURSEMENT_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "executed",
  "cancelled",
] as const;
export type DisbursementStatus = (typeof DISBURSEMENT_STATUSES)[number];

export const EXECUTION_METHODS = ["bank_transfer_offline", "cheque", "other"] as const;
export type ExecutionMethod = (typeof EXECUTION_METHODS)[number];

const amountSchema = z.object({
  amount: z.union([z.number(), z.string()]).nullable(),
  currency: z.string().nullable(),
  percent_of_contract: z.union([z.number(), z.string()]).nullable(),
});

const milestoneSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  project_id: z.string().uuid(),
  stage_id: z.string().uuid().nullable(),
  seq: z.number(),
  title_ar: z.string(),
  title_en: z.string().nullable(),
  basis: z.enum(MILESTONE_BASIS),
  due_date: z.string().nullable(),
  status: z.enum(MILESTONE_STATUSES),
  cancel_reason: z.string().nullable(),
});

export type PaymentMilestone = z.infer<typeof milestoneSchema> & {
  /** null means: you may see the milestone, but not its money. */
  amount: number | null;
  currency: string | null;
  percent_of_contract: number | null;
  amounts_masked: boolean;
};

/** Drops undefined keys so optional RPC args stay truly absent. */
const rpcArgs = <T,>(value: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export const listPaymentMilestones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        contractId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PaymentMilestone[]> => {
    let query = context.supabase
      .from("payment_milestones")
      .select(
        "id, contract_id, project_id, stage_id, seq, title_ar, title_en, basis, due_date, status, cancel_reason",
      )
      .eq("project_id", data.projectId)
      .order("seq", { ascending: true });
    if (data.contractId) query = query.eq("contract_id", data.contractId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const milestones = z.array(milestoneSchema).parse(rows ?? []);
    if (milestones.length === 0) return [];

    // A separate, finance-gated read: absent rows mean the amounts are hidden.
    const { data: amountRows } = await context.supabase
      .from("payment_milestone_amounts")
      .select("milestone_id, amount, currency, percent_of_contract")
      .in(
        "milestone_id",
        milestones.map((m) => m.id),
      );
    const amounts = new Map(
      (amountRows ?? []).map((row) => [row.milestone_id, amountSchema.parse(row)]),
    );

    return milestones.map((m) => {
      const money = amounts.get(m.id);
      return {
        ...m,
        amount: money ? toNumber(money.amount) : null,
        currency: money?.currency ?? null,
        percent_of_contract: money ? toNumber(money.percent_of_contract) : null,
        amounts_masked: !money,
      };
    });
  });

const requestSchema = z.object({
  id: z.string().uuid(),
  milestone_id: z.string().uuid(),
  contract_id: z.string().uuid(),
  project_id: z.string().uuid(),
  stage_id: z.string().uuid().nullable(),
  status: z.enum(DISBURSEMENT_STATUSES),
  note: z.string().nullable(),
  reason_text: z.string().nullable(),
  resubmitted_from: z.string().uuid().nullable(),
  requested_by: z.string().uuid(),
  requested_at: z.string(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  approved_by: z.string().uuid().nullable(),
  approved_at: z.string().nullable(),
  rejected_by: z.string().uuid().nullable(),
  rejected_at: z.string().nullable(),
  executed_by: z.string().uuid().nullable(),
  executed_at: z.string().nullable(),
});

export type DisbursementRequest = z.infer<typeof requestSchema> & {
  gross_amount: number | null;
  retention_amount: number | null;
  net_amount: number | null;
  currency: string | null;
  amounts_masked: boolean;
};

const REQUEST_COLUMNS =
  "id, milestone_id, contract_id, project_id, stage_id, status, note, reason_text, resubmitted_from, requested_by, requested_at, reviewed_by, reviewed_at, approved_by, approved_at, rejected_by, rejected_at, executed_by, executed_at";

export const listDisbursementRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        milestoneId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DisbursementRequest[]> => {
    let query = context.supabase
      .from("disbursement_requests")
      .select(REQUEST_COLUMNS)
      .eq("project_id", data.projectId)
      .order("requested_at", { ascending: false });
    if (data.milestoneId) query = query.eq("milestone_id", data.milestoneId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const requests = z.array(requestSchema).parse(rows ?? []);
    if (requests.length === 0) return [];

    const { data: amountRows } = await context.supabase
      .from("disbursement_request_amounts")
      .select("request_id, gross_amount, retention_amount, net_amount, currency")
      .in(
        "request_id",
        requests.map((r) => r.id),
      );
    const amounts = new Map((amountRows ?? []).map((row) => [row.request_id, row]));

    return requests.map((r) => {
      const money = amounts.get(r.id);
      return {
        ...r,
        gross_amount: money ? toNumber(money.gross_amount) : null,
        retention_amount: money ? toNumber(money.retention_amount) : null,
        net_amount: money ? toNumber(money.net_amount) : null,
        currency: money?.currency ?? null,
        amounts_masked: !money,
      };
    });
  });

const evidenceSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  kind: z.enum(["stage_progress", "site_visit", "document"]),
  stage_progress_id: z.string().uuid().nullable(),
  site_visit_id: z.string().uuid().nullable(),
  document_id: z.string().uuid().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type DisbursementEvidence = z.infer<typeof evidenceSchema>;

export const listDisbursementEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DisbursementEvidence[]> => {
    const { data: rows, error } = await context.supabase
      .from("disbursement_evidence")
      .select("id, request_id, kind, stage_progress_id, site_visit_id, document_id, note, created_at")
      .eq("request_id", data.requestId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return z.array(evidenceSchema).parse(rows ?? []);
  });

const executionSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  milestone_id: z.string().uuid(),
  idempotency_key: z.string(),
  method: z.enum(EXECUTION_METHODS),
  external_reference: z.string().nullable(),
  note: z.string().nullable(),
  executed_by: z.string().uuid(),
  executed_at: z.string(),
});
export type FinancialExecution = z.infer<typeof executionSchema>;

export const listFinancialExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<FinancialExecution[]> => {
    const { data: rows, error } = await context.supabase
      .from("financial_executions")
      .select(
        "id, request_id, milestone_id, idempotency_key, method, external_reference, note, executed_by, executed_at",
      )
      .eq("project_id", data.projectId)
      .order("executed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(executionSchema).parse(rows ?? []);
  });

/** Evidence the requester can attach: existing progress reports and site visits. */
export const listEvidenceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: stages } = await context.supabase
      .from("project_stages")
      .select("id, name_ar")
      .eq("project_id", data.projectId)
      .is("deleted_at", null);
    const stageIds = (stages ?? []).map((s) => s.id);
    const stageNames = new Map((stages ?? []).map((s) => [s.id, s.name_ar]));

    const progress = stageIds.length
      ? ((
          await context.supabase
            .from("stage_progress")
            .select("id, stage_id, percent, reported_at")
            .in("stage_id", stageIds)
            .order("reported_at", { ascending: false })
            .limit(50)
        ).data ?? [])
      : [];

    const visits =
      (
        await context.supabase
          .from("site_visits")
          .select("id, summary, visit_start")
          .eq("project_id", data.projectId)
          .order("visit_start", { ascending: false })
          .limit(50)
      ).data ?? [];

    return {
      progress: progress.map((p) => ({
        id: p.id,
        label: `${stageNames.get(p.stage_id) ?? ""} — ${Number(p.percent)}%`,
      })),
      visits: visits.map((v) => ({
        id: v.id,
        label: `${v.summary ?? ""} — ${String(v.visit_start).slice(0, 10)}`,
      })),
    };
  });

const evidenceInput = z
  .array(
    z.object({
      kind: z.enum(["stage_progress", "site_visit", "document"]),
      id: z.string().uuid(),
      note: z.string().trim().max(500).optional(),
    }),
  )
  .min(1);

export const createPaymentMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contractId: z.string().uuid(),
        titleAr: z.string().trim().min(2).max(200),
        titleEn: z.string().trim().max(200).nullable().optional(),
        amount: z.number().nonnegative(),
        stageId: z.string().uuid().nullable().optional(),
        basis: z.enum(MILESTONE_BASIS).default("on_stage_approval"),
        dueDate: z.string().nullable().optional(),
        percentOfContract: z.number().positive().max(100).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc("create_payment_milestone", rpcArgs({
      _contract_id: data.contractId,
      _title_ar: data.titleAr,
      _amount: data.amount,
      _stage_id: data.stageId ?? undefined,
      _title_en: data.titleEn ?? undefined,
      _basis: data.basis,
      _due_date: data.dueDate || undefined,
      _percent_of_contract: data.percentOfContract ?? undefined,
    }));
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

export const cancelPaymentMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        milestoneId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("cancel_payment_milestone", {
      _milestone_id: data.milestoneId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitDisbursementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        milestoneId: z.string().uuid(),
        grossAmount: z.number().positive(),
        retentionAmount: z.number().nonnegative().default(0),
        note: z.string().trim().max(1000).nullable().optional(),
        evidence: evidenceInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc("submit_disbursement_request", rpcArgs({
      _milestone_id: data.milestoneId,
      _gross_amount: data.grossAmount,
      _evidence: data.evidence,
      _retention_amount: data.retentionAmount,
      _note: data.note ?? undefined,
    }));
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

export const resubmitDisbursementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rejectedRequestId: z.string().uuid(),
        grossAmount: z.number().positive(),
        retentionAmount: z.number().nonnegative().default(0),
        note: z.string().trim().max(1000).nullable().optional(),
        evidence: evidenceInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc("resubmit_disbursement_request", rpcArgs({
      _rejected_request_id: data.rejectedRequestId,
      _gross_amount: data.grossAmount,
      _evidence: data.evidence,
      _retention_amount: data.retentionAmount,
      _note: data.note ?? undefined,
    }));
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

export const startDisbursementReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("start_disbursement_review", rpcArgs({
      _request_id: data.requestId,
      _note: data.note ?? undefined,
    }));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveDisbursementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("approve_disbursement_request", rpcArgs({
      _request_id: data.requestId,
      _note: data.note ?? undefined,
    }));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectDisbursementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("reject_disbursement_request", {
      _request_id: data.requestId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * The only step that settles anything. The idempotency key is derived from the
 * request id on the server, so a double click or a retried call can never
 * produce a second execution record.
 */
export const executeDisbursement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        method: z.enum(EXECUTION_METHODS).default("bank_transfer_offline"),
        externalReference: z.string().trim().max(200).nullable().optional(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ executionId: string; deduplicated: boolean }> => {
      const { data: result, error } = await context.supabase.rpc("execute_disbursement", rpcArgs({
        _request_id: data.requestId,
        _idempotency_key: `exec:${data.requestId}`,
        _method: data.method,
        _external_reference: data.externalReference ?? undefined,
        _note: data.note ?? undefined,
      }));
      if (error) throw new Error(error.message);
      const parsed = z
        .object({ execution_id: z.string().uuid(), deduplicated: z.boolean() })
        .parse(result);
      return { executionId: parsed.execution_id, deduplicated: parsed.deduplicated };
    },
  );
