import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compactArgs } from "@/lib/rpc-args";

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
  .inputValidator((input: unknown) => z.object({ invitationId: z.string().uuid() }).parse(input))
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
  is_external: z.boolean().nullable(),
  external_display_name: z.string().nullable(),
  identifier_last4: z.string().nullable(),
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
        "id, project_id, stage_id, entity_id, user_id, display_name, is_identified, is_external, external_display_name, identifier_last4, job_title_ar, job_title_en, starts_on, ends_on, status, visibility",
      )
      .eq("project_id", data.projectId)
      .order("starts_on", { ascending: true });

    if (error) throw error;
    return assignmentSchema.array().parse(rows ?? []);
  });

function mapAssignmentError(error: { message: string }): Error {
  if (error.message.includes("NOT_ASSIGNABLE")) {
    return new Error("هذا العضو ليس عضوًا نشطًا في كيان مشارك بهذا المشروع.");
  }
  if (error.message.includes("LAST_OWNER_PROTECTED")) {
    return new Error("team.lastOwnerProtected");
  }
  return new Error(error.message);
}

/** حفظ ذرّي لجمهور "أطراف محددة"؛ أي مستوى آخر ينظّف الروابط المحفوظة. */
async function applyPartyAudience(
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ error: { message: string } | null }> },
  assignmentId: string,
  visibility: VisibilityLevel,
  partyIds: string[] | undefined,
): Promise<void> {
  const ids = visibility === "limited" ? (partyIds ?? []) : [];
  if (visibility === "limited" && ids.length === 0) {
    throw new Error("اختر طرفًا واحدًا على الأقل من أطراف المشروع.");
  }
  const { error } = await supabase.rpc("set_assignment_party_audience", {
    _assignment_id: assignmentId,
    _party_ids: ids,
  });
  if (!error) return;
  if (error.message.includes("NOT_AUTHORIZED")) {
    throw new Error("لا تملك صلاحية تحديد جمهور الظهور في هذا المشروع.");
  }
  if (error.message.includes("PARTY_NOT_ELIGIBLE")) {
    throw new Error("أحد الأطراف المختارة غير مؤهل (غير مقبول أو منتهي).");
  }
  if (error.message.includes("AUDIENCE_REQUIRED")) {
    throw new Error("اختر طرفًا واحدًا على الأقل من أطراف المشروع.");
  }
  throw new Error("تعذّر حفظ جمهور الظهور. حاول مرة أخرى.");
}

/**
 * Creates a project assignment through the SECURITY DEFINER RPC only: the
 * database re-validates that `userId` is an active member of `entityId` and
 * that `entityId` actually participates in the project before inserting.
 */
export const createAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        stageId: z.string().uuid().nullable().optional(),
        userId: z.string().uuid(),
        entityId: z.string().uuid(),
        jobTitleAr: z.string().trim().min(2).max(120),
        jobTitleEn: z.string().trim().min(2).max(120),
        startsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        endsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        visibility: z.enum(VISIBILITY_LEVELS).default("internal"),
        audiencePartyIds: z.array(z.string().uuid()).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc(
      "create_project_assignment",
      compactArgs({
        _project_id: data.projectId,
        _user_id: data.userId,
        _entity_id: data.entityId,
        _job_title_ar: data.jobTitleAr,
        _job_title_en: data.jobTitleEn,
        _stage_id: data.stageId,
        _starts_on: data.startsOn,
        _ends_on: data.endsOn,
        _visibility: data.visibility,
      }) as never,
    );

    if (error) throw mapAssignmentError(error);
    await applyPartyAudience(context.supabase, id as string, data.visibility, data.audiencePartyIds);
    return { id: id as string };
  });


/**
 * Updates an existing assignment's job titles, stage, dates and visibility,
 * or ends it (`endNow`) via the single SECURITY DEFINER RPC. Never a direct
 * table update.
 */
