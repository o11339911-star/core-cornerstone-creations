import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Unified property profile: identity, owners, deeds/licences (versioned),
 * boundaries, units, services and project links.
 *
 * Every authorization decision lives in the database (RLS + the `private.*`
 * helpers). Nothing here trusts the caller's claimed scope, and the exact
 * location is served by a separate RLS-protected table, never by this layer.
 */

export const PROPERTY_KINDS = ["land", "villa", "building", "compound", "unit_block"] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

const propertyId = z.object({ propertyId: z.string().uuid() });

/* ------------------------------ list / read ----------------------------- */

export const propertyListItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(PROPERTY_KINDS),
  name: z.string(),
  status: z.string(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  land_area: z.number().nullable(),
  completion_percent: z.number().nullable(),
});
export type PropertyListItem = z.infer<typeof propertyListItemSchema>;

export const listProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ entityId: z.string().uuid().nullable().optional() })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PropertyListItem[]> => {
    let query = context.supabase
      .from("properties_public")
      .select("id, kind, name, status, city, district, land_area, completion_percent")
      .order("created_at", { ascending: false });

    // Registry mode: the property registry belongs to a verified developer
    // entity. The claimed entityId is re-authorized server-side.
    if (data?.entityId) {
      const { requireEntityOfType } = await import("@/lib/entity-scope.server");
      const scope = await requireEntityOfType(
        context.supabase,
        context.userId,
        data.entityId,
        ["developer"],
      );
      query = query.eq("entity_id", scope.entityId);
    }

    const { data: rows, error } = await query;

    if (error) throw error;
    return propertyListItemSchema.array().parse(rows ?? []);
  });

export const propertyProfileSchema = z.object({
  property: z.object({
    id: z.string().uuid(),
    owner_id: z.string().uuid(),
    entity_id: z.string().uuid().nullable(),
    kind: z.enum(PROPERTY_KINDS),
    name: z.string(),
    code: z.string().nullable(),
    status: z.string(),
    city: z.string().nullable(),
    district: z.string().nullable(),
    land_area: z.number().nullable(),
    plan_no: z.string().nullable(),
    parcel_no: z.string().nullable(),
    notes: z.string().nullable(),
    approx_lat: z.number().nullable(),
    approx_lng: z.number().nullable(),
    exact_lat: z.number().nullable(),
    exact_lng: z.number().nullable(),
    exact_address: z.string().nullable(),
    can_view_exact: z.boolean(),
    completion_percent: z.number().nullable(),
  }),
  owners: z
    .object({
      id: z.string().uuid(),
      owner_name_text: z.string().nullable(),
      owner_user_id: z.string().uuid().nullable(),
      owner_entity_id: z.string().uuid().nullable(),
      share_percent: z.number(),
      starts_on: z.string(),
      ends_on: z.string().nullable(),
    })
    .array(),
  deeds: z
    .object({
      id: z.string().uuid(),
      deed_number: z.string().nullable(),
      issuer: z.string().nullable(),
      current_version_id: z.string().uuid().nullable(),
      versions: z
        .object({
          id: z.string().uuid(),
          version_no: z.number(),
          deed_date: z.string().nullable(),
          area: z.number().nullable(),
          file_path: z.string().nullable(),
          source: z.string(),
          created_at: z.string(),
        })
        .array(),
    })
    .array(),
  licenses: z
    .object({
      id: z.string().uuid(),
      license_number: z.string().nullable(),
      authority: z.string().nullable(),
      current_version_id: z.string().uuid().nullable(),
      versions: z
        .object({
          id: z.string().uuid(),
          version_no: z.number(),
          issued_on: z.string().nullable(),
          expires_on: z.string().nullable(),
          file_path: z.string().nullable(),
          source: z.string(),
          created_at: z.string(),
        })
        .array(),
    })
    .array(),
  boundaries: z
    .object({
      id: z.string().uuid(),
      side: z.string(),
      length_m: z.number().nullable(),
      neighbor_text: z.string().nullable(),
      description: z.string().nullable(),
    })
    .array(),
  units: z
    .object({
      id: z.string().uuid(),
      unit_no: z.string(),
      unit_type: z.string(),
      floor_no: z.number().nullable(),
      area: z.number().nullable(),
      rooms: z.number().nullable(),
      status: z.string(),
    })
    .array(),
  services: z
    .object({
      id: z.string().uuid(),
      service_type: z.string(),
      status: z.string(),
      reference_no: z.string().nullable(),
    })
    .array(),
  projects: z
    .object({
      id: z.string().uuid(),
      project_id: z.string().uuid(),
      relation: z.string(),
      project_name: z.string().nullable(),
    })
    .array(),
});
export type PropertyProfile = z.infer<typeof propertyProfileSchema>;

