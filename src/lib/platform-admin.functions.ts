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

/**
 * Resolve platform access from the two authoritative tables for the current
 * authenticated user only. This deliberately does not use profile metadata,
 * entity membership, or a tenant/account selection.
 */
export const getPlatformMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformMe> => {
    const [adminResult, staffResult] = await Promise.all([
      context.supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("platform_staff")
        .select("user_id, role, availability, max_concurrent, active")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    const isAdmin = !adminResult.error && adminResult.data?.user_id === context.userId;
    const staff = !staffResult.error ? staffResult.data : null;
    const isStaff = staff?.user_id === context.userId && staff.active === true;

    // A positive result from either independent source is sufficient. If no
    // source proves access, any read failure makes the result indeterminate and
    // must fail closed rather than silently treating an administrator as a
    // personal account.
    if (!isAdmin && !isStaff && (adminResult.error || staffResult.error)) {
      throw new Error("PLATFORM_ACCESS_CHECK_FAILED");
    }

    return platformMeSchema.parse({
      is_admin: isAdmin,
      is_staff: isStaff,
      role: isStaff ? staff.role : null,
      availability: isStaff ? staff.availability : null,
      max_concurrent: isStaff ? staff.max_concurrent : null,
    });
  });

export const listQueueItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.string().optional(), mine: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<QueueItem[]> => {
    const { data: rows, error } = await context.supabase.rpc("list_queue_items", {
      ...(data.status ? { _status: data.status } : {}),
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
      ...(data.maxConcurrent === undefined ? {} : { _max_concurrent: data.maxConcurrent }),
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

/* ------------------------------------------------------------------ *
 * Platform admin directories (users / entities)
 * Both RPCs re-check `private.is_platform_admin(auth.uid())` internally and
 * never return password hashes, tokens, encrypted identity or raw metadata.
 * ------------------------------------------------------------------ */

export const adminUserRowSchema = z.object({
  user_id: z.string(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  created_at: z.string(),
  last_sign_in_at: z.string().nullable(),
  email_confirmed: z.boolean(),
  identity_status: z.string().nullable(),
  identity_last4: z.string().nullable(),
  active_memberships: z.number(),
  registration_complete: z.boolean(),
  total_count: z.number(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const adminEntityRowSchema = z.object({
  entity_id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  legal_form: z.string().nullable(),
  unified_national_number: z.string().nullable(),
  verification_status: z.string().nullable(),
  created_at: z.string(),
  members_count: z.number(),
  owner_name: z.string().nullable(),
  total_count: z.number(),
});
export type AdminEntityRow = z.infer<typeof adminEntityRowSchema>;

const listInput = z.object({
  q: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: AdminUserRow[]; total: number }> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_users", {
      ...(data.q && data.q.length > 0 ? { _q: data.q } : {}),
      _limit: data.limit ?? 50,
      _offset: data.offset ?? 0,
    });
    if (error) throw new Error(error.message.includes("FORBIDDEN") ? "FORBIDDEN" : error.message);
    const parsed = adminUserRowSchema.array().parse(rows ?? []);
    return { rows: parsed, total: parsed[0]?.total_count ?? 0 };
  });

export const adminListEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: AdminEntityRow[]; total: number }> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_entities", {
      ...(data.q && data.q.length > 0 ? { _q: data.q } : {}),
      _limit: data.limit ?? 50,
      _offset: data.offset ?? 0,
    });
    if (error) throw new Error(error.message.includes("FORBIDDEN") ? "FORBIDDEN" : error.message);
    const parsed = adminEntityRowSchema.array().parse(rows ?? []);
    return { rows: parsed, total: parsed[0]?.total_count ?? 0 };
  });
