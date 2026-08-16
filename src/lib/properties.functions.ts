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
    z.object({ entityId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PropertyListItem[]> => {
    // No bypass path: the property registry always belongs to one verified
    // developer entity, re-authorized server-side before any read.
    const { requireEntityOfType } = await import("@/lib/entity-scope.server");
    const scope = await requireEntityOfType(
      context.supabase,
      context.userId,
      data.entityId,
      ["developer"],
    );

    const { data: rows, error } = await context.supabase
      .from("properties_public")
      .select("id, kind, name, status, city, district, land_area, completion_percent")
      .eq("entity_id", scope.entityId)
      .order("created_at", { ascending: false });

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
    region: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    frontage: z.string().nullable().optional(),
    streets: z.string().nullable().optional(),
    land_use: z.string().nullable().optional(),
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
      owner_source: z.enum(["personal", "entity"]).nullable(),
      owner_legal_form: z.string().nullable(),
      owner_unified_number: z.string().nullable(),
      owner_verification_status: z.string().nullable(),
      is_primary: z.boolean(),
      share_percent: z.number(),
      starts_on: z.string(),
      ends_on: z.string().nullable(),
    })
    .array(),
  can_manage_owner: z.boolean(),
  needs_owner_fix: z.boolean(),
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
          owner_name_snapshot: z.string().nullable().optional(),
          file_path: z.string().nullable(),
          document_version_id: z.string().uuid().nullable().optional(),
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
          scope_text: z.string().nullable().optional(),
          file_path: z.string().nullable(),
          document_version_id: z.string().uuid().nullable().optional(),
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
          .select(
            "id, owner_name_text, owner_user_id, owner_entity_id, owner_source, owner_legal_form, owner_unified_number, owner_verification_status, is_primary, share_percent, starts_on, ends_on",
          )
          .eq("property_id", id)
          .order("created_at", { ascending: true }),
        sb.from("deeds").select("id, deed_number, issuer, current_version_id").eq("property_id", id),
        sb
          .from("deed_versions")
          .select(
            "id, deed_id, version_no, deed_date, area, owner_name_snapshot, file_path, document_version_id, source, created_at",
          )
          .order("version_no", { ascending: false }),
        sb
          .from("building_licenses")
          .select("id, license_number, authority, current_version_id")
          .eq("property_id", id),
        sb
          .from("license_versions")
          .select(
            "id, license_id, version_no, issued_on, expires_on, scope_text, file_path, document_version_id, source, created_at",
          )
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

    const ownerRows = (owners.data ?? []) as PropertyProfile["owners"];
    const { data: canManage } = await sb.rpc("can_manage_property_self", { _property_id: id });

    return propertyProfileSchema.parse({
      property: {
        ...property,
        can_view_exact: property.can_view_exact ?? false,
      },
      owners: ownerRows,
      can_manage_owner: canManage,
      needs_owner_fix: ownerRows.filter((o) => !o.ends_on).length === 0,
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
        region: z.string().trim().max(120).optional(),
        address: z.string().trim().max(400).optional(),
        frontage: z.string().trim().max(200).optional(),
        streets: z.string().trim().max(200).optional(),
        landUse: z.string().trim().max(120).optional(),
        approxLat: z.number().min(-90).max(90).nullable().optional(),
        approxLng: z.number().min(-180).max(180).nullable().optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    // Creating a registry property requires a verified developer entity;
    // the RPC re-derives the scope from the caller's own memberships and
    // creates the 100% owner row atomically with the property.
    const { requireEntityOfType } = await import("@/lib/entity-scope.server");
    const scope = await requireEntityOfType(
      context.supabase,
      context.userId,
      data.entityId,
      ["developer"],
    );

    // Optional RPC parameters are typed as non-nullable by the generated types;
    // omit the empty ones so Postgres falls back to its defaults.
    const optional: Record<string, string | number> = {};
    const put = (key: string, value: string | number | null | undefined) => {
      if (value !== null && value !== undefined && value !== "") optional[key] = value;
    };
    put("_city", data.city);
    put("_district", data.district);
    put("_land_area", data.landArea ?? undefined);
    put("_plan_no", data.planNo);
    put("_parcel_no", data.parcelNo);
    put("_region", data.region);
    put("_address", data.address);
    put("_frontage", data.frontage);
    put("_streets", data.streets);
    put("_land_use", data.landUse);
    put("_approx_lat", data.approxLat ?? undefined);
    put("_approx_lng", data.approxLng ?? undefined);
    put("_notes", data.notes);

    const { data: newId, error } = await context.supabase.rpc("create_property_with_owner", {
      _kind: data.kind,
      _name: data.name,
      _entity_id: scope.entityId,
      ...optional,
    } as never);

    if (error) throw new Error(error.message.includes("FORBIDDEN") ? "FORBIDDEN" : error.message);
    return { id: newId as string };
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
        region: z.string().trim().max(120).nullable().optional(),
        address: z.string().trim().max(400).nullable().optional(),
        frontage: z.string().trim().max(200).nullable().optional(),
        streets: z.string().trim().max(200).nullable().optional(),
        landUse: z.string().trim().max(120).nullable().optional(),
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
        ...(rest.region !== undefined ? { region: rest.region } : {}),
        ...(rest.address !== undefined ? { address: rest.address } : {}),
        ...(rest.frontage !== undefined ? { frontage: rest.frontage } : {}),
        ...(rest.streets !== undefined ? { streets: rest.streets } : {}),
        ...(rest.landUse !== undefined ? { land_use: rest.landUse } : {}),
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

/** Options the correction dialog may offer: personal account + the caller's own active entities. */
export const ownerOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  kind: z.enum(["personal", "entity"]),
  entityId: z.string().uuid().nullable(),
});
export type OwnerOption = z.infer<typeof ownerOptionSchema>;

export const listOwnerOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerOption[]> => {
    const now = new Date().toISOString();
    const [{ data: profile }, { data: memberships }] = await Promise.all([
      context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("entity_memberships")
        .select("entity:entities!inner(id, name, status, deleted_at)")
        .eq("user_id", context.userId)
        .eq("status", "active")
        .eq("entities.status", "active")
        .is("entities.deleted_at", null)
        .or(`expires_at.is.null,expires_at.gt.${now}`),
    ]);

    const options: OwnerOption[] = [
      {
        value: "personal",
        label: (profile as { full_name: string | null } | null)?.full_name ?? "",
        kind: "personal",
        entityId: null,
      },
    ];

    for (const row of (memberships ?? []) as { entity: { id: string; name: string } }[]) {
      options.push({
        value: `entity:${row.entity.id}`,
        label: row.entity.name,
        kind: "entity",
        entityId: row.entity.id,
      });
    }
    return options;
  });