export const updateProjectAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        jobTitleAr: z.string().trim().min(2).max(120).optional(),
        jobTitleEn: z.string().trim().min(2).max(120).optional(),
        stageId: z.string().uuid().nullable().optional(),
        clearStage: z.boolean().default(false),
        startsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        endsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        visibility: z.enum(VISIBILITY_LEVELS).optional(),
        audiencePartyIds: z.array(z.string().uuid()).max(50).optional(),
        endNow: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc(
      "update_project_assignment",
      compactArgs({
        _assignment_id: data.assignmentId,
        _job_title_ar: data.jobTitleAr,
        _job_title_en: data.jobTitleEn,
        _stage_id: data.stageId,
        _clear_stage: data.clearStage,
        _starts_on: data.startsOn,
        _ends_on: data.endsOn,
        _visibility: data.visibility,
        _end_now: data.endNow,
      }) as never,
    );

    if (error) throw mapAssignmentError(error);
    if (data.visibility) {
      await applyPartyAudience(
        context.supabase,
        data.assignmentId,
        data.visibility,
        data.audiencePartyIds,
      );
    }
    return { ok: true };
  });


/** Ends an assignment as of the server date, via `update_project_assignment`. */
export const endProjectAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc(
      "update_project_assignment",
      compactArgs({
        _assignment_id: data.assignmentId,
        _clear_stage: false,
        _end_now: true,
      }) as never,
    );

    if (error) throw mapAssignmentError(error);
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

    if (error) {
      if (error.message.includes("LAST_OWNER_PROTECTED"))
        throw new Error("team.lastOwnerProtected");
      throw new Error(error.message);
    }
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
        replacementMembershipId: z.string().uuid().nullable().optional(),
        reason: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ transferred: number; needsReplacement?: true; openAssignments?: number }> => {
      const { data: membership, error: membershipError } = await context.supabase
        .from("entity_memberships")
        .select("id, user_id, role, status")
        .eq("id", data.membershipId)
        .eq("entity_id", data.entityId)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) throw new Error("العضوية غير موجودة.");

      if (membership.user_id === context.userId) {
        throw new Error("لا يمكنك إنهاء عضويتك الخاصة.");
      }

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
        .eq("user_id", membership.user_id)
        .eq("status", "active")
        .is("deleted_at", null);

      if (assignmentsError) throw assignmentsError;

      let replacementUserId: string | null = null;
      if (data.replacementMembershipId) {
        const { data: replacement, error: replacementError } = await context.supabase
          .from("entity_memberships")
          .select("user_id")
          .eq("id", data.replacementMembershipId)
          .eq("entity_id", data.entityId)
          .maybeSingle();
        if (replacementError) throw replacementError;
        if (!replacement) throw new Error("العضو البديل غير موجود.");
        replacementUserId = replacement.user_id;
      }

      if ((openCount ?? 0) > 0 && !replacementUserId) {
        return { transferred: 0, needsReplacement: true, openAssignments: openCount ?? 0 };
      }

      const args: {
        _entity_id: string;
        _user_id: string;
        _replacement_user_id?: string;
        _reason?: string;
      } = { _entity_id: data.entityId, _user_id: membership.user_id };
      if (replacementUserId) args._replacement_user_id = replacementUserId;
      if (data.reason) args._reason = data.reason;

      const { data: moved, error } = await context.supabase.rpc("offboard_member", args);
      if (error) {
        if (error.message.includes("LAST_OWNER_PROTECTED"))
          throw new Error("team.lastOwnerProtected");
        throw new Error(error.message);
      }
      return { transferred: (moved as number) ?? 0 };
    },
  );

/* ------------------------- assignable members lookup --------------------- */

export const assignableMemberSchema = z.object({
  userId: z.string().uuid(),
  entityId: z.string().uuid(),
  fullName: z.string(),
  entityName: z.string(),
});
export type AssignableMember = z.infer<typeof assignableMemberSchema>;

/**
 * Members eligible to receive a project assignment by name: the project
 * entity's own roster plus every entity that is an accepted project party.
 * The `list_project_assignable_members` RPC re-derives `projects.update`
 * server-side before returning any row — never trust a client-picked
 * project id blindly.
 */
