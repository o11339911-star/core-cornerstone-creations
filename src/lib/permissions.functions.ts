import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Read-only server surface for the permission engine.
 *
 * The database is the single source of truth: `private.can()` is enforced
 * inside RLS policies and triggers. Nothing here grants or alters
 * permissions — granting is a privileged flow added in a later phase.
 */

export const APP_MODULES = [
  "projects",
  "stages",
  "contracts",
  "documents",
  "finance",
  "correspondence",
  "reports",
  "members",
] as const;

export const APP_ACTIONS = [
  "view",
  "create",
  "update",
  "soft_delete",
  "approve",
  "execute",
  "export",
  "share",
  "manage_members",
] as const;

export type AppModule = (typeof APP_MODULES)[number];
export type AppAction = (typeof APP_ACTIONS)[number];

/** `module.action` pairs, e.g. "projects.update". */
export type PermissionKey = `${AppModule}.${AppAction}`;

const scopeInput = z.object({ entityId: z.string().uuid().nullable().optional() });

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scopeInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PermissionKey[]> => {
    const entityId = data.entityId ?? null;

    // Personal scope: the user is the owner of their own personal projects,
    // which the database grants implicitly. No entity-level permissions.
    if (!entityId) return [];

    const now = new Date().toISOString();

    const { data: membership, error: membershipError } = await context.supabase
      .from("entity_memberships")
      .select("role, status, expires_at")
      .eq("user_id", context.userId)
      .eq("entity_id", entityId)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) throw membershipError;

    const allowed = new Set<PermissionKey>();

    const membershipActive =
      membership && (!membership.expires_at || membership.expires_at > now);

    if (membershipActive) {
      const { data: rolePerms, error: rolePermsError } = await context.supabase
        .from("role_permissions")
        .select("module, action")
        .eq("role", membership.role);

      if (rolePermsError) throw rolePermsError;
      for (const row of rolePerms ?? []) {
        allowed.add(`${row.module}.${row.action}` as PermissionKey);
      }
    }

    // Fine-grained grants scoped to this entity (deny always wins).
    const { data: grants, error: grantsError } = await context.supabase
      .from("permission_grants")
      .select("module, action, effect, expires_at, revoked_at")
      .eq("subject_user_id", context.userId)
      .eq("scope_type", "entity")
      .eq("scope_entity_id", entityId)
      .is("revoked_at", null);

    if (grantsError) throw grantsError;

    const live = (grants ?? []).filter((g) => !g.expires_at || g.expires_at > now);
    for (const g of live.filter((g) => g.effect === "allow")) {
      allowed.add(`${g.module}.${g.action}` as PermissionKey);
    }
    for (const g of live.filter((g) => g.effect === "deny")) {
      allowed.delete(`${g.module}.${g.action}` as PermissionKey);
    }

    return [...allowed].sort();
  });

export const permissionAuditRowSchema = z.object({
  id: z.string().uuid(),
  actor_user_id: z.string().uuid().nullable(),
  target_user_id: z.string().uuid().nullable(),
  target_entity_id: z.string().uuid().nullable(),
  target_project_id: z.string().uuid().nullable(),
  object_type: z.enum(["membership", "grant"]),
  object_id: z.string().uuid().nullable(),
  action: z.enum(["insert", "update", "revoke", "delete"]),
  created_at: z.string(),
});

export type PermissionAuditRow = z.infer<typeof permissionAuditRowSchema>;

/**
 * Audit trail is append-only and RLS-scoped: callers only see entries for
 * themselves or for entities where they hold `members.view`.
 */
export const listPermissionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scopeInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<PermissionAuditRow[]> => {
    let query = context.supabase
      .from("permission_audit_log")
      .select(
        "id, actor_user_id, target_user_id, target_entity_id, target_project_id, object_type, object_id, action, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (data.entityId) query = query.eq("target_entity_id", data.entityId);

    const { data: rows, error } = await query;
    if (error) throw error;
    return permissionAuditRowSchema.array().parse(rows ?? []);
  });
