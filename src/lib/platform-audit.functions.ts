import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 20E — سجل التدقيق الإداري (قراءة فقط).
 *
 * المصدر الوحيد هو `public.admin_list_audit_log` (SECURITY DEFINER) الذي
 * يتحقق داخليًا من `private.platform_can(auth.uid(),'audit.view')`. الجدول
 * `permission_audit_log` سجلّ لاحق فقط (append-only) ولا يُعدَّل من الواجهة.
 *
 */

export const auditRowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  actor_user_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  target_user_id: z.string().nullable(),
  target_entity_id: z.string().nullable(),
  target_project_id: z.string().nullable(),
  object_type: z.string(),
  object_id: z.string().nullable(),
  action: z.string(),
});
export type AuditRow = z.infer<typeof auditRowSchema>;

export type AuditResult = {
  available: boolean;
  rows: AuditRow[];
  /** سبب عدم التوفر بصيغة مفهومة للواجهة (عربي). */
  reason: string | null;
};

type LooseRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const inputSchema = z.object({
  q: z.string().trim().max(160).optional(),
  objectType: z.string().trim().max(60).optional(),
  action: z.string().trim().max(30).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const adminListAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AuditResult> => {
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as LooseRpc;
    const res = await rpc("admin_list_audit_log", {
      _q: data.q ?? null,
      _object_type: data.objectType ?? null,
      _action: data.action ?? null,
      _limit: data.limit ?? 100,
    });

    if (!res.error) {
      return {
        available: true,
        rows: auditRowSchema.array().parse(res.data ?? []),
        reason: null,
      };
    }

    if (res.error.message.toLowerCase().includes("forbidden")) {
      throw new Error("FORBIDDEN");
    }

    throw new Error("AUDIT_READ_FAILED");
  });