export const getPropertyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => propertyId.parse(input))
  .handler(async ({ data, context }): Promise<PropertyProfile> => {
    const sb = context.supabase;
    const id = data.propertyId;

    const { data: property, error } = await sb
      .from("properties_public")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!property) throw new Error("Property not found or not accessible");

    const [owners, deeds, deedVersions, licenses, licenseVersions, boundaries, units, services, links] =
      await Promise.all([
        sb
          .from("property_owners")
          .select("id, owner_name_text, owner_user_id, owner_entity_id, share_percent, starts_on, ends_on")
          .eq("property_id", id)
          .order("created_at", { ascending: true }),
        sb.from("deeds").select("id, deed_number, issuer, current_version_id").eq("property_id", id),
        sb
          .from("deed_versions")
          .select("id, deed_id, version_no, deed_date, area, file_path, source, created_at")
          .order("version_no", { ascending: false }),
        sb
          .from("building_licenses")
          .select("id, license_number, authority, current_version_id")
          .eq("property_id", id),
        sb
          .from("license_versions")
          .select("id, license_id, version_no, issued_on, expires_on, file_path, source, created_at")
          .order("version_no", { ascending: false }),
        sb
          .from("land_boundaries")
          .select("id, side, length_m, neighbor_text, description")
          .eq("property_id", id)
          .order("order_index", { ascending: true }),
        sb
          .from("property_units")
          .select("id, unit_no, unit_type, floor_no, area, rooms, status")
          .eq("property_id", id)
          .order("unit_no", { ascending: true }),
        sb
          .from("property_services")
          .select("id, service_type, status, reference_no")
          .eq("property_id", id),
        sb
          .from("property_projects")
          .select("id, project_id, relation, projects(name)")
          .eq("property_id", id),
      ]);

    return propertyProfileSchema.parse({
      property: {
        ...property,
        can_view_exact: property.can_view_exact ?? false,
      },
      owners: owners.data ?? [],
      deeds: (deeds.data ?? []).map((d) => ({
        ...d,
        versions: (deedVersions.data ?? []).filter((v) => v.deed_id === d.id),
      })),
      licenses: (licenses.data ?? []).map((l) => ({
        ...l,
        versions: (licenseVersions.data ?? []).filter((v) => v.license_id === l.id),
      })),
      boundaries: boundaries.data ?? [],
      units: units.data ?? [],
      services: services.data ?? [],
      projects: (links.data ?? []).map((l) => ({
        id: l.id,
        project_id: l.project_id,
        relation: l.relation,
        project_name: (l.projects as { name: string } | null)?.name ?? null,
      })),
    });
  });

/* ----------------------------- scope guard ------------------------------ */

export const verifyDeveloperScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; entityId: string }> => {
    const { requireEntityOfType } = await import("@/lib/entity-scope.server");
    const scope = await requireEntityOfType(
      context.supabase,
      context.userId,
      data.entityId,
      ["developer"],
    );
    return { ok: true, entityId: scope.entityId };
  });

/* -------------------------------- create -------------------------------- */

