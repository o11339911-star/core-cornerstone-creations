import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 18 — acceptance, punch list and project closure.
 *
 * Every write goes through a guarded SECURITY DEFINER function in the
 * database; these server functions only read through RLS or call those RPCs.
 */

const acceptanceSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  phase: z.string(),
  status: z.string(),
  requested_by: z.string().uuid(),
  requested_at: z.string(),
  inspected_by: z.string().uuid().nullable(),
  inspected_at: z.string().nullable(),
  decided_by: z.string().uuid().nullable(),
  decided_at: z.string().nullable(),
  decision_note: z.string().nullable(),
});
export type ProjectAcceptance = z.infer<typeof acceptanceSchema>;

const ACCEPTANCE_COLUMNS =
  "id, project_id, phase, status, requested_by, requested_at, inspected_by, inspected_at, decided_by, decided_at, decision_note";

export const listAcceptances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ProjectAcceptance[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_acceptances")
      .select(ACCEPTANCE_COLUMNS)
      .eq("project_id", data.projectId)
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(acceptanceSchema).parse(rows ?? []);
  });

const closureItemSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  code: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  phase: z.string(),
  is_required: z.boolean(),
  status: z.string(),
  waiver_reason: z.string().nullable(),
  satisfied_at: z.string().nullable(),
});
export type ClosureItem = z.infer<typeof closureItemSchema>;

export const listClosureItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ClosureItem[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_closure_items")
      .select(
        "id, project_id, code, name_ar, name_en, phase, is_required, status, waiver_reason, satisfied_at",
      )
      .eq("project_id", data.projectId)
      .order("phase", { ascending: true })
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return z.array(closureItemSchema).parse(rows ?? []);
  });

const punchSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  severity: z.string(),
  status: z.string(),
  raised_at: z.string(),
  due_at: z.string().nullable(),
  assigned_user_id: z.string().uuid().nullable(),
  closed_by: z.string().uuid().nullable(),
});
export type PunchItem = z.infer<typeof punchSchema>;

export const listPunchItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PunchItem[]> => {
    const { data: rows, error } = await context.supabase
      .from("punch_items")
      .select(
        "id, project_id, title, description, severity, status, raised_at, due_at, assigned_user_id, closed_by",
      )
      .eq("project_id", data.projectId)
      .order("raised_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(punchSchema).parse(rows ?? []);
  });

const reopenSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  reason: z.string(),
  status: z.string(),
  requested_by: z.string().uuid(),
  requested_at: z.string(),
  decided_by: z.string().uuid().nullable(),
  decided_at: z.string().nullable(),
  decision_note: z.string().nullable(),
});
export type ReopenRequest = z.infer<typeof reopenSchema>;

export const listReopenRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ReopenRequest[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_reopen_requests")
      .select(
        "id, project_id, reason, status, requested_by, requested_at, decided_by, decided_at, decision_note",
      )
      .eq("project_id", data.projectId)
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(reopenSchema).parse(rows ?? []);
  });

export const requestAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        phase: z.enum(["provisional", "final"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("request_acceptance", {
      _project_id: data.projectId,
      _phase: data.phase,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const recordAcceptanceInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        acceptanceId: z.string().uuid(),
        note: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("record_acceptance_inspection", {
      _acceptance_id: data.acceptanceId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        acceptanceId: z.string().uuid(),
        decision: z.enum(["accepted", "accepted_with_defects", "rejected"]),
        note: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("decide_acceptance", {
      _acceptance_id: data.acceptanceId,
      _decision: data.decision,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setClosureItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        status: z.enum(["pending", "satisfied", "waived"]),
        documentId: z.string().uuid().nullable().default(null),
        reason: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_closure_item_status", {
      _item_id: data.itemId,
      _status: data.status,
      ...(data.documentId ? { _document_id: data.documentId } : {}),
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const raisePunchItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(3).max(200),
        description: z.string().max(2000).nullable().default(null),
        severity: z.enum(["minor", "major", "critical"]).default("minor"),
        acceptanceId: z.string().uuid().nullable().default(null),
        assignedUserId: z.string().uuid().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("raise_punch_item", {
      _project_id: data.projectId,
      _title: data.title,
      _severity: data.severity,
      ...(data.description ? { _description: data.description } : {}),
      ...(data.acceptanceId ? { _acceptance_id: data.acceptanceId } : {}),
      ...(data.assignedUserId ? { _assigned_user_id: data.assignedUserId } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const addPunchEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        kind: z.enum(["before", "after"]),
        documentId: z.string().uuid(),
        note: z.string().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("add_punch_evidence", {
      _item_id: data.itemId,
      _kind: data.kind,
      _document_id: data.documentId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const setPunchItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        status: z.enum(["open", "in_progress", "submitted", "verified", "rejected", "closed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_punch_item_status", {
      _item_id: data.itemId,
      _status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        note: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("close_project", {
      _project_id: data.projectId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestProjectReopen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        reason: z.string().min(10).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("request_project_reopen", {
      _project_id: data.projectId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const decideProjectReopen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("decide_project_reopen", {
      _request_id: data.requestId,
      _approve: data.approve,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
