import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Entity team management: invitations, project assignments, visibility and
 * offboarding. Every privileged step is enforced in the database
 * (`private.can`, RLS policies and SECURITY DEFINER RPCs); nothing here is
 * trusted from the client.
 */

const entityScope = z.object({ entityId: z.string().uuid() });

export const APP_ROLES = ["owner", "admin", "manager", "member", "viewer"] as const;
export const VISIBILITY_LEVELS = ["internal", "limited", "project_wide"] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/* ------------------------------- members ------------------------------- */

export const teamMemberSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(APP_ROLES),
  status: z.string(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const listEntityMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => entityScope.parse(input))
  .handler(async ({ data, context }): Promise<TeamMember[]> => {
    const { data: rows, error } = await context.supabase
      .from("entity_memberships")
      .select("id, user_id, role, status, expires_at, created_at")
      .eq("entity_id", data.entityId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return teamMemberSchema.array().parse(rows ?? []);
  });

/* ----------------------------- invitations ----------------------------- */

export const invitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.enum(APP_ROLES),
  status: z.enum(["pending", "accepted", "expired", "revoked"]),
  expires_at: z.string(),
  created_at: z.string(),
  accepted_at: z.string().nullable(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => entityScope.parse(input))
  .handler(async ({ data, context }): Promise<Invitation[]> => {
    const { data: rows, error } = await context.supabase
      .from("entity_invitations")
      .select("id, email, role, status, expires_at, created_at, accepted_at")
      .eq("entity_id", data.entityId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return invitationSchema.array().parse(rows ?? []);
  });

/**
 * Issues an invitation and returns the raw token exactly once, so the inviter
 * can copy the acceptance link manually (no email delivery in this phase).
 */
export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(APP_ROLES).default("member"),
        validDays: z.number().int().min(1).max(90).default(7),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ invitationId: string; token: string }> => {
    const { data: rows, error } = await context.supabase.rpc("create_entity_invitation", {
      _entity_id: data.entityId,
      _email: data.email,
      _role: data.role,
      _valid_days: data.validDays,
    });

    if (error) throw error;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("INVITATION_NOT_CREATED");
    return { invitationId: row.invitation_id as string, token: row.token as string };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ invitationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("entity_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.invitationId)
      .eq("status", "pending");

    if (error) throw error;
    return { ok: true };
  });

/** Accepts exactly once; double / expired / revoked acceptance is rejected. */
export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10) }).parse(input))
  .handler(async ({ data, context }): Promise<{ entityId: string }> => {
    const { data: entityId, error } = await context.supabase.rpc("accept_entity_invitation", {
      _token: data.token,
    });

    if (error) throw new Error(error.message);
    return { entityId: entityId as string };
  });

/* ----------------------------- assignments ----------------------------- */

export const assignmentSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  stage_id: z.string().uuid().nullable(),
  entity_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  display_name: z.string().nullable(),
  is_identified: z.boolean().nullable(),
  job_title_ar: z.string(),
  job_title_en: z.string(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  status: z.string(),
  visibility: z.enum(VISIBILITY_LEVELS),
});
export type Assignment = z.infer<typeof assignmentSchema>;

/**
 * Reads through the visibility-aware view: unauthorized viewers see the
 * descriptive job label instead of the real person.
 */
export const listProjectAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Assignment[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_assignments_public")
      .select(
        "id, project_id, stage_id, entity_id, user_id, display_name, is_identified, job_title_ar, job_title_en, starts_on, ends_on, status, visibility",
      )
      .eq("project_id", data.projectId)
      .order("starts_on", { ascending: true });

    if (error) throw error;
    return assignmentSchema.array().parse(rows ?? []);
  });

export const createAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        stageId: z.string().uuid().nullable().optional(),
        userId: z.string().uuid(),
        entityId: z.string().uuid().nullable().optional(),
        jobTitleAr: z.string().trim().min(2).max(120),
        jobTitleEn: z.string().trim().min(2).max(120),
        startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        visibility: z.enum(VISIBILITY_LEVELS).default("internal"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("project_assignments")
      .insert({
        project_id: data.projectId,
        stage_id: data.stageId ?? null,
        user_id: data.userId,
        entity_id: data.entityId ?? null,
        job_title_ar: data.jobTitleAr,
        job_title_en: data.jobTitleEn,
        starts_on: data.startsOn ?? new Date().toISOString().slice(0, 10),
        ends_on: data.endsOn ?? null,
        visibility: data.visibility,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: row.id };
  });

export const setAssignmentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        visibility: z.enum(VISIBILITY_LEVELS),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("project_assignments")
      .update({ visibility: data.visibility })
      .eq("id", data.assignmentId);

    if (error) throw error;
    return { ok: true };
  });

/* ------------------------------ offboarding ---------------------------- */

/**
 * Immediate access revocation + handover of open assignments to a
 * replacement. Never deletes history and never touches signed documents.
 */
export const offboardMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        userId: z.string().uuid(),
        replacementUserId: z.string().uuid().nullable().optional(),
        reason: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ transferred: number }> => {
    const { data: moved, error } = await context.supabase.rpc("offboard_member", {
      _entity_id: data.entityId,
      _user_id: data.userId,
      _replacement_user_id: data.replacementUserId ?? undefined,
      _reason: data.reason ?? undefined,
    });

    if (error) throw new Error(error.message);
    return { transferred: (moved as number) ?? 0 };
  });
