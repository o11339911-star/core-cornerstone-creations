import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 11 — field visits, observations, corrective actions and re-inspection.
 * Exact coordinates are stored in a separate table and only with explicit consent;
 * masking and segregation of duties are enforced by the database.
 */

export const VISIT_REASONS = ["inspection", "handover", "incident", "other"] as const;
export const OBSERVATION_KINDS = ["note", "nonconformity"] as const;
export const OBSERVATION_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const OBSERVATION_STATUSES = [
  "open",
  "action_assigned",
  "action_done",
  "reinspection",
  "closed",
] as const;

const visitSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  stage_id: z.string().uuid().nullable(),
  visited_by: z.string().uuid(),
  visit_start: z.string(),
  visit_end: z.string().nullable(),
  summary: z.string().nullable(),
  location_consent: z.boolean(),
  location_reason: z.enum(VISIT_REASONS).nullable(),
  status: z.string(),
});
export type SiteVisit = z.infer<typeof visitSchema>;

const VISIT_COLUMNS =
  "id, project_id, stage_id, visited_by, visit_start, visit_end, summary, location_consent, location_reason, status";

export const listVisits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SiteVisit[]> => {
    const { data: rows, error } = await context.supabase
      .from("site_visits")
      .select(VISIT_COLUMNS)
      .eq("project_id", data.projectId)
      .order("visit_start", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(visitSchema).parse(rows ?? []);
  });

export const createVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        stageId: z.string().uuid().nullable().optional(),
        summary: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  // A visit never records a new location: the project's saved precise location
  // is the single source, so no coordinate or consent is collected here.
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: visit, error } = await context.supabase
      .from("site_visits")
      .insert({
        project_id: data.projectId,
        stage_id: data.stageId ?? null,
        visited_by: context.userId,
        summary: data.summary ?? null,
        location_consent: false,
        location_reason: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: visit.id };
  });

/** Returns null when the caller may not see exact coordinates. */
export const getVisitLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ visitId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ lat: number; lng: number } | null> => {
    const { data: row } = await context.supabase
      .from("site_visit_locations")
      .select("lat, lng")
      .eq("visit_id", data.visitId)
      .maybeSingle();
    if (!row) return null;
    return { lat: Number(row.lat), lng: Number(row.lng) };
  });

const observationSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  visit_id: z.string().uuid().nullable(),
  kind: z.enum(OBSERVATION_KINDS),
  severity: z.enum(OBSERVATION_SEVERITIES),
  title: z.string(),
  body: z.string().nullable(),
  status: z.enum(OBSERVATION_STATUSES),
  due_on: z.string().nullable(),
  closed_at: z.string().nullable(),
  created_at: z.string(),
});
export type Observation = z.infer<typeof observationSchema>;

export const listObservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Observation[]> => {
    const { data: rows, error } = await context.supabase
      .from("stage_observations")
      .select(
        "id, project_id, stage_id, visit_id, kind, severity, title, body, status, due_on, closed_at, created_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(observationSchema).parse(rows ?? []);
  });

export const createObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        stageId: z.string().uuid(),
        visitId: z.string().uuid().nullable().optional(),
        kind: z.enum(OBSERVATION_KINDS),
        severity: z.enum(OBSERVATION_SEVERITIES).default("low"),
        title: z.string().trim().min(3).max(200),
        body: z.string().trim().max(6000).nullable().optional(),
        dueOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("stage_observations")
      .insert({
        project_id: data.projectId,
        stage_id: data.stageId,
        visit_id: data.visitId ?? null,
        kind: data.kind,
        severity: data.severity,
        title: data.title,
        body: data.body ?? null,
        due_on: data.dueOn ?? null,
        raised_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listObservationActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ observationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("observation_actions")
      .select("id, action_text, assigned_to, due_on, status, completed_at, created_at")
      .eq("observation_id", data.observationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addObservationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        observationId: z.string().uuid(),
        actionText: z.string().trim().min(3).max(2000),
        assignedTo: z.string().uuid().nullable().optional(),
        dueOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("observation_actions")
      .insert({
        observation_id: data.observationId,
        action_text: data.actionText,
        assigned_to: data.assignedTo ?? null,
        due_on: data.dueOn ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase
      .from("stage_observations")
      .update({ status: "action_assigned" })
      .eq("id", data.observationId);
    return { id: row.id };
  });

export const markActionDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ actionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("observation_actions")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: context.userId,
      })
      .eq("id", data.actionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** The database refuses a re-inspection performed by the person who did the action. */
export const recordReinspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        observationId: z.string().uuid(),
        actionId: z.string().uuid().nullable().optional(),
        result: z.enum(["passed", "failed"]),
        note: z.string().trim().max(2000).nullable().optional(),
        visitId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc("record_reinspection", {
      _observation_id: data.observationId,
      _result: data.result,
      // the RPC accepts a null action (observation re-inspected without a specific action)
      _action_id: (data.actionId ?? null) as unknown as string,
      ...(data.note ? { _note: data.note } : {}),
      ...(data.visitId ? { _visit_id: data.visitId } : {}),
    });
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

export const listReinspections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ observationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("observation_reinspections")
      .select("id, action_id, result, note, inspected_by, created_at")
      .eq("observation_id", data.observationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Short-lived signed URL for stage evidence; storage RLS re-checks access. */
export const getEvidenceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(3).max(400) }).parse(input))
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    const { data: signed, error } = await context.supabase.storage
      .from("stage-evidence")
      .createSignedUrl(data.path, 60);
    if (error) return { url: null };
    return { url: signed.signedUrl };
  });

export const listStageAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), stageId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("stage_attachments")
      .select("id, stage_id, visit_id, observation_id, file_path, kind, created_at")
      .eq("project_id", data.projectId);
    if (data.stageId) query = query.eq("stage_id", data.stageId);
    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
