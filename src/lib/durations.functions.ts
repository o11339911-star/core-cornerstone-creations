import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 17-B — duration timers, escalation policies and digests.
 *
 * All writes happen inside guarded SECURITY DEFINER functions; these server
 * functions only read through RLS or call those guarded RPCs.
 */

const timerSchema = z.object({
  id: z.string().uuid(),
  subject_kind: z.string(),
  subject_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  started_at: z.string(),
  due_at: z.string().nullable(),
  paused_at: z.string().nullable(),
  total_paused_seconds: z.number(),
  stopped_at: z.string().nullable(),
  state: z.string(),
  last_pre_due_bucket: z.string().nullable(),
  last_overdue_bucket: z.string().nullable(),
});
export type DurationTimer = z.infer<typeof timerSchema>;

const TIMER_COLUMNS =
  "id, subject_kind, subject_id, project_id, started_at, due_at, paused_at, total_paused_seconds, stopped_at, state, last_pre_due_bucket, last_overdue_bucket";

export const listProjectTimers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DurationTimer[]> => {
    const { data: rows, error } = await context.supabase
      .from("duration_timers")
      .select(TIMER_COLUMNS)
      .eq("project_id", data.projectId)
      .order("due_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return z.array(timerSchema).parse(rows ?? []);
  });

const policySchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  subject_kind: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  trigger_after_hours: z.number(),
  is_active: z.boolean(),
});
export type EscalationPolicy = z.infer<typeof policySchema>;

export const listEscalationPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EscalationPolicy[]> => {
    const { data: rows, error } = await context.supabase
      .from("escalation_policies")
      .select("id, entity_id, project_id, subject_kind, name_ar, name_en, trigger_after_hours, is_active")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return z.array(policySchema).parse(rows ?? []);
  });

const eventSchema = z.object({
  id: z.string().uuid(),
  timer_id: z.string().uuid(),
  policy_id: z.string().uuid(),
  step_no: z.number(),
  resolved_recipient_user_id: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  raised_at: z.string(),
});
export type EscalationEvent = z.infer<typeof eventSchema>;

export const listEscalationEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EscalationEvent[]> => {
    const { data: rows, error } = await context.supabase
      .from("escalation_events")
      .select("id, timer_id, policy_id, step_no, resolved_recipient_user_id, reason, raised_at")
      .eq("project_id", data.projectId)
      .order("raised_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(eventSchema).parse(rows ?? []);
  });

const stepInput = z.object({
  step_no: z.number().int().min(1),
  delay_hours: z.number().int().min(0).default(0),
  target_kind: z.enum(["stage_role", "project_party_role", "user"]),
  target_role: z.string().min(1).nullable().default(null),
  target_user_id: z.string().uuid().nullable().default(null),
});

export const saveEscalationPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        policyId: z.string().uuid().nullable().default(null),
        entityId: z.string().uuid(),
        projectId: z.string().uuid(),
        subjectKind: z.enum(["request", "stage", "milestone", "retention"]),
        nameAr: z.string().min(2),
        nameEn: z.string().min(2),
        triggerAfterHours: z.number().int().min(0).default(0),
        steps: z.array(stepInput).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("upsert_escalation_policy", {
      _entity_id: data.entityId,
      _project_id: data.projectId,
      _subject_kind: data.subjectKind,
      _name_ar: data.nameAr,
      _name_en: data.nameEn,
      _trigger_after_hours: data.triggerAfterHours,
      _steps: data.steps,
      ...(data.policyId ? { _policy_id: data.policyId } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const requestCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        subjectKind: z.enum(["request", "stage", "milestone", "retention"]),
        subjectId: z.string().uuid(),
        note: z.string().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("request_completion", {
      _subject_kind: data.subjectKind,
      _subject_id: data.subjectId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const buildMyDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mode: z.enum(["daily", "weekly"]).default("daily") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("build_notification_digest", {
      _mode: data.mode,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { itemCount: (row?.item_count as number | undefined) ?? 0 };
  });