export const listAssignableMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AssignableMember[]> => {
    const { data: rows, error } = await context.supabase.rpc("list_project_assignable_members", {
      _project_id: data.projectId,
    });

    if (error) throw new Error(error.message);

    type Row = { user_id: string; entity_id: string; full_name: string; entity_name: string };
    return ((rows ?? []) as Row[])
      .map((row) => ({
        userId: row.user_id,
        entityId: row.entity_id,
        fullName: row.full_name,
        entityName: row.entity_name,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
  });

/**
 * Whether the caller may manage this project's team (add/edit assignments,
 * change visibility). Mirrors the `projects.update` capability that the
 * assignment RPCs already enforce server-side.
 */
export const getProjectTeamCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ canManage: boolean }> => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, entity_id, owner_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return { canManage: false };

    const canManage = await callerCanUpdateProject(context.supabase, context.userId, project);
    return { canManage };
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

/* --------------------------- external members ---------------------------- */

/**
 * بحث خادمي بمعرّف الشخص قبل إسناده كعضو خارجي. لا يُعاد أي معرّف داخلي.
 */
export const lookupExternalMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ projectId: z.string().uuid(), identifier: z.string().trim().min(1).max(20) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("can_manage_project_parties", {
      _project_id: data.projectId,
    });
    if (allowed !== true) return { status: "invalid" as const };

    const { normalizeNationalId } = await import("@/lib/identity-format");
    const { resolvePartyIdentifier } = await import("@/lib/party-lookup.server");
    const resolved = await resolvePartyIdentifier({
      partyKind: "person",
      digits: normalizeNationalId(data.identifier),
      actorUserId: context.userId,
    });
    return resolved.result;
  });

/**
 * إسناد عضو خارجي بالمعرّف: إن كان مسجلًا يُربط الإسناد بحسابه، وإلا يُحفظ
 * إسناد معلّق بلا صلاحيات نشطة. الاسم اختياري دائمًا.
 */
export const createExternalAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        identifier: z.string().trim().min(1).max(20),
        displayName: z.string().trim().max(200).nullable().optional(),
        jobTitleAr: z.string().trim().max(200).optional(),
        jobTitleEn: z.string().trim().max(200).optional(),
        stageId: z.string().uuid().nullable().optional(),
        startsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        endsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        visibility: z.enum(VISIBILITY_LEVELS).default("internal"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; pending: boolean }> => {
    const { normalizeNationalId } = await import("@/lib/identity-format");
    const { resolvePartyIdentifier } = await import("@/lib/party-lookup.server");
    const resolved = await resolvePartyIdentifier({
      partyKind: "person",
      digits: normalizeNationalId(data.identifier),
      actorUserId: context.userId,
    });

    if (resolved.result.status === "throttled") {
      throw new Error("محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.");
    }
    if (!resolved.fingerprint) {
      throw new Error("رقم الهوية يجب أن يكون عشرة أرقام ويبدأ بـ 1 أو 2.");
    }

    const { data: id, error } = await context.supabase.rpc("create_external_project_assignment", {
      _project_id: data.projectId,
      _identifier_fingerprint: resolved.fingerprint,
      _identifier_last4: resolved.last4,
      _display_name: resolved.displayName ?? data.displayName ?? null,
      _job_title_ar: data.jobTitleAr ?? "",
      _job_title_en: data.jobTitleEn ?? "",
      _matched_user_id: resolved.matchedUserId,
      _stage_id: data.stageId ?? null,
      _starts_on: data.startsOn ?? null,
      _ends_on: data.endsOn ?? null,
      _visibility: data.visibility,
    } as never);

    if (error) {
      if (error.message.includes("FORBIDDEN")) {
        throw new Error("لا تملك صلاحية إسناد أعضاء في هذا المشروع.");
      }
      if (error.message.includes("DUPLICATE")) {
        throw new Error("هذا الشخص مُسند مسبقًا في هذا المشروع.");
      }
      throw new Error("تعذّر حفظ الإسناد. حاول مرة أخرى.");
    }
    return { id: id as string, pending: resolved.matchedUserId === null };
  });
