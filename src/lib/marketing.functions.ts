import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 22 — real-estate marketing and marketer contracting.
 *
 * Every write goes through a SECURITY DEFINER RPC: the tables themselves grant
 * only SELECT to `authenticated`, and RLS confines a marketer to the `marketing`
 * module of the projects they hold an active contract for. `verifyMarketingPackage`
 * is intentionally unauthenticated and returns a uniform `null` for any token that
 * is unknown, so probing cannot distinguish "missing" from "not yours".
 */

export const marketingProfileSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  owner_entity_id: z.string().uuid(),
  readiness_basis: z.string(),
  status: z.string(),
  channel_mode: z.string(),
  created_at: z.string(),
});
export type MarketingProfile = z.infer<typeof marketingProfileSchema>;

export const marketingContractSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  marketer_entity_id: z.string().uuid(),
  exclusivity: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  channels: z.array(z.string()).default([]),
  price_authority: z.string(),
  content_rights: z.string().nullable(),
  lead_rights: z.string().nullable(),
  report_rights: z.string().nullable(),
  termination_terms: z.string().nullable(),
  status: z.string(),
  termination_reason: z.string().nullable(),
  created_at: z.string(),
});
export type MarketingContract = z.infer<typeof marketingContractSchema>;

export const marketingVersionSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  version_no: z.number(),
  title_ar: z.string(),
  title_en: z.string().nullable(),
  description_ar: z.string().nullable(),
  description_en: z.string().nullable(),
  listing_price: z.union([z.number(), z.string()]).nullable(),
  price_currency: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
  approved_at: z.string().nullable(),
});
export type MarketingVersion = z.infer<typeof marketingVersionSchema>;

export const marketingLeadSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  full_name: z.string(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  channel_code: z.string().nullable(),
  note: z.string().nullable(),
  stage: z.string(),
  created_at: z.string(),
});
export type MarketingLead = z.infer<typeof marketingLeadSchema>;

export const marketingPackageSchema = z.object({
  id: z.string().uuid(),
  version_id: z.string().uuid(),
  contract_id: z.string().uuid(),
  package_no: z.number(),
  verify_token: z.string(),
  license_number_snapshot: z.string().nullable(),
  channel_code: z.string().nullable(),
  watermark_text: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});
export type MarketingPackage = z.infer<typeof marketingPackageSchema>;

const PROFILE_COLS =
  "id, project_id, owner_entity_id, readiness_basis, status, channel_mode, created_at";
const CONTRACT_COLS =
  "id, profile_id, marketer_entity_id, exclusivity, starts_on, ends_on, channels, price_authority, content_rights, lead_rights, report_rights, termination_terms, status, termination_reason, created_at";
const VERSION_COLS =
  "id, profile_id, version_no, title_ar, title_en, description_ar, description_en, listing_price, price_currency, status, created_at, approved_at";
const LEAD_COLS =
  "id, contract_id, full_name, contact_phone, contact_email, channel_code, note, stage, created_at";
const PACKAGE_COLS =
  "id, version_id, contract_id, package_no, verify_token, license_number_snapshot, channel_code, watermark_text, expires_at, revoked_at, created_at";

const uuid = z.string().uuid();

/* ------------------------------------------------------------------ reads */

export const getMarketingProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MarketingProfile | null> => {
    const { data: row, error } = await context.supabase
      .from("marketing_profiles")
      .select(PROFILE_COLS)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? marketingProfileSchema.parse(row) : null;
  });

export const listMarketingContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: uuid.nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<MarketingContract[]> => {
    let query = context.supabase
      .from("marketing_contracts")
      .select(CONTRACT_COLS)
      .order("created_at", { ascending: false });
    if (data.profileId) query = query.eq("profile_id", data.profileId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return z.array(marketingContractSchema).parse(rows ?? []);
  });

export const listMarketingVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: uuid.nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<MarketingVersion[]> => {
    let query = context.supabase
      .from("marketing_versions")
      .select(VERSION_COLS)
      .order("version_no", { ascending: false });
    if (data.profileId) query = query.eq("profile_id", data.profileId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return z.array(marketingVersionSchema).parse(rows ?? []);
  });

export const listMarketingLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ contractId: uuid.nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<MarketingLead[]> => {
    let query = context.supabase
      .from("marketing_leads")
      .select(LEAD_COLS)
      .order("created_at", { ascending: false });
    if (data.contractId) query = query.eq("contract_id", data.contractId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return z.array(marketingLeadSchema).parse(rows ?? []);
  });

export const listMarketingPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ versionId: uuid.nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<MarketingPackage[]> => {
    let query = context.supabase
      .from("marketing_packages")
      .select(PACKAGE_COLS)
      .order("created_at", { ascending: false });
    if (data.versionId) query = query.eq("version_id", data.versionId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return z.array(marketingPackageSchema).parse(rows ?? []);
  });

/* ----------------------------------------------------------------- writes */

