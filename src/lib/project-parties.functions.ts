import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 9 — external entities (design offices, contractors, inspectors...)
 * invited to a specific project. Every authorization decision lives in the
 * database (phase-5 engine + SECURITY DEFINER RPCs); nothing is trusted here.
 */

export const PARTY_ROLES = [
  "design_office",
  "supervision",
  "contractor",
  "inspector",
  "insurance",
  "accounting",
  "legal",
  "supplier",
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const PARTY_STATUSES = ["invited", "accepted", "rejected", "ended", "cancelled"] as const;

export const PARTY_MODULES = [
  "projects",
  "stages",
  "documents",
  "properties",
  "reports",
  "correspondence",
] as const;
export const PARTY_ACTIONS = ["view", "create", "update", "execute", "export"] as const;

const partySchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  party_entity_id: z.string().uuid().nullable(),
  party_kind: z.enum(["person", "entity"]).default("entity"),
  identifier_kind: z.enum(["national_id", "cr_number"]).nullable().default(null),
  identifier_last4: z.string().nullable().default(null),
  cr_number: z.string().nullable().default(null),
  party_display_name: z.string().nullable().default(null),
  party_role: z.enum(PARTY_ROLES),
  scope_text_ar: z.string().nullable(),
  scope_text_en: z.string().nullable(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  status: z.enum(PARTY_STATUSES),
  responded_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  end_reason: z.string().nullable(),
  created_at: z.string(),
});
export type ProjectParty = z.infer<typeof partySchema>;

const PARTY_COLUMNS =
  "id, project_id, party_entity_id, party_kind, identifier_kind, identifier_last4, cr_number, party_display_name, party_role, scope_text_ar, scope_text_en, starts_on, ends_on, status, responded_at, ended_at, end_reason, created_at";

export const listProjectParties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ProjectParty[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_parties")
      .select(PARTY_COLUMNS)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return partySchema.array().parse(rows ?? []);
  });

/** Invitations addressed to an entity the current user belongs to. */
export const listIncomingPartyInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ProjectParty[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_parties")
      .select(PARTY_COLUMNS)
      .eq("party_entity_id", data.entityId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return partySchema.array().parse(rows ?? []);
  });

const partyStageSchema = z.object({
  id: z.string().uuid(),
  party_id: z.string().uuid(),
  stage_id: z.string().uuid(),
});
export type PartyStage = z.infer<typeof partyStageSchema>;

export const listPartyStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PartyStage[]> => {
    const { data: parties, error: partyError } = await context.supabase
      .from("project_parties")
      .select("id")
      .eq("project_id", data.projectId);
    if (partyError) throw partyError;

    const ids = (parties ?? []).map((p) => p.id);
    if (ids.length === 0) return [];

    const { data: rows, error } = await context.supabase
      .from("project_party_stages")
      .select("id, party_id, stage_id")
      .in("party_id", ids);

    if (error) throw error;
    return partyStageSchema.array().parse(rows ?? []);
  });

const stageSchema = z.object({
  id: z.string().uuid(),
  name_ar: z.string(),
  name_en: z.string(),
  order_index: z.number(),
  status: z.string(),
});
export type ProjectStage = z.infer<typeof stageSchema>;

/** Stage list is already scoped by RLS: external parties only see their stages. */
export const listProjectStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ProjectStage[]> => {
    const { data: rows, error } = await context.supabase
      .from("project_stages")
      .select("id, name_ar, name_en, order_index, status")
      .eq("project_id", data.projectId)
      .order("order_index", { ascending: true });

    if (error) throw error;
    return stageSchema.array().parse(rows ?? []);
  });

export const inviteProjectParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        partyEntityId: z.string().uuid(),
        partyRole: z.enum(PARTY_ROLES),
        scopeTextAr: z.string().trim().max(1000).nullable().optional(),
        scopeTextEn: z.string().trim().max(1000).nullable().optional(),
        startsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        endsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        stageIds: z.array(z.string().uuid()).default([]),
        permissions: z
          .array(z.object({ module: z.enum(PARTY_MODULES), action: z.enum(PARTY_ACTIONS) }))
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const args: {
      _project_id: string;
      _party_entity_id: string;
      _party_role: PartyRole;
      _starts_on: string;
      _stage_ids: string[];
      _permissions: { module: string; action: string }[];
      _scope_text_ar?: string;
      _scope_text_en?: string;
      _ends_on?: string;
    } = {
      _project_id: data.projectId,
      _party_entity_id: data.partyEntityId,
      _party_role: data.partyRole,
      _starts_on: data.startsOn ?? new Date().toISOString().slice(0, 10),
      _stage_ids: data.stageIds,
      _permissions: data.permissions,
    };
    if (data.scopeTextAr) args._scope_text_ar = data.scopeTextAr;
    if (data.scopeTextEn) args._scope_text_en = data.scopeTextEn;
    if (data.endsOn) args._ends_on = data.endsOn;

    const { data: id, error } = await context.supabase.rpc("invite_project_party", args);

    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const respondToProjectParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ partyId: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { data: status, error } = await context.supabase.rpc("respond_to_project_party", {
      _party_id: data.partyId,
      _accept: data.accept,
    });

    if (error) throw new Error(error.message);
    return { status: status as string };
  });

