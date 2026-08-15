import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 10 — correspondence threads and messages.
 * Message visibility is enforced by RLS (private.can_see_message):
 * `internal_note` never reaches an external party, regardless of this code.
 */

export const MESSAGE_VISIBILITY = ["shared", "party_limited", "internal_note"] as const;
export type MessageVisibility = (typeof MESSAGE_VISIBILITY)[number];

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        contractId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("correspondence_threads")
      .select("id, project_id, contract_id, stage_id, subject, status, created_at")
      .eq("project_id", data.projectId);
    if (data.contractId) query = query.eq("contract_id", data.contractId);

    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        subject: z.string().min(2).max(200),
        contractId: z.string().uuid().nullable().optional(),
        stageId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("correspondence_threads")
      .insert({
        project_id: data.projectId,
        subject: data.subject,
        contract_id: data.contractId ?? null,
        stage_id: data.stageId ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { threadId: row.id as string };
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("correspondence_messages")
      .select("id, thread_id, author_id, body, file_path, visibility, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const postMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        body: z.string().min(1).max(20000),
        visibility: z.enum(MESSAGE_VISIBILITY).default("shared"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("correspondence_messages")
      .insert({
        thread_id: data.threadId,
        body: data.body,
        visibility: data.visibility,
        author_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { messageId: row.id as string };
  });
