import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 26 — data subject rights, processing register, DPIA and incidents.
 *
 * Every mutation is a thin wrapper over a guarded SECURITY DEFINER function
 * that re-checks `auth.uid()` and the `privacy` module permission internally.
 * Erasure is never blind: `evaluate_erasure_constraints` returns the concrete
 * legal reasons that prevent full deletion.
 */

const uuid = z.string().uuid();

export const DSR_KINDS = ["access", "rectification", "erasure", "export"] as const;

export const dsrRequestSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  kind: z.string(),
  status: z.string(),
  details_ar: z.string(),
  identity_verified_at: z.string().nullable(),
  identity_method: z.string().nullable(),
  decision_ar: z.string().nullable(),
  restriction_reasons: z.array(z.string()).nullable(),
  result_ref: z.record(z.string(), z.any()).nullable(),
  queue_item_id: z.string().uuid().nullable(),
  due_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DsrRequest = z.infer<typeof dsrRequestSchema>;

export const dsrEventSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  from_status: z.string().nullable(),
  to_status: z.string(),
  actor_id: z.string().uuid().nullable(),
  note_ar: z.string().nullable(),
  created_at: z.string(),
});
export type DsrEvent = z.infer<typeof dsrEventSchema>;

export const erasureEvaluationSchema = z.object({
  user_id: z.string().uuid(),
  can_fully_erase: z.boolean(),
  reasons: z.array(z.string()).default([]),
  counts: z.record(z.string(), z.number()).default({}),
});
export type ErasureEvaluation = z.infer<typeof erasureEvaluationSchema>;

export const processingActivitySchema = z.object({
  id: z.string().uuid(),
  activity_code: z.string(),
  module: z.string(),
  activity_ar: z.string(),
  purpose_ar: z.string(),
  legal_basis_ar: z.string(),
  data_categories: z.array(z.string()).default([]),
  subject_categories: z.array(z.string()).default([]),
  recipients: z.array(z.string()).default([]),
  retention_period_ar: z.string(),
  retention_months: z.number().nullable(),
  deletion_mechanism_ar: z.string().nullable(),
  backing_objects: z.array(z.string()).default([]),
  cross_border: z.boolean(),
});
export type ProcessingActivity = z.infer<typeof processingActivitySchema>;

export const dpiaControlSchema = z.object({
  id: z.string().uuid(),
  control_type: z.string(),
  object_name: z.string(),
  description_ar: z.string(),
  effectiveness_ar: z.string().nullable(),
});

export const dpiaEntrySchema = z.object({
  id: z.string().uuid(),
  module: z.string(),
  scope_code: z.string(),
  scope_ar: z.string(),
  risk_level: z.string(),
  risks: z.array(z.object({ risk: z.string(), impact: z.string().optional() })).default([]),
  residual_risk_ar: z.string().nullable(),
  assessed_at: z.string().nullable(),
  review_due_at: z.string().nullable(),
  controls: dpiaControlSchema.array().default([]),
});
export type DpiaEntry = z.infer<typeof dpiaEntrySchema>;

export const dataIncidentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  severity: z.string(),
  detected_at: z.string(),
  contained_at: z.string().nullable(),
  affected_scope_ar: z.string().nullable(),
  data_categories: z.array(z.string()).nullable(),
  subjects_estimate: z.number().nullable(),
  root_cause_ar: z.string().nullable(),
  notification_required: z.boolean(),
  authority_notified_at: z.string().nullable(),
  subjects_notified_at: z.string().nullable(),
  status: z.string(),
  lessons_ar: z.string().nullable(),
  created_at: z.string(),
});
export type DataIncident = z.infer<typeof dataIncidentSchema>;

/* ------------------------------------------------------------- my rights */

export const submitDsrRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ kind: z.enum(DSR_KINDS), detailsAr: z.string().trim().min(10).max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("submit_dsr_request", {
      _kind: data.kind,
      _details_ar: data.detailsAr,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const listMyDsrRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DsrRequest[]> => {
    const { data, error } = await context.supabase.rpc("list_my_dsr_requests");
    if (error) throw new Error(error.message);
    return dsrRequestSchema.array().parse(data ?? []);
  });

export const listDsrEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<DsrEvent[]> => {
    const { data: rows, error } = await context.supabase.rpc("list_dsr_events", {
      _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);
    return dsrEventSchema.array().parse(rows ?? []);
  });

export const evaluateMyErasure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ErasureEvaluation> => {
    const { data, error } = await context.supabase.rpc("evaluate_erasure_constraints", {});
    if (error) throw new Error(error.message);
    return erasureEvaluationSchema.parse(data);
  });

