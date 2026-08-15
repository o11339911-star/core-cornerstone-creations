import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 11 — stages, execution and completion.
 * Every rule (status flow, segregation of duties, completion criteria,
 * open nonconformities) is enforced in the database. This layer only shapes data.
 */

export const STAGE_STATUSES = [
  "pending",
  "in_progress",
  "submitted",
  "approved",
  "rework",
  "skipped",
  "done",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_ROLES = ["responsible", "executor", "reviewer", "approver"] as const;
export type StageRole = (typeof STAGE_ROLES)[number];

const stageSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  parent_stage_id: z.string().uuid().nullable(),
  name_ar: z.string(),
  name_en: z.string(),
  order_index: z.number(),
  status: z.enum(STAGE_STATUSES),
  is_required: z.boolean(),
  planned_start: z.string().nullable(),
  planned_end: z.string().nullable(),
  actual_start: z.string().nullable(),
  actual_end: z.string().nullable(),
  submitted_by: z.string().uuid().nullable(),
  submitted_at: z.string().nullable(),
  approved_by: z.string().uuid().nullable(),
  approved_at: z.string().nullable(),
});
export type Stage = z.infer<typeof stageSchema>;

const STAGE_COLUMNS =
  "id, project_id, parent_stage_id, name_ar, name_en, order_index, status, is_required, planned_start, planned_end, actual_start, actual_end, submitted_by, submitted_at, approved_by, approved_at";

export const listStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Stage[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_stages")
      .select(STAGE_COLUMNS)
      .eq("project_id", data.projectId)
      .is("deleted_at", null)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return z.array(stageSchema).parse(rows ?? []);
  });

const roleSchema = z.object({
  id: z.string().uuid(),
  stage_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  entity_id: z.string().uuid().nullable(),
  role: z.enum(STAGE_ROLES),
  status: z.string(),
});
export type StageRoleRow = z.infer<typeof roleSchema>;

export const listStageRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<StageRoleRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("stage_roles")
      .select("id, stage_id, user_id, entity_id, role, status")
      .eq("stage_id", data.stageId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return z.array(roleSchema).parse(rows ?? []);
  });

export const assignStageRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stageId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(STAGE_ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("stage_roles")
      .insert({
        stage_id: data.stageId,
        user_id: data.userId,
        role: data.role,
        assigned_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const criterionSchema = z.object({
  id: z.string().uuid(),
  stage_id: z.string().uuid(),
  code: z.string(),
  label_ar: z.string(),
  label_en: z.string(),
  is_required: z.boolean(),
  evidence_type: z.string(),
});
export type StageCriterion = z.infer<typeof criterionSchema>;

export const listStageCriteria = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stageId: z.string().uuid() }).parse(input))
  .handler(
    async ({ data, context }): Promise<Array<StageCriterion & { satisfied: boolean }>> => {
      const { data: rows, error } = await context.supabase
        .from("stage_completion_criteria")
        .select("id, stage_id, code, label_ar, label_en, is_required, evidence_type")
        .eq("stage_id", data.stageId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const criteria = z.array(criterionSchema).parse(rows ?? []);

      const { data: results } = await context.supabase
        .from("stage_criteria_results")
        .select("criterion_id, satisfied")
        .eq("stage_id", data.stageId);
      const satisfied = new Set(
        (results ?? []).filter((r) => r.satisfied).map((r) => r.criterion_id),
      );
      return criteria.map((c) => ({ ...c, satisfied: satisfied.has(c.id) }));
    },
  );

export const addStageCriterion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stageId: z.string().uuid(),
        code: z.string().trim().min(2).max(60),
        labelAr: z.string().trim().min(2).max(200),
        labelEn: z.string().trim().min(2).max(200),
        isRequired: z.boolean().default(true),
        evidenceType: z.enum(["file", "visit", "checklist", "text"]).default("checklist"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("stage_completion_criteria")
      .insert({
        stage_id: data.stageId,
        code: data.code,
        label_ar: data.labelAr,
        label_en: data.labelEn,
        is_required: data.isRequired,
        evidence_type: data.evidenceType,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const setCriterionResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        criterionId: z.string().uuid(),
        stageId: z.string().uuid(),
        satisfied: z.boolean(),
        note: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("stage_criteria_results").upsert(
      {
        criterion_id: data.criterionId,
        stage_id: data.stageId,
        satisfied: data.satisfied,
        note: data.note ?? null,
        recorded_by: context.userId,
      },
      { onConflict: "criterion_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reportStageProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        stageId: z.string().uuid(),
        percent: z.number().min(0).max(100),
        note: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("stage_progress")
      .insert({
        stage_id: data.stageId,
        percent: data.percent,
        note: data.note ?? null,
        reported_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listStageProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("stage_progress")
      .select("id, percent, note, reported_by, reported_at")
      .eq("stage_id", data.stageId)
      .order("reported_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const startStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("project_stages")
      .update({ status: "in_progress", actual_start: new Date().toISOString().slice(0, 10) })
      .eq("id", data.stageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ stageId: z.string().uuid(), note: z.string().trim().max(2000).nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ submittedAt: string }> => {
    const { data: at, error } = await context.supabase.rpc("submit_stage", {
      _stage_id: data.stageId,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { submittedAt: at as unknown as string };
  });

export const approveStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ stageId: z.string().uuid(), note: z.string().trim().max(2000).nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ approvedAt: string }> => {
    const { data: at, error } = await context.supabase.rpc("approve_stage", {
      _stage_id: data.stageId,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { approvedAt: at as unknown as string };
  });

/** Immutable timeline for a stage, read from the shared audit log. */
export const listStageTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), stageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("permission_audit_log")
      .select("id, object_type, object_id, action, created_at, new_value")
      .eq("target_project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []).filter((r) => {
      const v = r.new_value as Record<string, unknown> | null;
      return r.object_id === data.stageId || v?.["stage_id"] === data.stageId;
    });
  });
