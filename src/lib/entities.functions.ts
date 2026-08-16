import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Entity onboarding and official-record management.
 *
 * Nothing here writes `entities`, `entity_profiles` or `entity_memberships`
 * directly: those grants were revoked. Every mutation goes through an atomic
 * SECURITY DEFINER RPC that re-derives the caller from `auth.uid()`, so the
 * client can neither pick the owner, the role, nor the verification state.
 */

export const ENTITY_TYPES = [
  "developer",
  "contractor",
  "company",
  "design_office",
  "supervision",
  "inspector",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const LEGAL_FORMS = [
  "individual",
  "company",
  "establishment",
  "government",
  "association",
  "fund",
  "partnership",
] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

export const RELATIONSHIP_TYPES = [
  "owns",
  "subsidiary_of",
  "branch_of",
  "partner_of",
  "controls",
] as const;

/** Official identifiers are ASCII-digit only; the database rejects anything else. */
const digits = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^[0-9]{${min},${max}}$`))
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

const officialInput = z.object({
  legalForm: z.enum(LEGAL_FORMS),
  legalNameAr: optionalText(160),
  legalNameEn: optionalText(160),
  unifiedNationalNumber: digits(10, 15),
  crNumber: digits(10, 15),
  taxNumber: digits(15, 15),
  contactEmail: z.string().trim().email().optional().or(z.literal("")).transform((v) => v || undefined),
  contactPhone: optionalText(30),
  buildingNo: digits(1, 8),
  street: optionalText(160),
  district: optionalText(120),
  city: optionalText(120),
  postalCode: digits(5, 5),
  additionalNo: digits(4, 4),
  responsibleName: optionalText(160),
  responsibleTitle: optionalText(120),
  responsibleEmail: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  responsiblePhone: optionalText(30),
});

export type EntityOfficialInput = z.input<typeof officialInput>;

/**
 * Drops `undefined` keys so the RPC receives only the arguments the caller
 * actually supplied (the SQL side keeps existing values for missing ones).
 */
function compact<T extends Record<string, unknown>>(args: T): T {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)) as T;
}



/** Maps a raw Postgres error to a stable, non-revealing code. */
function mapError(message: string): string {
  if (message.includes("OFFICIAL_ID_ALREADY_REGISTERED")) return "OFFICIAL_ID_ALREADY_REGISTERED";
  if (message.includes("ENTITY_LIMIT_REACHED")) return "ENTITY_LIMIT_REACHED";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  if (message.includes("TARGET_NOT_FOUND")) return "TARGET_NOT_FOUND";
  if (message.includes("INVALID")) return "INVALID_INPUT";
  if (message.includes("violates check constraint")) return "INVALID_INPUT";
  if (message.includes("duplicate key")) return "OFFICIAL_ID_ALREADY_REGISTERED";
  return "UNKNOWN";
}

/* ------------------------------- creation ------------------------------- */

export const createEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    officialInput
      .extend({
        name: z.string().trim().min(2).max(160),
        type: z.enum(ENTITY_TYPES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ entityId: string }> => {
    const { data: entityId, error } = await context.supabase.rpc("create_entity_with_owner", compact({
      _name: data.name,
      _type: data.type,
      _legal_form: data.legalForm,
      _legal_name_ar: data.legalNameAr ?? undefined,
      _legal_name_en: data.legalNameEn ?? undefined,
      _unified_national_number: data.unifiedNationalNumber ?? undefined,
      _cr_number: data.crNumber ?? undefined,
      _tax_number: data.taxNumber ?? undefined,
      _contact_email: data.contactEmail ?? undefined,
      _contact_phone: data.contactPhone ?? undefined,
      _building_no: data.buildingNo ?? undefined,
      _street: data.street ?? undefined,
      _district: data.district ?? undefined,
      _city: data.city ?? undefined,
      _postal_code: data.postalCode ?? undefined,
      _additional_no: data.additionalNo ?? undefined,
      _responsible_name: data.responsibleName ?? undefined,
      _responsible_title: data.responsibleTitle ?? undefined,
      _responsible_email: data.responsibleEmail ?? undefined,
      _responsible_phone: data.responsiblePhone ?? undefined,
    }));

    if (error) throw new Error(mapError(error.message));
    return { entityId: entityId as string };
  });

/* ------------------------------- reading -------------------------------- */

export const entityOfficialSchema = z.object({
  name: z.string(),
  type: z.string(),
  status: z.string(),
  legal_form: z.string().nullable(),
  legal_name_ar: z.string().nullable(),
  legal_name_en: z.string().nullable(),
  unified_national_number: z.string().nullable(),
  cr_number: z.string().nullable(),
  tax_number: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  building_no: z.string().nullable(),
  street: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  additional_no: z.string().nullable(),
  responsible_name: z.string().nullable(),
  responsible_title: z.string().nullable(),
  responsible_email: z.string().nullable(),
  responsible_phone: z.string().nullable(),
  verification_status: z.string().nullable(),
  verification_note: z.string().nullable(),
  verified_at: z.string().nullable(),
});
export type EntityOfficial = z.infer<typeof entityOfficialSchema>;

export const getEntityOfficial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EntityOfficial> => {
    const { data: row, error } = await context.supabase.rpc("get_entity_official", {
      _entity_id: data.entityId,
    });
    if (error) throw new Error(mapError(error.message));
    return entityOfficialSchema.parse(row);
  });

/** True when the caller can edit official data / manage relationships. */
export const getMyEntityRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ role: string | null; canManage: boolean }> => {
    const { data: row, error } = await context.supabase
      .from("entity_memberships")
      .select("role")
      .eq("entity_id", data.entityId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    const role = (row as { role?: string } | null)?.role ?? null;
    return { role, canManage: role === "owner" || role === "admin" };
  });

/* ------------------------------- updating ------------------------------- */

export const updateEntityOfficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    officialInput
      .partial()
      .extend({ entityId: z.string().uuid(), legalForm: z.enum(LEGAL_FORMS).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("update_entity_official", compact({
      _entity_id: data.entityId,
      _legal_form: data.legalForm ?? undefined,
      _legal_name_ar: data.legalNameAr ?? undefined,
      _legal_name_en: data.legalNameEn ?? undefined,
      _unified_national_number: data.unifiedNationalNumber ?? undefined,
      _cr_number: data.crNumber ?? undefined,
      _tax_number: data.taxNumber ?? undefined,
      _contact_email: data.contactEmail ?? undefined,
      _contact_phone: data.contactPhone ?? undefined,
      _building_no: data.buildingNo ?? undefined,
      _street: data.street ?? undefined,
      _district: data.district ?? undefined,
      _city: data.city ?? undefined,
      _postal_code: data.postalCode ?? undefined,
      _additional_no: data.additionalNo ?? undefined,
      _responsible_name: data.responsibleName ?? undefined,
      _responsible_title: data.responsibleTitle ?? undefined,
      _responsible_email: data.responsibleEmail ?? undefined,
      _responsible_phone: data.responsiblePhone ?? undefined,
    }));
    if (error) throw new Error(mapError(error.message));
    return { ok: true };
  });

/* ----------------------------- relationships ---------------------------- */

export const relationshipSchema = z.object({
  id: z.string().uuid(),
  relationship_type: z.enum(RELATIONSHIP_TYPES),
  ownership_percent: z.number().nullable(),
  status: z.enum(["pending", "accepted", "rejected"]),
  starts_on: z.string(),
  created_at: z.string(),
  direction: z.enum(["outgoing", "incoming"]),
  counterpart_name: z.string(),
});
export type EntityRelationship = z.infer<typeof relationshipSchema>;

export const listEntityRelationships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EntityRelationship[]> => {
    const { data: rows, error } = await context.supabase
      .from("entity_relationships")
      .select(
        "id, relationship_type, ownership_percent, status, starts_on, created_at, source_entity_id, target_entity_id, source:entities!entity_relationships_source_entity_id_fkey(name), target:entities!entity_relationships_target_entity_id_fkey(name)",
      )
      .or(`source_entity_id.eq.${data.entityId},target_entity_id.eq.${data.entityId}`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    type Row = {
      id: string;
      relationship_type: (typeof RELATIONSHIP_TYPES)[number];
      ownership_percent: number | null;
      status: "pending" | "accepted" | "rejected";
      starts_on: string;
      created_at: string;
      source_entity_id: string;
      target_entity_id: string;
      source: { name: string } | null;
      target: { name: string } | null;
    };

    return ((rows ?? []) as unknown as Row[]).map((r) => {
      const outgoing = r.source_entity_id === data.entityId;
      return relationshipSchema.parse({
        id: r.id,
        relationship_type: r.relationship_type,
        ownership_percent: r.ownership_percent,
        status: r.status,
        starts_on: r.starts_on,
        created_at: r.created_at,
        direction: outgoing ? "outgoing" : "incoming",
        counterpart_name: (outgoing ? r.target?.name : r.source?.name) ?? "—",
      });
    });
  });

export const requestEntityRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        targetSlug: z.string().trim().min(2).max(80),
        relationshipType: z.enum(RELATIONSHIP_TYPES),
        ownershipPercent: z.number().positive().max(100).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc("request_entity_relationship", compact({
      _source_entity_id: data.entityId,
      _target_slug: data.targetSlug,
      _relationship_type: data.relationshipType,
      _ownership_percent: data.ownershipPercent ?? undefined,
    }));
    if (error) throw new Error(mapError(error.message));
    return { id: id as string };
  });

export const decideEntityRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ relationshipId: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("decide_entity_relationship", {
      _relationship_id: data.relationshipId,
      _accept: data.accept,
    });
    if (error) throw new Error(mapError(error.message));
    return { ok: true };
  });