/** Stops future access immediately and archives (never deletes) past work. */
export const endProjectParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partyId: z.string().uuid(),
        reason: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ endedAssignments: number }> => {
    const args: { _party_id: string; _reason?: string } = { _party_id: data.partyId };
    if (data.reason) args._reason = data.reason;

    const { data: moved, error } = await context.supabase.rpc("end_project_party", args);

    if (error) throw new Error(error.message);
    return { endedAssignments: (moved as number) ?? 0 };
  });

/* ------------------- identifier-based party invitations ------------------ */

export type { PartyLookupResult } from "@/lib/party-lookup.server";

/**
 * بحث تلقائي عن الطرف بمعرّفه. لا يُرجع معرّف مستخدم أو كيان ولا أي نص مشفّر،
 * ولا يعمل إلا لمن يملك إدارة أطراف هذا المشروع.
 */
export const lookupProjectPartyIdentifier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        partyKind: z.enum(["person", "entity"]),
        identifier: z.string().trim().min(1).max(40),
      })
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
      partyKind: data.partyKind,
      digits: normalizeNationalId(data.identifier),
      actorUserId: context.userId,
    });
    return resolved.result;
  });

const IDENTIFIED_INVITE_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "يلزم تسجيل الدخول.",
  FORBIDDEN: "لا تملك صلاحية دعوة أطراف في هذا المشروع.",
  NOT_FOUND: "المشروع غير موجود.",
  DUPLICATE_PARTY: "هذا الطرف مدعو مسبقًا في هذا المشروع.",
  OWNER_ENTITY_NOT_PARTY: "لا يمكن دعوة الجهة المالكة للمشروع كطرف خارجي.",
  STAGE_NOT_IN_PROJECT: "إحدى المراحل المحددة لا تتبع هذا المشروع.",
  IDENTIFIER_REQUIRED: "أدخل معرّفًا صحيحًا.",
};

function mapInviteError(message: string): Error {
  for (const [code, text] of Object.entries(IDENTIFIED_INVITE_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error("تعذّر إرسال الدعوة. حاول مرة أخرى.");
}

/**
 * دعوة طرف بالمعرّف (هوية شخص أو سجل/رقم موحّد لمنشأة). المطابقة تُحسم خادميًا
 * فقط؛ العميل لا يرسل أي UUID للطرف. بلا مطابقة = دعوة معلّقة بلا صلاحيات.
 */
export const inviteProjectPartyByIdentifier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        partyKind: z.enum(["person", "entity"]),
        identifier: z.string().trim().min(1).max(40),
        partyRole: z.enum(PARTY_ROLES),
        displayName: z.string().trim().max(200).nullable().optional(),
        scopeTextAr: z.string().trim().max(1000).nullable().optional(),
        endsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        stageIds: z.array(z.string().uuid()).default([]),
        permissions: z
          .array(z.object({ module: z.enum(PARTY_MODULES), action: z.enum(PARTY_ACTIONS) }))
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; pending: boolean }> => {
    const { normalizeNationalId } = await import("@/lib/identity-format");
    const { resolvePartyIdentifier } = await import("@/lib/party-lookup.server");
    const digits = normalizeNationalId(data.identifier);
    const resolved = await resolvePartyIdentifier({
      partyKind: data.partyKind,
      digits,
      actorUserId: context.userId,
    });

    if (resolved.result.status === "throttled") {
      throw new Error("محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.");
    }
    if (!resolved.fingerprint) {
      throw new Error(
        data.partyKind === "person"
          ? "رقم الهوية يجب أن يكون عشرة أرقام ويبدأ بـ 1 أو 2."
          : "السجل التجاري / الرقم الموحّد يجب أن يكون عشرة أرقام.",
      );
    }

    const { data: id, error } = await context.supabase.rpc("invite_project_party_identified", {
      _project_id: data.projectId,
      _party_kind: data.partyKind,
      _identifier_kind: data.partyKind === "person" ? "national_id" : "cr_number",
      _identifier_fingerprint: resolved.fingerprint,
      _identifier_last4: resolved.last4,
      _cr_number: data.partyKind === "entity" ? digits : null,
      _matched_entity_id: resolved.matchedEntityId,
      _matched_user_id: resolved.matchedUserId,
      _display_name: resolved.displayName ?? data.displayName ?? null,
      _party_role: data.partyRole,
      _scope_text_ar: data.scopeTextAr ?? null,
      _ends_on: data.endsOn ?? null,
      _stage_ids: data.stageIds,
      _permissions: data.permissions,
    } as never);

    if (error) throw mapInviteError(error.message);
    return { id: id as string, pending: resolved.matchedEntityId === null };
  });
