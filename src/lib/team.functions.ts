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
    const args: {
      _entity_id: string;
      _user_id: string;
      _replacement_user_id?: string;
      _reason?: string;
    } = { _entity_id: data.entityId, _user_id: data.userId };
    if (data.replacementUserId) args._replacement_user_id = data.replacementUserId;
    if (data.reason) args._reason = data.reason;

    const { data: moved, error } = await context.supabase.rpc("offboard_member", args);


    if (error) throw new Error(error.message);
    return { transferred: (moved as number) ?? 0 };
  });

/* ------------------------------ team roster ----------------------------- */

export const teamRosterRowSchema = z.object({
  membership_id: z.string().uuid(),
  full_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(APP_ROLES),
  status: z.string(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  is_self: z.boolean(),
});
export type TeamRosterRow = z.infer<typeof teamRosterRowSchema>;

/**
 * Human-readable, permission-aware team directory. Emails/phones are only
 * present when the DB decides the caller is allowed to see them (owner,
 * admin, `members.manage_members`, or their own row) — never a raw UUID.
 */
export const listEntityTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => entityScope.parse(input))
  .handler(async ({ data, context }): Promise<TeamRosterRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("list_entity_team", {
      _entity_id: data.entityId,
    });

    if (error) throw new Error(error.message);
    return teamRosterRowSchema.array().parse(rows ?? []);
  });

/**
 * Changes a member's role. RLS already forbids self-updates and requires
 * `members.manage_members`; here we additionally guard the entity against
 * ever being left without an active owner.
 */
export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        membershipId: z.string().uuid(),
        newRole: z.enum(APP_ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: current, error: currentError } = await context.supabase
      .from("entity_memberships")
      .select("id, user_id, role, status, entity_id")
      .eq("id", data.membershipId)
      .eq("entity_id", data.entityId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) throw new Error("العضوية غير موجودة.");

    if (current.user_id === context.userId) {
      throw new Error("لا يمكنك تغيير دورك الخاص.");
    }

    if (current.role === "owner" && data.newRole !== "owner") {
      const { count, error: ownersError } = await context.supabase
        .from("entity_memberships")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", data.entityId)
        .eq("role", "owner")
        .eq("status", "active")
        .neq("id", data.membershipId);

      if (ownersError) throw ownersError;
      if (!count) {
        throw new Error("لا يمكن إنقاص دور آخر مالك نشِط في الكيان.");
      }
    }

    const { error } = await context.supabase
      .from("entity_memberships")
      .update({ role: data.newRole })
      .eq("id", data.membershipId)
      .eq("entity_id", data.entityId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Safe offboarding wrapper around `offboard_member`: blocks removing the
 * last active owner, and — when the member still has open project
 * assignments — requires a named replacement before handing over to the DB.
 */
export const offboardMemberSafely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        membershipId: z.string().uuid(),
        userId: z.string().uuid(),
        replacementUserId: z.string().uuid().nullable().optional(),
        reason: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ transferred: number; needsReplacement?: true; openAssignments?: number }> => {
      if (data.userId === context.userId) {
        throw new Error("لا يمكنك إنهاء عضويتك الخاصة.");
      }

      const { data: membership, error: membershipError } = await context.supabase
        .from("entity_memberships")
        .select("id, role, status")
        .eq("id", data.membershipId)
        .eq("entity_id", data.entityId)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) throw new Error("العضوية غير موجودة.");

      if (membership.role === "owner") {
        const { count, error: ownersError } = await context.supabase
          .from("entity_memberships")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", data.entityId)
          .eq("role", "owner")
          .eq("status", "active")
          .neq("id", data.membershipId);

        if (ownersError) throw ownersError;
        if (!count) {
          throw new Error("لا يمكن إنهاء خدمة آخر مالك نشِط في الكيان.");
        }
      }

      const { count: openCount, error: assignmentsError } = await context.supabase
        .from("project_assignments")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", data.entityId)
        .eq("user_id", data.userId)
        .eq("status", "active")
        .is("deleted_at", null);

      if (assignmentsError) throw assignmentsError;

      if ((openCount ?? 0) > 0 && !data.replacementUserId) {
        return { transferred: 0, needsReplacement: true, openAssignments: openCount ?? 0 };
      }

      const args: {
        _entity_id: string;
        _user_id: string;
        _replacement_user_id?: string;
        _reason?: string;
      } = { _entity_id: data.entityId, _user_id: data.userId };
      if (data.replacementUserId) args._replacement_user_id = data.replacementUserId;
      if (data.reason) args._reason = data.reason;

      const { data: moved, error } = await context.supabase.rpc("offboard_member", args);
      if (error) throw new Error(error.message);
      return { transferred: (moved as number) ?? 0 };
    },
  );