export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(PROPERTY_KINDS),
        name: z.string().trim().min(2).max(160),
        entityId: z.string().uuid(),
        city: z.string().trim().max(80).optional(),
        district: z.string().trim().max(80).optional(),
        landArea: z.number().positive().nullable().optional(),
        planNo: z.string().trim().max(60).optional(),
        parcelNo: z.string().trim().max(60).optional(),
        approxLat: z.number().min(-90).max(90).nullable().optional(),
        approxLng: z.number().min(-180).max(180).nullable().optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    // Creating a registry property requires a verified developer entity.
    const { requireEntityOfType } = await import("@/lib/entity-scope.server");
    const scope = await requireEntityOfType(
      context.supabase,
      context.userId,
      data.entityId,
      ["developer"],
    );

    const { data: row, error } = await context.supabase
      .from("properties")
      .insert({
        owner_id: context.userId,
        created_by: context.userId,
        entity_id: scope.entityId,
        kind: data.kind,
        name: data.name,
        city: data.city || null,
        district: data.district || null,
        land_area: data.landArea ?? null,
        plan_no: data.planNo || null,
        parcel_no: data.parcelNo || null,
        approx_lat: data.approxLat ?? null,
        approx_lng: data.approxLng ?? null,
        notes: data.notes || null,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: row.id };
  });

export const updatePropertyBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        name: z.string().trim().min(2).max(160).optional(),
        status: z.enum(["draft", "active", "archived"]).optional(),
        city: z.string().trim().max(80).nullable().optional(),
        district: z.string().trim().max(80).nullable().optional(),
        landArea: z.number().positive().nullable().optional(),
        approxLat: z.number().min(-90).max(90).nullable().optional(),
        approxLng: z.number().min(-180).max(180).nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { propertyId: id, ...rest } = data;
    const { error } = await context.supabase
      .from("properties")
      .update({
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.status !== undefined ? { status: rest.status } : {}),
        ...(rest.city !== undefined ? { city: rest.city } : {}),
        ...(rest.district !== undefined ? { district: rest.district } : {}),
        ...(rest.landArea !== undefined ? { land_area: rest.landArea } : {}),
        ...(rest.approxLat !== undefined ? { approx_lat: rest.approxLat } : {}),
        ...(rest.approxLng !== undefined ? { approx_lng: rest.approxLng } : {}),
        ...(rest.notes !== undefined ? { notes: rest.notes } : {}),
      })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

/** Exact location lives in its own table; writing needs the exact-location right. */
export const setExactLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        exactLat: z.number().min(-90).max(90).nullable(),
        exactLng: z.number().min(-180).max(180).nullable(),
        exactAddress: z.string().trim().max(400).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("property_exact_locations").upsert(
      {
        property_id: data.propertyId,
        exact_lat: data.exactLat,
        exact_lng: data.exactLng,
        exact_address: data.exactAddress,
      },
      { onConflict: "property_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

/* -------------------------------- owners -------------------------------- */

export const addPropertyOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        ownerNameText: z.string().trim().min(2).max(160).nullable().optional(),
        ownerUserId: z.string().uuid().nullable().optional(),
        ownerEntityId: z.string().uuid().nullable().optional(),
        sharePercent: z.number().positive().max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("property_owners")
      .insert({
        property_id: data.propertyId,
        owner_name_text: data.ownerNameText ?? null,
        owner_user_id: data.ownerUserId ?? null,
        owner_entity_id: data.ownerEntityId ?? null,
        share_percent: data.sharePercent,
      })
      .select("id")
      .single();
    // The database trigger rejects any insert that pushes the live total past 100%.
    if (error) throw error;
    return { id: row.id };
  });

export const endPropertyOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ownerRowId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("property_owners")
      .update({ ends_on: new Date().toISOString().slice(0, 10) })
      .eq("id", data.ownerRowId);
    if (error) throw error;
    return { ok: true };
  });

/* --------------------------- documents (versions) ------------------------ */

