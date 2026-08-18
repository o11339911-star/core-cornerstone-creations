import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  EscalationPolicyRow,
  FlagsBoard,
  LegalVersionRow,
  PlatformBadges,
  PlatformOverview,
  SlaTimer,
} from "@/lib/platform-console.types";

/**
 * Phase 30 — واجهات مركز قيادة إدارة المنصة (قراءة فقط + نشر وثيقة قانونية).
 * كل دالة تتحقق داخليًا من عضوية فريق المنصة عبر `platform_me()` (fail-closed).
 */

export const getPlatformBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformBadges> => {
    const { readPlatformBadges } = await import("@/lib/platform-console.server");
    return readPlatformBadges(context.supabase);
  });

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOverview> => {
    const { readPlatformOverview } = await import("@/lib/platform-console.server");
    return readPlatformOverview(context.supabase);
  });

export const listSlaTimers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.string().trim().max(60).optional(),
        only: z.enum(["overdue", "due", "all"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<SlaTimer[]> => {
    const { readSlaTimers } = await import("@/lib/platform-console.server");
    return readSlaTimers(context.supabase, data);
  });

export const getFlagsBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FlagsBoard> => {
    const { readFlagsBoard } = await import("@/lib/platform-console.server");
    return readFlagsBoard(context.supabase);
  });

export const listEscalationPoliciesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EscalationPolicyRow[]> => {
    const { readEscalationPolicies } = await import("@/lib/platform-console.server");
    return readEscalationPolicies(context.supabase);
  });

export const listLegalVersionsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LegalVersionRow[]> => {
    const { readLegalVersions } = await import("@/lib/platform-console.server");
    return readLegalVersions(context.supabase);
  });

/** نشر نسخة قانونية جديدة — دالة القاعدة المحروسة هي الحد الأمني. */
export const publishLegalVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.enum(["privacy", "terms", "ip", "complaints"]),
        version: z.string().trim().min(1).max(20),
        bodyMd: z.string().trim().min(50),
        effectiveDate: z.string().trim().min(10).max(10),
        requiresAcceptance: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformSuperadmin } = await import("@/lib/platform-console.server");
    await assertPlatformSuperadmin(context.supabase);
    const { error } = await context.supabase.rpc("publish_legal_version", {
      _code: data.code,
      _version: data.version,
      _body_md: data.bodyMd,
      _effective_date: data.effectiveDate,
      _requires_acceptance: data.requiresAcceptance,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** إدارة صلاحيات الباقة لكيان — الدوال المحروسة القائمة هي الحد الأمني. */
export const setEntityEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        code: z.string().trim().min(2).max(80),
        grant: z.boolean(),
        expiresAt: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPlatformSuperadmin } = await import("@/lib/platform-console.server");
    await assertPlatformSuperadmin(context.supabase);
    const { error } = data.grant
      ? await context.supabase.rpc("grant_entity_entitlement", {
          _entity_id: data.entityId,
          _code: data.code,
          ...(data.expiresAt ? { _expires_at: data.expiresAt } : {}),
        })
      : await context.supabase.rpc("revoke_entity_entitlement", {
          _entity_id: data.entityId,
          _code: data.code,
        });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
