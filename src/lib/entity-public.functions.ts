import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 21 — public entity profiles.
 *
 * `getPublicEntityProfile` is intentionally unauthenticated: it calls a
 * SECURITY DEFINER RPC that projects an explicit allowlist of public fields.
 * No internal identifier (entity_id, project_id, tenant ids) ever leaves the
 * database through this path — the slug is the only public handle.
 */

export const publicPortfolioItemSchema = z.object({
  title_ar: z.string(),
  title_en: z.string().nullable(),
  summary_ar: z.string().nullable(),
  summary_en: z.string().nullable(),
  project_type_code: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  completed_on: z.string().nullable(),
});

export const publicEntityProfileSchema = z.object({
  slug: z.string(),
  display_name_ar: z.string(),
  display_name_en: z.string().nullable(),
  activity_ar: z.string().nullable(),
  activity_en: z.string().nullable(),
  services: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  bio_ar: z.string().nullable(),
  bio_en: z.string().nullable(),
  logo_url: z.string().nullable(),
  website_url: z.string().nullable(),
  public_email: z.string().nullable(),
  public_phone: z.string().nullable(),
  is_verified: z.boolean(),
  portfolio: z.array(publicPortfolioItemSchema).default([]),
});

export type PublicEntityProfile = z.infer<typeof publicEntityProfileSchema>;
export type PublicPortfolioItem = z.infer<typeof publicPortfolioItemSchema>;

/** Public, anon-safe read. Returns null for missing / unpublished / deleted. */
export const getPublicEntityProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().min(2).max(80) }).parse(input),
  )
  .handler(async ({ data }): Promise<PublicEntityProfile | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Supabase is not configured");
    const anon = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: row, error } = await anon.rpc("get_public_entity_profile", {
      _slug: data.slug.toLowerCase(),
    });
    if (error) throw new Error(error.message);
    if (!row) return null;
    return publicEntityProfileSchema.parse(row);
  });

/* ----------------------------------------------------------- management */

const manageSchema = z.object({
  entityId: z.string().uuid(),
  displayNameAr: z.string().min(2).max(160),
  displayNameEn: z.string().max(160).nullable().default(null),
  activityAr: z.string().max(200).nullable().default(null),
  activityEn: z.string().max(200).nullable().default(null),
  services: z.array(z.string().min(1).max(80)).max(30).default([]),
  regions: z.array(z.string().min(1).max(80)).max(30).default([]),
  bioAr: z.string().max(2000).nullable().default(null),
  bioEn: z.string().max(2000).nullable().default(null),
  logoUrl: z.string().url().startsWith("https://").nullable().default(null),
  websiteUrl: z.string().url().nullable().default(null),
  publicEmail: z.string().email().nullable().default(null),
  publicPhone: z.string().max(40).nullable().default(null),
});

export const getMyEntityPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("entity_public_profiles")
      .select(
        "slug, display_name_ar, display_name_en, activity_ar, activity_en, services, regions, bio_ar, bio_en, logo_url, website_url, public_email, public_phone, is_published, portfolio_opt_in, published_at",
      )
      .eq("entity_id", data.entityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveEntityPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => manageSchema.parse(input))
  .handler(async ({ data, context }): Promise<string> => {
    const { data: slug, error } = await context.supabase.rpc("upsert_entity_public_profile", {
      _entity_id: data.entityId,
      _display_name_ar: data.displayNameAr,
      _display_name_en: data.displayNameEn,
      _activity_ar: data.activityAr,
      _activity_en: data.activityEn,
      _services: data.services,
      _regions: data.regions,
      _bio_ar: data.bioAr,
      _bio_en: data.bioEn,
      _logo_url: data.logoUrl,
      _website_url: data.websiteUrl,
      _public_email: data.publicEmail,
      _public_phone: data.publicPhone,
    });
    if (error) throw new Error(error.message);
    return slug as string;
  });

export const setEntityPublishState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        isPublished: z.boolean(),
        portfolioOptIn: z.boolean().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_entity_public_publish", {
      _entity_id: data.entityId,
      _is_published: data.isPublished,
      _portfolio_opt_in: data.portfolioOptIn,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const setEntitySlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: z.string().uuid(), slug: z.string().min(2).max(80) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: slug, error } = await context.supabase.rpc("set_entity_slug", {
      _entity_id: data.entityId,
      _slug: data.slug,
    });
    if (error) throw new Error(error.message);
    return slug as string;
  });
