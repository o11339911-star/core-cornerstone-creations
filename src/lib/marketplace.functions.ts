import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 24 — marketplace listings, entitlements and subscription state.
 *
 * Marketplace data is deliberately isolated from project data: a commercial
 * interaction never grants access to any project module. Every write goes
 * through a SECURITY DEFINER RPC; the publishing identity is derived
 * server-side from the active account, never from client input.
 */

const uuid = z.string().uuid();

export const listingSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  service_kind: z.string(),
  title: z.string(),
  description: z.string(),
  price_min: z.union([z.number(), z.string()]).nullable(),
  price_max: z.union([z.number(), z.string()]).nullable(),
  status: z.string(),
  created_by: z.string().uuid(),
  created_at: z.string(),
});
export type ServiceListing = z.infer<typeof listingSchema>;

export const listingAreaSchema = z.object({
  id: z.string().uuid(),
  listing_id: z.string().uuid(),
  country_code: z.string(),
  region: z.string().nullable(),
  city: z.string().nullable(),
});
export type ListingArea = z.infer<typeof listingAreaSchema>;

const LISTING_COLS =
  "id, entity_id, service_kind, title, description, price_min, price_max, status, created_by, created_at";

export const listServiceListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid.nullable().default(null),
        serviceKind: z.string().nullable().default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ServiceListing[]> => {
    let q = context.supabase.from("service_listings").select(LISTING_COLS);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.serviceKind) q = q.eq("service_kind", data.serviceKind);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return z.array(listingSchema).parse(rows ?? []);
  });

export const listListingAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listingIds: z.array(uuid) }).parse(input))
  .handler(async ({ data, context }): Promise<ListingArea[]> => {
    if (data.listingIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("service_listing_areas")
      .select("id, listing_id, country_code, region, city")
      .in("listing_id", data.listingIds);
    if (error) throw new Error(error.message);
    return z.array(listingAreaSchema).parse(rows ?? []);
  });

export const publishServiceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid,
        serviceKind: z.string().min(2),
        title: z.string().min(4).max(160),
        description: z.string().min(20).max(4000),
        areas: z
          .array(
            z.object({
              country_code: z.string().min(2).max(2),
              region: z.string().nullable().default(null),
              city: z.string().nullable().default(null),
            }),
          )
          .default([]),
        priceMin: z.number().nullable().default(null),
        priceMax: z.number().nullable().default(null),
        publish: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("publish_service_listing", {
      _entity_id: data.entityId,
      _service_kind: data.serviceKind,
      _title: data.title,
      _description: data.description,
      _areas: data.areas,
      ...(data.priceMin !== null ? { _price_min: data.priceMin } : {}),
      ...(data.priceMax !== null ? { _price_max: data.priceMax } : {}),
      _publish: data.publish,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

/* --------------------------------------------------- entitlements & plan */

export const entitlementSchema = z.object({
  code: z.string(),
  description_ar: z.string(),
  is_commercial: z.boolean(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

export const listEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Entitlement[]> => {
    const { data, error } = await context.supabase
      .from("entitlements")
      .select("code, description_ar, is_commercial")
      .order("code");
    if (error) throw new Error(error.message);
    return z.array(entitlementSchema).parse(data ?? []);
  });

export const listEntityEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("entity_entitlements")
      .select("code, expires_at")
      .eq("entity_id", data.entityId);
    if (error) throw new Error(error.message);
    return z
      .array(z.object({ code: z.string(), expires_at: z.string().nullable() }))
      .parse(rows ?? []);
  });

export const grantEntityEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: uuid, code: z.string().min(2) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("grant_entity_entitlement", {
      _entity_id: data.entityId,
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    return true;
  });

export const getSubscriptionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("entity_subscription_state")
      .select("entity_id, state, grace_until, read_only_since, policy_note")
      .eq("entity_id", data.entityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const exportEntityData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: payload, error } = await context.supabase.rpc("export_entity_data", {
      _entity_id: data.entityId,
    });
    if (error) throw new Error(error.message);
    return JSON.stringify(payload ?? {});
  });
