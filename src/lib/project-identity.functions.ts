import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Unified project / property identity.
 *
 * Everything here is READ-ONLY and resolved live from the original sources
 * (property owners, deeds, licences, parcel/plan, precise location, project
 * parties). No value is copied or backfilled into a second table.
 *
 * The database decides which field groups the caller may see; groups the
 * caller is not allowed to read are simply absent from the payload — they are
 * never sent and hidden in the UI. Person identifiers are limited to the last
 * four digits; ciphers, fingerprints and matched ids never leave the server.
 */

export const IDENTITY_GROUPS = [
  "ownership",
  "deed_license",
  "parcel_plan",
  "precise_location",
  "contractor",
  "contracted_parties",
] as const;
export type IdentityGroup = (typeof IDENTITY_GROUPS)[number];

export const IDENTITY_GROUP_LABELS: Record<IdentityGroup, string> = {
  ownership: "الملكية",
  deed_license: "الصك والرخصة",
  parcel_plan: "القطعة والمخطط",
  precise_location: "الموقع الدقيق",
  contractor: "المقاول",
  contracted_parties: "الأطراف المتعاقدة",
};

export const IDENTITY_LEVELS = ["internal", "all_parties", "selected_parties"] as const;
export type IdentityLevel = (typeof IDENTITY_LEVELS)[number];

export const IDENTITY_LEVEL_LABELS: Record<IdentityLevel, string> = {
  internal: "داخلي فقط",
  all_parties: "جميع أطراف المشروع",
  selected_parties: "أطراف محددة",
};

const partySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().nullable().default(null),
  kind: z.string().nullable().default(null),
  role: z.string().nullable().default(null),
  identifier_kind: z.string().nullable().default(null),
  identifier_value: z.string().nullable().default(null),
  is_full_identifier: z.boolean().default(false),
  status: z.string().nullable().default(null),
  starts_on: z.string().nullable().default(null),
  ends_on: z.string().nullable().default(null),
});

const ownerSchema = z.object({
  name: z.string().nullable().default(null),
  kind: z.string().nullable().default(null),
  legal_form: z.string().nullable().default(null),
  identifier_kind: z.string().nullable().default(null),
  identifier_value: z.string().nullable().default(null),
  is_full_identifier: z.boolean().default(false),
  share_percent: z.coerce.number().nullable().default(null),
  verification_status: z.string().nullable().default(null),
});

const groupsSchema = z.object({
  ownership: ownerSchema.array().optional(),
  deed_license: z
    .object({
      deed_number: z.string().nullable().default(null),
      deed_issuer: z.string().nullable().default(null),
      license_number: z.string().nullable().default(null),
      license_authority: z.string().nullable().default(null),
    })
    .optional(),
  parcel_plan: z
    .object({
      parcel_no: z.string().nullable().default(null),
      plan_no: z.string().nullable().default(null),
    })
    .optional(),
  precise_location: z
    .object({
      address: z.string().nullable().default(null),
      has_point: z.boolean().default(false),
      has_boundary: z.boolean().default(false),
      complete: z.boolean().default(false),
    })
    .optional(),
  contractor: partySchema.array().optional(),
  contracted_parties: partySchema.array().optional(),
});

const linkedProjectSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().nullable().default(null),
  code: z.string().nullable().default(null),
  relation: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
});

const identitySchema = z.object({
  project_id: z.string().uuid().nullable().default(null),
  project_name: z.string().nullable().default(null),
  project_code: z.string().nullable().default(null),
  property_id: z.string().uuid().nullable().default(null),
  primary_project_id: z.string().uuid().nullable().default(null),
  linked_projects: linkedProjectSchema.array().default([]),
  can_manage: z.boolean().default(false),
  groups: groupsSchema.default({}),
});
export type UnifiedIdentity = z.infer<typeof identitySchema>;

export const getProjectIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<UnifiedIdentity> => {
    const { data: row, error } = await context.supabase.rpc("project_identity", {
      _project_id: data.projectId,
    });
    if (error) throw new Error("IDENTITY_FORBIDDEN");
    return identitySchema.parse(row);
  });

export const getPropertyIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<UnifiedIdentity> => {
    const { data: row, error } = await context.supabase.rpc("property_identity", {
      _property_id: data.propertyId,
    });
    if (error) throw new Error("IDENTITY_FORBIDDEN");
    return identitySchema.parse(row);
  });

/* ------------------------------ visibility admin ----------------------------- */

const settingsSchema = z.object({
  project_id: z.string().uuid(),
  settings: z
    .object({
      field_group: z.enum(IDENTITY_GROUPS),
      level: z.enum(IDENTITY_LEVELS),
      party_ids: z.string().uuid().array().default([]),
    })
    .array()
    .default([]),
});
export type IdentityVisibilitySettings = z.infer<typeof settingsSchema>;

export const getIdentityVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<IdentityVisibilitySettings> => {
    const { data: row, error } = await context.supabase.rpc(
      "project_identity_visibility_settings",
      { _project_id: data.projectId },
    );
    if (error) throw new Error("IDENTITY_VISIBILITY_FORBIDDEN");
    return settingsSchema.parse(row);
  });

export const setIdentityVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        fieldGroup: z.enum(IDENTITY_GROUPS),
        level: z.enum(IDENTITY_LEVELS),
        partyIds: z.string().uuid().array().max(200).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("set_project_identity_visibility", {
      _project_id: data.projectId,
      _field_group: data.fieldGroup,
      _level: data.level,
      _party_ids: data.level === "selected_parties" ? data.partyIds : [],
    });
    if (error) throw new Error("IDENTITY_VISIBILITY_SAVE_FAILED");
    return { ok: true };
  });

/** Accepted project parties, used only to fill the "selected parties" picker. */
export const listIdentityAudienceParties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ id: string; display_name: string; party_role: string }[]> => {
      const { data: rows, error } = await context.supabase.rpc("list_assignable_project_parties", {
        _project_id: data.projectId,
      });
      if (error) return [];
      return (rows ?? []).map((r) => ({
        id: r.id,
        display_name: r.display_name ?? "طرف",
        party_role: String(r.party_role),
      }));
    },
  );