/** Adds a new deed version. Existing versions are never updated or deleted. */
export const addDeedVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        deedId: z.string().uuid().nullable().optional(),
        deedNumber: z.string().trim().max(60).nullable().optional(),
        issuer: z.string().trim().max(120).nullable().optional(),
        deedDate: z.string().nullable().optional(),
        area: z.number().positive().nullable().optional(),
        filePath: z.string().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ deedId: string; versionId: string }> => {
    const sb = context.supabase;
    let deedId = data.deedId ?? null;

    if (!deedId) {
      const { data: head, error } = await sb
        .from("deeds")
        .insert({
          property_id: data.propertyId,
          deed_number: data.deedNumber ?? null,
          issuer: data.issuer ?? null,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      deedId = head.id;
    }

    const { data: version, error: vErr } = await sb
      .from("deed_versions")
      .insert({
        deed_id: deedId,
        // The database trigger recomputes the real sequence number.
        version_no: 1,
        deed_date: data.deedDate || null,
        area: data.area ?? null,
        file_path: data.filePath || null,
        source: "manual",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;

    return { deedId, versionId: version.id };
  });

/** Adds a new building-licence version. Existing versions stay untouched. */
export const addLicenseVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        licenseId: z.string().uuid().nullable().optional(),
        licenseNumber: z.string().trim().max(60).nullable().optional(),
        authority: z.string().trim().max(120).nullable().optional(),
        issuedOn: z.string().nullable().optional(),
        expiresOn: z.string().nullable().optional(),
        filePath: z.string().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ licenseId: string; versionId: string }> => {
    const sb = context.supabase;
    let licenseId = data.licenseId ?? null;

    if (!licenseId) {
      const { data: head, error } = await sb
        .from("building_licenses")
        .insert({
          property_id: data.propertyId,
          license_number: data.licenseNumber ?? null,
          authority: data.authority ?? null,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      licenseId = head.id;
    }

    const { data: version, error: vErr } = await sb
      .from("license_versions")
      .insert({
        license_id: licenseId,
        // The database trigger recomputes the real sequence number.
        version_no: 1,
        issued_on: data.issuedOn || null,
        expires_on: data.expiresOn || null,
        file_path: data.filePath || null,
        source: "manual",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;

    return { licenseId, versionId: version.id };
  });

/** Short-lived signed URL for a stored document; access is re-checked by storage RLS. */
export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(3).max(400) }).parse(input))
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    const { data: signed, error } = await context.supabase.storage
      .from("property-documents")
      .createSignedUrl(data.path, 60);
    if (error) return { url: null };
    return { url: signed.signedUrl };
  });

/* --------------------------- boundaries and units ------------------------ */

export const addBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        side: z.enum(["north", "south", "east", "west", "other"]),
        lengthM: z.number().positive().nullable().optional(),
        neighborText: z.string().trim().max(200).nullable().optional(),
        description: z.string().trim().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("land_boundaries").insert({
      property_id: data.propertyId,
      side: data.side,
      length_m: data.lengthM ?? null,
      neighbor_text: data.neighborText ?? null,
      description: data.description ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const addUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        unitNo: z.string().trim().min(1).max(40),
        unitType: z.enum(["apartment", "floor", "shop", "villa", "office", "other"]),
        floorNo: z.number().int().nullable().optional(),
        area: z.number().positive().nullable().optional(),
        rooms: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("property_units").insert({
      property_id: data.propertyId,
      unit_no: data.unitNo,
      unit_type: data.unitType,
      floor_no: data.floorNo ?? null,
      area: data.area ?? null,
      rooms: data.rooms ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

/* ---------------------------- project linking ---------------------------- */

export const linkPropertyToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        projectId: z.string().uuid(),
        relation: z.enum(["primary", "related"]).default("related"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("property_projects").insert({
      property_id: data.propertyId,
      project_id: data.projectId,
      relation: data.relation,
      linked_by: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const unlinkPropertyFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ linkId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("property_projects")
      .delete()
      .eq("id", data.linkId);
    if (error) throw error;
    return { ok: true };
  });

/** Projects the current user can link this property to. */
export const listLinkableProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ id: string; name: string }[]> => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return z.object({ id: z.string().uuid(), name: z.string() }).array().parse(data ?? []);
  });