/* ------------------------- assignable members lookup --------------------- */

export const assignableMemberSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  entityName: z.string(),
});
export type AssignableMember = z.infer<typeof assignableMemberSchema>;

/**
 * Members eligible to receive a project assignment by name: the project
 * entity's own roster plus every entity that is an accepted project party.
 * Authorization is re-derived server-side (`projects.update`) before any
 * row is returned — never trust a client-picked project id blindly.
 */
export const listAssignableMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AssignableMember[]> => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, entity_id, owner_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) throw new Error("المشروع غير موجود.");

    const allowed = await callerCanUpdateProject(context.supabase, context.userId, project);
    if (!allowed) {
      throw new Error("لا تملك صلاحية إدارة فريق هذا المشروع.");
    }

    const entityIds = new Set<string>();
    if (project.entity_id) entityIds.add(project.entity_id);

    const { data: parties, error: partiesError } = await context.supabase
      .from("project_parties")
      .select("party_entity_id")
      .eq("project_id", data.projectId)
      .eq("status", "accepted");

    if (partiesError) throw partiesError;
    for (const p of parties ?? []) entityIds.add(p.party_entity_id);

    if (entityIds.size === 0) return [];

    const { data: rows, error } = await context.supabase
      .from("entity_memberships")
      .select("user_id, entity_id, entities(name), profiles(full_name)")
      .in("entity_id", [...entityIds])
      .eq("status", "active");

    if (error) throw error;

    type Row = {
      user_id: string;
      entities: { name: string } | null;
      profiles: { full_name: string | null } | null;
    };
    const seen = new Set<string>();
    const out: AssignableMember[] = [];
    for (const row of (rows ?? []) as unknown as Row[]) {
      const key = row.user_id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        userId: row.user_id,
        fullName: row.profiles?.full_name ?? "عضو",
        entityName: row.entities?.name ?? "—",
      });
    }
    return out.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
  });

/**
 * Minimal re-derivation of `projects.update` for the current user: entity
 * owner/admin/manager role permissions, fine-grained grants, or the
 * project's direct owner_id. RLS still guards every underlying write.
 */
async function callerCanUpdateProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  project: { entity_id: string | null; owner_id: string },
): Promise<boolean> {
  if (project.owner_id === userId) return true;
  if (!project.entity_id) return false;

  const now = new Date().toISOString();
  const { data: membership } = await supabase
    .from("entity_memberships")
    .select("role, status, expires_at")
    .eq("user_id", userId)
    .eq("entity_id", project.entity_id)
    .eq("status", "active")
    .maybeSingle();

  const allowed = new Set<string>();
  const membershipActive = membership && (!membership.expires_at || membership.expires_at > now);

  if (membershipActive) {
    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("module, action")
      .eq("role", membership.role);
    for (const row of rolePerms ?? []) allowed.add(`${row.module}.${row.action}`);
  }

  const { data: grants } = await supabase
    .from("permission_grants")
    .select("module, action, effect, expires_at, revoked_at")
    .eq("subject_user_id", userId)
    .eq("scope_type", "entity")
    .eq("scope_entity_id", project.entity_id)
    .is("revoked_at", null);

  const live = (grants ?? []).filter(
    (g: { expires_at: string | null }) => !g.expires_at || g.expires_at > now,
  );
  for (const g of live.filter((g: { effect: string }) => g.effect === "allow")) {
    allowed.add(`${g.module}.${g.action}`);
  }
  for (const g of live.filter((g: { effect: string }) => g.effect === "deny")) {
    allowed.delete(`${g.module}.${g.action}`);
  }

  return allowed.has("projects.update");
}