/**
 * Replaces the primary owner with a derived one (personal or one of the
 * caller's active entities). Authorization, the 100% share and the audit trail
 * all live inside the RPC, so bypassing this layer changes nothing.
 */
export const setPropertyPrimaryOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        entityId: z.string().uuid().nullable(),
        reason: z.string().trim().min(5).max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("set_property_primary_owner", {
      _property_id: data.propertyId,
      _reason: data.reason,
      ...(data.entityId ? { _entity_id: data.entityId } : {}),
    } as never);
    if (error) {
      if (error.message.includes("FORBIDDEN")) throw new Error("FORBIDDEN");
      if (error.message.includes("REASON_REQUIRED")) throw new Error("REASON_REQUIRED");
      throw new Error(error.message);
    }
    return { ok: true as const };
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
        deedNumber: z.string().trim().min(1).max(60).nullable().optional(),
        issuer: z.string().trim().max(120).nullable().optional(),
        deedDate: z.string().nullable().optional(),
        area: z.number().positive().nullable().optional(),
        ownerNameSnapshot: z.string().trim().max(160).nullable().optional(),
        documentVersionId: z.string().uuid().nullable().optional(),
        /** Legacy path-only reference; prefer documentVersionId. */
        filePath: z.string().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ deedId: string; versionId: string }> => {
    const sb = context.supabase;
    let deedId = data.deedId ?? null;

    if (!deedId) {
      // A new deed head without a number is not a record, it is a placeholder.
      if (!data.deedNumber) throw new Error("DEED_NUMBER_REQUIRED");
      const { data: head, error } = await sb
        .from("deeds")
        .insert({
          property_id: data.propertyId,
          deed_number: data.deedNumber,
          issuer: data.issuer ?? null,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      deedId = head.id;
    } else if (data.deedNumber !== undefined || data.issuer !== undefined) {
      // Keep the deed head in sync so the UI never shows a stale number.
      // Scoped by property as well as id: a head id from another property
      // must never be reachable through this endpoint.
      const { data: updated, error: headErr } = await sb
        .from("deeds")
        .update({
          ...(data.deedNumber !== undefined ? { deed_number: data.deedNumber } : {}),
          ...(data.issuer !== undefined ? { issuer: data.issuer } : {}),
        })
        .eq("id", deedId)
        .eq("property_id", data.propertyId)
        .select("id")
        .maybeSingle();
      if (headErr || !updated) {
        throw new Error("لا تملك صلاحية تعديل بيانات الصك لهذا العقار");
      }
    }

    const { data: version, error: vErr } = await sb
      .from("deed_versions")
      .insert({
        deed_id: deedId,
        // The database trigger recomputes the real sequence number.
        version_no: 1,
        deed_date: data.deedDate || null,
        area: data.area ?? null,
        owner_name_snapshot: data.ownerNameSnapshot || null,
        document_version_id: data.documentVersionId ?? null,
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
        licenseNumber: z.string().trim().min(1).max(60).nullable().optional(),
        authority: z.string().trim().max(120).nullable().optional(),
        issuedOn: z.string().nullable().optional(),
        expiresOn: z.string().nullable().optional(),
        scopeText: z.string().trim().max(400).nullable().optional(),
        documentVersionId: z.string().uuid().nullable().optional(),
        /** Legacy path-only reference; prefer documentVersionId. */
        filePath: z.string().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ licenseId: string; versionId: string }> => {
    const sb = context.supabase;
    let licenseId = data.licenseId ?? null;

    if (!licenseId) {
      // A licence head with no number cannot be verified against the issuer.
      if (!data.licenseNumber) throw new Error("LICENSE_NUMBER_REQUIRED");
      const { data: head, error } = await sb
        .from("building_licenses")
        .insert({
          property_id: data.propertyId,
          license_number: data.licenseNumber,
          authority: data.authority ?? null,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      licenseId = head.id;
    } else if (data.licenseNumber !== undefined || data.authority !== undefined) {
      // Keep the licence head in sync so the UI never shows a stale number,
      // scoped by property so a foreign head id cannot be targeted.
      const { data: updated, error: headErr } = await sb
        .from("building_licenses")
        .update({
          ...(data.licenseNumber !== undefined ? { license_number: data.licenseNumber } : {}),
          ...(data.authority !== undefined ? { authority: data.authority } : {}),
        })
        .eq("id", licenseId)
        .eq("property_id", data.propertyId)
        .select("id")
        .maybeSingle();
      if (headErr || !updated) {
        throw new Error("لا تملك صلاحية تعديل بيانات الرخصة لهذا العقار");
      }
    }

    const { data: version, error: vErr } = await sb
      .from("license_versions")
      .insert({
        license_id: licenseId,
        // The database trigger recomputes the real sequence number.
        version_no: 1,
        issued_on: data.issuedOn || null,
        expires_on: data.expiresOn || null,
        scope_text: data.scopeText || null,
        document_version_id: data.documentVersionId ?? null,
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