export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, any>> => {
    const { data, error } = await context.supabase.rpc("export_my_data");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, any>;
  });

/* ------------------------------------------------------- transparency */

export const listProcessingRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProcessingActivity[]> => {
    const { data, error } = await context.supabase.rpc("list_processing_register");
    if (error) throw new Error(error.message);
    return processingActivitySchema.array().parse(data ?? []);
  });

export const listDpiaRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DpiaEntry[]> => {
    const { data, error } = await context.supabase.rpc("list_dpia_register");
    if (error) throw new Error(error.message);
    return dpiaEntrySchema.array().parse(data ?? []);
  });

/* --------------------------------------------------------- privacy staff */

export const listDsrRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<DsrRequest[]> => {
    const { data: rows, error } = await context.supabase.rpc("list_dsr_requests", {
      ...(data.status ? { _status: data.status } : {}),
    });
    if (error) throw new Error(error.message);
    return dsrRequestSchema.array().parse(rows ?? []);
  });

export const verifyDsrIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: uuid,
        method: z.string().trim().min(3).max(120),
        noteAr: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("verify_dsr_identity", {
      _request_id: data.requestId,
      _method: data.method,
      ...(data.noteAr ? { _note_ar: data.noteAr } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideDsrRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: uuid,
        outcome: z.enum(["fulfilled", "partially_fulfilled", "rejected"]),
        decisionAr: z.string().trim().min(5).max(2000),
        restrictions: z.array(z.string().trim().min(3)).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("decide_dsr_request", {
      _request_id: data.requestId,
      _outcome: data.outcome,
      _decision_ar: data.decisionAr,
      _restrictions: data.restrictions,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const evaluateErasureFor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<ErasureEvaluation> => {
    const { data: row, error } = await context.supabase.rpc("evaluate_erasure_constraints", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return erasureEvaluationSchema.parse(row);
  });

export const listDataIncidents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DataIncident[]> => {
    const { data, error } = await context.supabase.rpc("list_data_incidents");
    if (error) throw new Error(error.message);
    return dataIncidentSchema.array().parse(data ?? []);
  });

export const reportDataIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(5).max(200),
        severity: z.enum(["low", "medium", "high", "critical"]),
        detectedAt: z.string(),
        affectedScopeAr: z.string().trim().min(5).max(2000),
        dataCategories: z.array(z.string()).default([]),
        subjectsEstimate: z.number().int().nonnegative().optional(),
        rootCauseAr: z.string().trim().max(2000).optional(),
        notificationRequired: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("report_data_incident", {
      _title: data.title,
      _severity: data.severity,
      _detected_at: data.detectedAt,
      _affected_scope_ar: data.affectedScopeAr,
      _data_categories: data.dataCategories,
      ...(data.subjectsEstimate !== undefined
        ? { _subjects_estimate: data.subjectsEstimate }
        : {}),
      ...(data.rootCauseAr ? { _root_cause_ar: data.rootCauseAr } : {}),
      _notification_required: data.notificationRequired,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const updateDataIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        incidentId: uuid,
        status: z.string().optional(),
        containedAt: z.string().optional(),
        authorityNotifiedAt: z.string().optional(),
        subjectsNotifiedAt: z.string().optional(),
        lessonsAr: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_data_incident", {
      _incident_id: data.incidentId,
      ...(data.status ? { _status: data.status } : {}),
      ...(data.containedAt ? { _contained_at: data.containedAt } : {}),
      ...(data.authorityNotifiedAt ? { _authority_notified_at: data.authorityNotifiedAt } : {}),
      ...(data.subjectsNotifiedAt ? { _subjects_notified_at: data.subjectsNotifiedAt } : {}),
      ...(data.lessonsAr ? { _lessons_ar: data.lessonsAr } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
