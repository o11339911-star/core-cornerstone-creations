import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 17-A — in-app notifications.
 *
 * The database is the boundary: rows are written only by SECURITY DEFINER
 * triggers, links carry identifiers only, and access to the target is
 * evaluated at click time by `resolve_notification_target`.
 */

export const NOTIFICATION_CATEGORIES = [
  "action_required",
  "reminder",
  "overdue",
  "escalation",
  "security",
  "info",
] as const;

const notificationSchema = z.object({
  id: z.string().uuid(),
  type_code: z.string(),
  project_id: z.string().uuid().nullable(),
  entity_id: z.string().uuid().nullable(),
  target_kind: z.string(),
  target_id: z.string().uuid().nullable(),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable(),
  severity: z.string(),
  created_at: z.string(),
  read_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type NotificationRow = z.infer<typeof notificationSchema>;

/**
 * مصدر الإشعار: إما المنصة نفسها («ركيز») أو كيان/فرد حقيقي.
 * يُشتق خادميًا فقط، ولا يمكن لأي كيان انتحال هوية المنصة:
 * أي إشعار أمني أو صادر عن محرّك المنصة يُعرض دائمًا باسم «ركيز».
 */
export type NotificationSource = { kind: "platform" | "entity" | "person"; name: string };
export type NotificationWithSource = NotificationRow & { source: NotificationSource };

const PLATFORM_SOURCE: NotificationSource = { kind: "platform", name: "ركيز" };

/** أنواع تصدر عن المنصة حصرًا مهما كان محتوى الحمولة. */
function isPlatformOnly(typeCode: string, severity: string): boolean {
  return typeCode.startsWith("security.") || typeCode.startsWith("platform.") || severity === "critical";
}

const NOTIFICATION_COLUMNS =
  "id, type_code, project_id, entity_id, target_kind, target_id, payload, severity, created_at, read_at, dismissed_at";

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ unreadOnly: z.boolean().default(false) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<NotificationWithSource[]> => {
    let query = context.supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data.unreadOnly) query = query.is("read_at", null);

    const { data: rows, error } = await query;
    if (error) throw error;
    const parsed = notificationSchema.array().parse(rows ?? []);

    // أسماء الكيانات تُقرأ بصلاحية المستخدم نفسه (RLS)، ولا تُكشف أي بيانات أخرى.
    const entityIds = Array.from(
      new Set(
        parsed
          .filter((n) => !isPlatformOnly(n.type_code, n.severity))
          .map((n) => n.entity_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const entityNames = new Map<string, string>();
    if (entityIds.length > 0) {
      const { data: ents } = await context.supabase
        .from("entities")
        .select("id, name")
        .in("id", entityIds);
      for (const e of (ents ?? []) as Array<{ id: string; name: string | null }>) {
        if (e.name) entityNames.set(e.id, e.name);
      }
    }

    return parsed.map((n) => ({ ...n, source: deriveSource(n, entityNames) }));
  });

function deriveSource(
  n: NotificationRow,
  entityNames: Map<string, string>,
): NotificationSource {
  if (isPlatformOnly(n.type_code, n.severity)) return PLATFORM_SOURCE;

  const entityName = n.entity_id ? entityNames.get(n.entity_id) : undefined;
  if (entityName) return { kind: "entity", name: entityName };

  const actor = n.payload?.["actor_name"];
  if (typeof actor === "string" && actor.trim()) return { kind: "person", name: actor.trim() };

  return PLATFORM_SOURCE;
}

export const getUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);

    if (error) throw error;
    return count ?? 0;
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("mark_notification_read", {
      _notification_id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ updated: number }> => {
    const { data: updated, error } = await context.supabase.rpc("mark_all_notifications_read");
    if (error) throw new Error(error.message);
    return { updated: (updated as number) ?? 0 };
  });

/**
 * Access is re-evaluated now, not when the notification was created.
 * Any failure returns the exact same opaque message so the caller cannot
 * distinguish "missing" from "forbidden".
 */
export const OPAQUE_LINK_ERROR = "NOT_FOUND_OR_FORBIDDEN";

export const resolveNotificationTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: boolean;
      target?: { target_kind: string; target_id: string | null; project_id: string | null };
      error?: string;
    }> => {
      const { data: target, error } = await context.supabase.rpc("resolve_notification_target", {
        _notification_id: data.id,
      });

      if (error || !target) return { ok: false, error: OPAQUE_LINK_ERROR };
      return {
        ok: true,
        target: target as { target_kind: string; target_id: string | null; project_id: string | null },
      };
    },
  );

const typeSchema = z.object({
  code: z.string(),
  category: z.string(),
  is_mandatory: z.boolean(),
  is_security: z.boolean(),
  subject_key: z.string(),
  body_key: z.string(),
  target_kind: z.string(),
});
export type NotificationType = z.infer<typeof typeSchema>;

export const listNotificationTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationType[]> => {
    const { data, error } = await context.supabase
      .from("notification_types")
      .select("code, category, is_mandatory, is_security, subject_key, body_key, target_kind")
      .order("code");
    if (error) throw error;
    return typeSchema.array().parse(data ?? []);
  });

const preferenceSchema = z.object({
  type_code: z.string(),
  in_app: z.boolean(),
  digest_mode: z.enum(["immediate", "daily", "weekly", "off"]),
});
export type NotificationPreference = z.infer<typeof preferenceSchema>;

export const listNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPreference[]> => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("type_code, in_app, digest_mode");
    if (error) throw error;
    return preferenceSchema.array().parse(data ?? []);
  });

/** The database rejects disabling mandatory/security types — the UI only mirrors it. */
export const setNotificationPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        typeCode: z.string().min(1).max(80),
        inApp: z.boolean(),
        digestMode: z.enum(["immediate", "daily", "weekly", "off"]).default("immediate"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("notification_preferences").upsert(
      {
        user_id: context.userId,
        type_code: data.typeCode,
        in_app: data.inApp,
        digest_mode: data.digestMode,
      },
      { onConflict: "user_id,type_code" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