export const createMarketingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        readinessBasis: z.enum(["ready", "off_plan"]),
        channelMode: z.enum(["internal", "external", "both"]).default("both"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("create_marketing_profile", {
      _project_id: data.projectId,
      _readiness_basis: data.readinessBasis,
      _channel_mode: data.channelMode,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const setMarketingProfileStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: uuid, status: z.enum(["draft", "active", "paused", "closed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_marketing_profile_status", {
      _profile_id: data.profileId,
      _status: data.status,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const createMarketingContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: uuid,
        marketerEntityId: uuid,
        startsOn: z.string(),
        endsOn: z.string(),
        exclusivity: z.enum(["exclusive", "non_exclusive"]),
        channels: z.array(z.string()).min(1),
        priceAuthority: z.enum(["owner_fixed", "owner_range"]).default("owner_fixed"),
        contentRights: z.string().min(2).max(1000),
        leadRights: z.string().min(2).max(1000),
        reportRights: z.string().min(2).max(1000),
        terminationTerms: z.string().min(2).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("create_marketing_contract", {
      _profile_id: data.profileId,
      _marketer_entity_id: data.marketerEntityId,
      _starts_on: data.startsOn,
      _ends_on: data.endsOn,
      _exclusivity: data.exclusivity,
      _channels: data.channels,
      _price_authority: data.priceAuthority,
      _content_rights: data.contentRights,
      _lead_rights: data.leadRights,
      _report_rights: data.reportRights,
      _termination_terms: data.terminationTerms,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const setMarketingContractAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contractId: uuid,
        kind: z.enum(["commission_percent", "fixed_fee", "marketing_budget"]),
        amount: z.number().nonnegative(),
        currency: z.string().default("SAR"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_marketing_contract_amount", {
      _contract_id: data.contractId,
      _kind: data.kind,
      _amount: data.amount,
      _currency: data.currency,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const activateMarketingContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ contractId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("activate_marketing_contract", {
      _contract_id: data.contractId,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const terminateMarketingContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ contractId: uuid, reason: z.string().min(10).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("terminate_marketing_contract", {
      _contract_id: data.contractId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const createMarketingVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: uuid,
        titleAr: z.string().min(3).max(200),
        titleEn: z.string().max(200).nullable().default(null),
        descriptionAr: z.string().max(4000).nullable().default(null),
        descriptionEn: z.string().max(4000).nullable().default(null),
        listingPrice: z.number().nonnegative().nullable().default(null),
        priceCurrency: z.string().default("SAR"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("create_marketing_version", {
      _profile_id: data.profileId,
      _title_ar: data.titleAr,
      ...(data.titleEn ? { _title_en: data.titleEn } : {}),
      ...(data.descriptionAr ? { _description_ar: data.descriptionAr } : {}),
      ...(data.descriptionEn ? { _description_en: data.descriptionEn } : {}),
      ...(data.listingPrice != null ? { _listing_price: data.listingPrice } : {}),
      _price_currency: data.priceCurrency,
      _units_snapshot: [],
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const approveMarketingVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_marketing_version", {
      _version_id: data.versionId,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const issueMarketingPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        versionId: uuid,
        contractId: uuid,
        expiresAt: z.string(),
        channelCode: z.string().max(40).nullable().default("external"),
        watermarkText: z.string().max(120).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("issue_marketing_package", {
      _version_id: data.versionId,
      _contract_id: data.contractId,
      _expires_at: data.expiresAt,
      ...(data.channelCode ? { _channel_code: data.channelCode } : {}),
      ...(data.watermarkText ? { _watermark_text: data.watermarkText } : {}),
    });
    if (error) throw new Error(error.message);
    return z
      .object({ package_no: z.number(), verify_token: z.string(), expires_at: z.string().nullable() })
      .parse(res);
  });

export const revokeMarketingPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ packageId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("revoke_marketing_package", {
      _package_id: data.packageId,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const recordMarketingLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contractId: uuid,
        fullName: z.string().min(2).max(160),
        contactPhone: z.string().max(40).nullable().default(null),
        contactEmail: z.string().max(160).nullable().default(null),
        channelCode: z.string().max(40).nullable().default("external"),
        note: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("record_marketing_lead", {
      _contract_id: data.contractId,
      _full_name: data.fullName,
      ...(data.contactPhone ? { _contact_phone: data.contactPhone } : {}),
      ...(data.contactEmail ? { _contact_email: data.contactEmail } : {}),
      ...(data.channelCode ? { _channel_code: data.channelCode } : {}),
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const updateMarketingLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        leadId: uuid,
        stage: z.enum(["new", "contacted", "qualified", "visit", "offer", "won", "lost"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_marketing_lead_stage", {
      _lead_id: data.leadId,
      _stage: data.stage,
    });
    if (error) throw new Error(error.message);
    return true;
  });

/* --------------------------------------------------------- public verify */

export const marketingVerificationSchema = z.object({
  status: z.string(),
  package_no: z.number().nullable().default(null),
  listing_title: z.string().nullable().default(null),
  marketer_name: z.string().nullable().default(null),
  license_number: z.string().nullable().default(null),
  channel_code: z.string().nullable().default(null),
  expires_at: z.string().nullable().default(null),
});
export type MarketingVerification = z.infer<typeof marketingVerificationSchema>;

/** Public, anon-safe. Returns null uniformly for unknown tokens. */
export const verifyMarketingPackage = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(6).max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<MarketingVerification | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Supabase is not configured");
    const anon = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: row, error } = await anon.rpc("verify_marketing_package", { _token: data.token });
    if (error) throw new Error(error.message);
    if (!row) return null;
    return marketingVerificationSchema.parse(row);
  });
