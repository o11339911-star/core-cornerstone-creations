import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Precise project/property location.
 *
 * There is exactly one stored location per subject: a project linked to a
 * property reads and writes the property's exact-location row, an unlinked
 * project uses its own `project_locations` row. Nothing is copied between
 * them. Validation, permission checks and the audit trail all live in the
 * database functions, this layer only shapes the payload.
 */

const positionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** GeoJSON Polygon, bounded in size to match the database validator. */
const boundarySchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z
      .array(z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(4).max(2000))
      .min(1)
      .max(10),
  })
  .nullable();

export type LocationBoundary = z.infer<typeof boundarySchema>;

export const preciseLocationSchema = z.object({
  source: z.enum(["project", "property"]),
  property_id: z.string().uuid().nullable(),
  visible: z.boolean(),
  can_edit: z.boolean(),
  complete: z.boolean(),
  address: z.string().nullable().default(null),
  lat: z.coerce.number().nullable().default(null),
  lng: z.coerce.number().nullable().default(null),
  has_boundary: z.boolean().default(false),
  boundary: boundarySchema.default(null),
});
export type PreciseLocation = z.infer<typeof preciseLocationSchema>;

export const getProjectLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PreciseLocation> => {
    const { data: row, error } = await context.supabase.rpc("project_precise_location", {
      _project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return preciseLocationSchema.parse(row);
  });

const saveInput = z.object({
  address: z.string().trim().min(3).max(400),
  boundary: boundarySchema.optional().default(null),
  ...positionSchema.shape,
});

export const saveProjectLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    saveInput.extend({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("set_project_precise_location", {
      _project_id: data.projectId,
      _address: data.address,
      _lat: data.lat,
      _lng: data.lng,
      _boundary: data.boundary,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const savePropertyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    saveInput.extend({ propertyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("set_property_precise_location", {
      _property_id: data.propertyId,
      _address: data.address,
      _lat: data.lat,
      _lng: data.lng,
      _boundary: data.boundary,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------- analysis suggestion ---------------------------- */

export const locationSuggestionSchema = z.object({
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  source: z.string(),
  confidence: z.number().nullable(),
});
export type LocationSuggestion = z.infer<typeof locationSuggestionSchema>;

const num = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value.replace(/[^\d.+-]/g, "")) : Number(value);
  return Number.isFinite(n) ? n : null;
};

const pick = (fields: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of Object.keys(fields)) {
    const normalized = key.toLowerCase();
    if (keys.some((k) => normalized === k || normalized.includes(k))) return fields[key];
  }
  return undefined;
};

/**
 * Read-only hint from an already stored deed/licence analysis. It is shown as a
 * suggestion with its source and confidence and is never persisted automatically.
 */
export const suggestProjectLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<LocationSuggestion[]> => {
    const { data: links } = await context.supabase
      .from("document_links")
      .select("document_id")
      .eq("context_type", "project")
      .eq("context_id", data.projectId)
      .limit(50);
    const docIds = (links ?? []).map((l) => l.document_id);
    if (docIds.length === 0) return [];

    const { data: rows } = await context.supabase
      .from("document_analyses")
      .select("detected_type, extracted_fields, field_confidence, status")
      .in("document_id", docIds)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20);

    const suggestions: LocationSuggestion[] = [];
    for (const row of rows ?? []) {
      const fields = (row.extracted_fields ?? {}) as Record<string, unknown>;
      const conf = (row.field_confidence ?? {}) as Record<string, unknown>;
      const address = pick(fields, ["address", "عنوان", "location", "الموقع"]);
      const lat = num(pick(fields, ["lat", "خط العرض"]));
      const lng = num(pick(fields, ["lng", "long", "خط الطول"]));
      const addressText = typeof address === "string" ? address.trim() : "";
      if (!addressText && (lat === null || lng === null)) continue;
      suggestions.push({
        address: addressText || null,
        lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
        lng: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
        source: row.detected_type ?? "document",
        confidence: num(pick(conf, ["address", "location", "overall"])),
      });
    }
    return suggestions.slice(0, 3);
  });
