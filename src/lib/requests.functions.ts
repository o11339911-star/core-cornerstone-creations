import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 12 — unified requests layer.
 * Every request owns exactly one correspondence thread; reminders and
 * "more info" never create a new request, only a new message + status change.
 * Visibility (`internal_note`) and access are enforced by RLS, not by this code.
 */

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "info_needed",
  "approved",
  "rejected",
  "cancelled",
  "closed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const MESSAGE_KINDS = ["comment", "reminder", "info_request", "decision", "system"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const listRequestTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("request_types")
      .select("code, name_ar, name_en, module, requires_stage, requires_unit")
      .eq("is_active", true)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        status: z.enum(REQUEST_STATUSES).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("requests")
      .select(
        "id, request_no, request_type_code, subject, status, priority, stage_id, requested_by, assigned_entity_id, assigned_user_id, due_at, thread_id, created_at",
      )
      .eq("project_id", data.projectId);
    if (data.status) query = query.eq("status", data.status);

    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("requests")
      .select(
        "id, request_no, request_type_code, project_id, stage_id, subject, status, priority, requested_by, assigned_entity_id, assigned_user_id, due_at, thread_id, created_at",
      )
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Request not found");

    const [{ data: messages }, { data: audit }] = await Promise.all([
      context.supabase
        .from("correspondence_messages")
        .select("id, author_id, body, visibility, message_kind, author_role_snapshot, created_at")
        .eq("thread_id", row.thread_id)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("permission_audit_log")
        .select("id, action, old_value, new_value, created_at")
        .eq("object_type", "requests")
        .eq("object_id", row.id)
        .order("created_at", { ascending: true }),
    ]);

    return {
      request: row,
      messages: messages ?? [],
      timeline: audit ?? [],
      viewerId: context.userId,
    };
  });

export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        requestTypeCode: z.string().min(2).max(64),
        subject: z.string().min(2).max(200),
        body: z.string().max(4000).optional(),
        stageId: z.string().uuid().nullable().optional(),
        assignedEntityId: z.string().uuid().nullable().optional(),
        assignedUserId: z.string().uuid().nullable().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        submit: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("create_request", {
      _project_id: data.projectId,
      _request_type_code: data.requestTypeCode,
      _subject: data.subject,
      _body: data.body ?? "",
      ...(data.stageId ? { _stage_id: data.stageId } : {}),
      ...(data.assignedEntityId ? { _assigned_entity_id: data.assignedEntityId } : {}),
      ...(data.assignedUserId ? { _assigned_user_id: data.assignedUserId } : {}),
      _priority: data.priority ?? "normal",
      _submit: data.submit ?? true,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const postRequestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        body: z.string().min(1).max(4000),
        visibility: z.enum(["shared", "party_limited", "internal_note"]).default("shared"),
        kind: z.enum(MESSAGE_KINDS).default("comment"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("post_request_message", {
      _request_id: data.requestId,
      _body: data.body,
      _visibility: data.visibility,
      _kind: data.kind,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const sendRequestReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid(), body: z.string().max(2000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("request_reminder", {
      _request_id: data.requestId,
      _body: data.body ?? "تذكير",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const askForMoreInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("request_more_info", {
      _request_id: data.requestId,
      _body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("decide_request", {
      _request_id: data.requestId,
      _approve: data.approve,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid(), note: z.string().max(2000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("close_request", {
      _request_id: data.requestId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Cross-project requests inbox.
 *
 * Reuses `public.requests` and the existing correspondence thread: nothing is
 * duplicated here. Scope is re-derived server-side from the caller's active
 * membership; the client-sent `entityId` is only accepted after verification.
 */
export type InboxRequest = {
  id: string;
  request_no: string;
  subject: string;
  status: string;
  priority: string;
  project_id: string;
  project_name: string;
  updated_at: string;
  action_required: boolean;
};

export const listInboxRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid().nullable().default(null),
        filter: z.enum(["assigned", "created", "all"]).default("assigned"),
        status: z.enum(REQUEST_STATUSES).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<InboxRequest[]> => {
    const { requireEntityMembership } = await import("@/lib/entity-scope.server");

    let entityId: string | null = null;
    if (data.entityId) {
      const me = await requireEntityMembership(context.supabase, context.userId, data.entityId);
      entityId = me.entityId;
    }

    let query = context.supabase
      .from("requests")
      .select(
        "id, request_no, subject, status, priority, project_id, requested_by, assigned_user_id, assigned_entity_id, updated_at, project:projects!inner(name)",
      );

    const mine = [
      `assigned_user_id.eq.${context.userId}`,
      ...(entityId ? [`assigned_entity_id.eq.${entityId}`] : []),
    ];

    if (data.filter === "assigned") {
      query = query.or(mine.join(","));
    } else if (data.filter === "created") {
      query = query.eq("requested_by", context.userId);
    } else {
      query = query.or([`requested_by.eq.${context.userId}`, ...mine].join(","));
    }

    if (data.status) query = query.eq("status", data.status);

    const { data: rows, error } = await query.order("updated_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      request_no: string;
      subject: string;
      status: string;
      priority: string;
      project_id: string;
      assigned_user_id: string | null;
      assigned_entity_id: string | null;
      updated_at: string;
      project: { name: string } | null;
    };

    return ((rows ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      request_no: r.request_no,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      project_id: r.project_id,
      project_name: r.project?.name ?? "",
      updated_at: r.updated_at,
      action_required:
        ["submitted", "in_review", "info_needed"].includes(r.status) &&
        (r.assigned_user_id === context.userId ||
          (entityId != null && r.assigned_entity_id === entityId)),
    }));
  });
