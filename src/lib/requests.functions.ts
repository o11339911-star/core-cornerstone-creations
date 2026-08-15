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
