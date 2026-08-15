import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 20 — Rakeez internal platform administration.
 *
 * Platform staff are a separate population from entity memberships: holding a
 * platform job grants NO access to customer project files. Access is either
 * case-based (scoped + expiring, tied to a queue item) or break-glass
 * (second-person approval, short lived). Every mutation below is a thin
 * wrapper over a SECURITY DEFINER function that re-checks `auth.uid()` and the
 * platform permission internally.
 */

const uuid = z.string().uuid();

export const platformMeSchema = z.object({
  is_staff: z.boolean(),
  is_admin: z.boolean(),
  role: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  max_concurrent: z.number().nullable().optional(),
});
export type PlatformMe = z.infer<typeof platformMeSchema>;

export const queueItemSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  source_table: z.string(),
  source_id: z.string(),
  entity_id: z.string().nullable(),
  project_id: z.string().nullable(),
  title: z.string(),
  priority: z.number(),
  status: z.string(),
  assigned_to: z.string().nullable(),
  assigned_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  close_reason: z.string().nullable(),
  created_at: z.string(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const staffSchema = z.object({
  user_id: z.string(),
  role: z.string(),
  availability: z.string(),
  max_concurrent: z.number(),
  active: z.boolean(),
  current_load: z.number(),
  full_name: z.string().nullable(),
});
export type PlatformStaff = z.infer<typeof staffSchema>;

export const breakglassSchema = z.object({
  id: z.string(),
  requested_by: z.string(),
  project_id: z.string(),
  reason: z.string(),
  status: z.string(),
  approved_by: z.string().nullable(),
  approved_at: z.string().nullable(),
  denied_reason: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
});
export type BreakglassRequest = z.infer<typeof breakglassSchema>;

/** Who am I on the platform side? Returns `is_staff: false` for normal users. */
export const getPlatformMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformMe> => {
    const { data, error } = await context.supabase.rpc("platform_me");
    if (error) throw new Error(error.message);
    return platformMeSchema.parse(data);
  });

export const listQueueItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.string().optional(), mine: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<QueueItem[]> => {
    const { data: rows, error } = await context.supabase.rpc("list_queue_items", {
      _status: data.status ?? undefined,
      _mine: data.mine ?? false,
    });
    if (error) throw new Error(error.message);
    return queueItemSchema.array().parse(rows ?? []);
  });

export const listPlatformStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformStaff[]> => {
    const { data, error } = await context.supabase.rpc("list_platform_staff");
    if (error) throw new Error(error.message);
    return staffSchema.array().parse(data ?? []);
  });

export const listBreakglassRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BreakglassRequest[]> => {
    const { data, error } = await context.supabase.rpc("list_breakglass_requests");
    if (error) throw new Error(error.message);
    return breakglassSchema.array().parse(data ?? []);
  });

export const autoAssignQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ itemId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: staff, error } = await context.supabase.rpc("auto_assign_queue_item", {
      _item_id: data.itemId,
    });
    if (error) throw new Error(error.message);
    return { assignedTo: staff as string };
  });

export const reassignQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ itemId: uuid, toUser: uuid, reason: z.string().min(5) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reassign_queue_item", {
      _item_id: data.itemId,
      _to_user: data.toUser,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ itemId: uuid, reason: z.string().min(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("resolve_queue_item", {
      _item_id: data.itemId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setStaffState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: uuid,
        availability: z.enum(["available", "busy", "on_leave", "suspended"]),
        maxConcurrent: z.number().int().min(0).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_platform_staff_state", {
      _user_id: data.userId,
      _availability: data.availability,
      _max_concurrent: data.maxConcurrent ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Case-based, read-only, auto-expiring access to one project. */
export const grantCaseAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: uuid,
        staffUserId: uuid,
        minutes: z.number().int().min(1).max(1440),
        reason: z.string().min(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("grant_case_access", {
      _item_id: data.itemId,
      _staff_user_id: data.staffUserId,
      _minutes: data.minutes,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { caseAccessId: id as string };
  });

export const requestBreakglass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: uuid, reason: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("request_breakglass", {
      _project_id: data.projectId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { requestId: id as string };
  });

export const approveBreakglass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: uuid, minutes: z.number().int().min(1).max(240).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_breakglass", {
      _request_id: data.requestId,
      _minutes: data.minutes ?? 60,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const denyBreakglass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: uuid, reason: z.string().min(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("deny_breakglass", {
      _request_id: data.requestId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
