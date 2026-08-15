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
  party_entity_id: z.string().uuid(),
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
  "id, project_id, party_entity_id, party_role, scope_text_ar, scope_text_en, starts_on, ends_on, status, responded_at, ended_at, end_reason, created_at";

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
        startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        stageIds: z.array(z.string().uuid()).default([]),
        permissions: z
          .array(z.object({ module: z.enum(PARTY_MODULES), action: z.enum(PARTY_ACTIONS) }))
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc("invite_project_party", {
      _project_id: data.projectId,
      _party_entity_id: data.partyEntityId,
      _party_role: data.partyRole,
      _scope_text_ar: data.scopeTextAr ?? undefined,
      _scope_text_en: data.scopeTextEn ?? undefined,
      _starts_on: data.startsOn ?? new Date().toISOString().slice(0, 10),
      _ends_on: data.endsOn ?? undefined,

      _stage_ids: data.stageIds,
      _permissions: data.permissions,
    });

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
