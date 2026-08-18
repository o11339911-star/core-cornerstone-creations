import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * إدارة كاملة لمدير النظام (المرحلة 21).
 *
 * كل دالة هنا غلاف رقيق فوق RPC محروسة داخل القاعدة بـ
 * `private.assert_platform_admin()` وتسجّل الفعل في `permission_audit_log`.
 * لا تُعاد أي بيانات اعتماد (كلمات مرور/رموز) في أي مسار.
 *
 * الهجرة `supabase/migrations/applied/10_admin_full_management.sql` مطبَّقة على
 * القاعدة (2026-08-18)، فلا مسارات احتياطية هنا: أي خطأ يُترجم إلى رسالة عربية
 * مفهومة ويُعرض كما هو.
 */

const uuid = z.string().uuid();
const reason = z.string().trim().min(5, "السبب مطلوب");
const strongReason = z.string().trim().min(10, "السبب مطلوب بتفصيل كافٍ");

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AdminActionResult =
  | { ok: true; code: "done"; data: JsonValue }
  | { ok: false; code: "forbidden" | "blocked" | "confirm_mismatch"; message: string };

type LooseRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** يحوّل خطأ القاعدة إلى نتيجة عربية مفهومة بدل نص تقني خام. */
function toResult(message: string): AdminActionResult {
  if (/forbidden/i.test(message)) {
    return { ok: false, code: "forbidden", message: "هذا الإجراء متاح لمدير النظام فقط." };
  }
  if (/confirm_mismatch/i.test(message)) {
    return { ok: false, code: "confirm_mismatch", message: "الاسم المكتوب للتأكيد لا يطابق الاسم المسجّل." };
  }
  if (/erasure_blocked/i.test(message)) {
    return {
      ok: false,
      code: "blocked",
      message: "الحذف الكامل ممنوع حاليًا بسبب التزامات قائمة — استخدم التجميد أو الحذف الجزئي.",
    };
  }
  if (/entity_has_obligations/i.test(message)) {
    return { ok: false, code: "blocked", message: "لا يمكن حذف الكيان لوجود مشاريع أو عقود قائمة." };
  }
  if (/reason_required/i.test(message)) {
    return { ok: false, code: "blocked", message: "السبب مطلوب ويجب أن يكون واضحًا." };
  }
  if (/not_found/i.test(message)) {
    return { ok: false, code: "blocked", message: "لم يعد هذا السجل موجودًا." };
  }
  return { ok: false, code: "blocked", message: "تعذّر تنفيذ الإجراء. حاول مرة أخرى." };
}

async function callAdminRpc(
  rpc: LooseRpc,
  name: string,
  args: Record<string, unknown>,
): Promise<AdminActionResult> {
  const { data, error } = await rpc(name, args);
  if (error) return toResult(error.message);
  return { ok: true, code: "done", data: (data ?? null) as JsonValue };
}

function looseRpc(client: unknown): LooseRpc {
  const c = client as { rpc: LooseRpc };
  return c.rpc.bind(c) as LooseRpc;
}

/* ------------------------------------------------------------------ *
 * المستخدمون
 * ------------------------------------------------------------------ */

/** كشف رقم الهوية كاملًا لمدير النظام — كل كشف يُسجَّل في سجل التدقيق. */
export const adminRevealIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid, reason }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; identity: string | null } | AdminActionResult> => {
      const rpc = looseRpc(context.supabase);
      const logged = await callAdminRpc(rpc, "admin_log_identity_reveal", {
        _user_id: data.userId,
        _reason: data.reason,
      });
      if (!logged.ok) return logged;

      const { revealIdentity } = await import("@/lib/identity-crypto.server");
      try {
        const identity = await revealIdentity(data.userId, context.userId);
        return { ok: true as const, identity };
      } catch {
        return { ok: true as const, identity: null };
      }
    },
  );

export const adminUpdateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: uuid,
        fullName: z.string().trim().max(160).optional(),
        phone: z.string().trim().max(32).optional(),
        reason,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_update_user_profile", {
      _user_id: data.userId,
      _full_name: data.fullName ?? null,
      _phone: data.phone ?? null,
      _reason: data.reason,
    }),
  );

export const adminSetUserSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: uuid, suspended: z.boolean(), reason }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_set_user_suspension", {
      _user_id: data.userId,
      _suspended: data.suspended,
      _reason: data.reason,
    }),
  );

export const adminSetMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        membershipId: uuid,
        role: z.string().trim().min(2).optional(),
        status: z.enum(["active", "suspended", "revoked", "pending"]).optional(),
        reason,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_set_membership", {
      _membership_id: data.membershipId,
      _role: data.role ?? null,
      _status: data.status ?? null,
      _reason: data.reason,
    }),
  );

export const adminAddMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: uuid, entityId: uuid, role: z.string().trim().min(2), reason }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_add_membership", {
      _user_id: data.userId,
      _entity_id: data.entityId,
      _role: data.role,
      _reason: data.reason,
    }),
  );

export const adminEvaluateUserErasure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_evaluate_user_erasure", {
      _user_id: data.userId,
    }),
  );

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: uuid, reason: strongReason, confirmName: z.string().trim().min(2) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_delete_user", {
      _user_id: data.userId,
      _reason: data.reason,
      _confirm_name: data.confirmName,
    }),
  );

/* ------------------------------------------------------------------ *
 * الكيانات
 * ------------------------------------------------------------------ */

export const adminUpdateEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid,
        name: z.string().trim().max(200).optional(),
        type: z.string().trim().max(60).optional(),
        status: z.string().trim().max(40).optional(),
        reason,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_update_entity", {
      _entity_id: data.entityId,
      _name: data.name ?? null,
      _type: data.type ?? null,
      _status: data.status ?? null,
      _reason: data.reason,
    }),
  );

export const adminSetEntitySuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: uuid, suspended: z.boolean(), reason }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_set_entity_suspension", {
      _entity_id: data.entityId,
      _suspended: data.suspended,
      _reason: data.reason,
    }),
  );

export const adminSetEntityVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid,
        status: z.enum(["unverified", "pending", "verified", "rejected"]),
        reason,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_set_entity_verification", {
      _entity_id: data.entityId,
      _status: data.status,
      _reason: data.reason,
    }),
  );

export const adminEntityDependencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_entity_dependencies", {
      _entity_id: data.entityId,
    }),
  );

export const adminDeleteEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: uuid, reason: strongReason, confirmName: z.string().trim().min(2) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_delete_entity", {
      _entity_id: data.entityId,
      _reason: data.reason,
      _confirm_name: data.confirmName,
    }),
  );

/* ------------------------------------------------------------------ *
 * المشاريع والمحتوى العام
 * ------------------------------------------------------------------ */

export const adminProjectRowSchema = z.object({
  project_id: z.string(),
  name: z.string(),
  status: z.string(),
  entity_id: z.string().nullable(),
  entity_name: z.string().nullable(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
  total_count: z.number(),
});
export type AdminProjectRow = z.infer<typeof adminProjectRowSchema>;

export const adminListProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: z.string().trim().max(160).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: AdminProjectRow[]; total: number }> => {
      const rpc = looseRpc(context.supabase);
      const { data: rows, error } = await rpc("admin_list_projects", {
        ...(data.q ? { _q: data.q } : {}),
        _limit: data.limit ?? 50,
        _offset: data.offset ?? 0,
      });
      if (error) throw new Error(/forbidden/i.test(error.message) ? "FORBIDDEN" : error.message);
      const parsed = adminProjectRowSchema.array().parse(rows ?? []);
      return { rows: parsed, total: parsed[0]?.total_count ?? 0 };
    },
  );

export const adminSetProjectState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ projectId: uuid, action: z.enum(["suspend", "cancel", "reopen"]), reason })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_set_project_state", {
      _project_id: data.projectId,
      _action: data.action,
      _reason: data.reason,
    }),
  );

export const adminRemovePublicContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["service_listing", "marketing_asset", "entity_public_profile"]),
        id: uuid,
        reason,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> =>
    callAdminRpc(looseRpc(context.supabase), "admin_remove_public_content", {
      _kind: data.kind,
      _id: data.id,
      _reason: data.reason,
    }),
  );
