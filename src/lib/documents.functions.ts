import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 14 — general document library.
 * Documents are entity-owned, versions are append-only, and storage paths
 * are generated from identifiers only (never from a real file name).
 */

export const DOC_VISIBILITIES = [
  "entity_private",
  "requester_private",
  "party_limited",
  "project_wide",
  "public_approved",
] as const;
export type DocVisibility = (typeof DOC_VISIBILITIES)[number];

export const DOC_CONTEXTS = [
  "project",
  "property",
  "property_unit",
  "stage",
  "contract",
  "request",
] as const;
export type DocContext = (typeof DOC_CONTEXTS)[number];

export const listDocumentCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("document_categories")
      .select("code, name_ar, name_en, group_code, allowed_mime, max_size_mb")
      .eq("is_active", true)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMyDocumentEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, userId }) => {
    const { data, error } = await context.supabase
      .from("entity_memberships")
      .select("entity_id, role, entities(id, name_ar, name_en)")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      entity_id: row.entity_id,
      role: row.role,
      name:
        (row.entities as { name_ar?: string | null; name_en?: string | null } | null)?.name_ar ??
        (row.entities as { name_en?: string | null } | null)?.name_en ??
        "—",
    }));
  });

export type DocumentListItem = {
  id: string;
  title: string;
  description: string | null;
  category_code: string;
  visibility: DocVisibility;
  status: string;
  owner_entity_id: string;
  current_version_id: string | null;
  approved_at: string | null;
  is_deleted: boolean;
  created_at: string;
};

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid().optional(),
        categoryCode: z.string().optional(),
        visibility: z.enum(DOC_VISIBILITIES).optional(),
        contextType: z.enum(DOC_CONTEXTS).optional(),
        contextId: z.string().uuid().optional(),
        includeDeleted: z.boolean().optional(),
      })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let documentIds: string[] | null = null;
    if (data.contextType && data.contextId) {
      const { data: links, error: linkError } = await context.supabase
        .from("document_links")
        .select("document_id")
        .eq("context_type", data.contextType)
        .eq("context_id", data.contextId);
      if (linkError) throw new Error(linkError.message);
      documentIds = (links ?? []).map((l) => l.document_id);
      if (documentIds.length === 0) return [] as DocumentListItem[];
    }

    let query = context.supabase
      .from("documents")
      .select(
        "id, title, description, category_code, visibility, status, owner_entity_id, current_version_id, approved_at, is_deleted, created_at",
      );
    if (!data.includeDeleted) query = query.eq("is_deleted", false);
    if (data.entityId) query = query.eq("owner_entity_id", data.entityId);
    if (data.categoryCode) query = query.eq("category_code", data.categoryCode);
    if (data.visibility) query = query.eq("visibility", data.visibility);
    if (documentIds) query = query.in("id", documentIds);

    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DocumentListItem[];
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [doc, versions, links, audience] = await Promise.all([
      context.supabase.from("documents").select("*").eq("id", data.documentId).maybeSingle(),
      context.supabase
        .from("document_versions")
        .select(
          "id, version_no, storage_bucket, storage_path, file_ext, mime_type, size_bytes, checksum_sha256, scan_status, supersede_reason, source, created_by, created_at",
        )
        .eq("document_id", data.documentId)
        .order("version_no", { ascending: false }),
      context.supabase
        .from("document_links")
        .select("id, context_type, context_id, relation, created_at")
        .eq("document_id", data.documentId),
      context.supabase
        .from("document_audience")
        .select("id, audience_entity_id, audience_user_id")
        .eq("document_id", data.documentId),
    ]);
    if (doc.error) throw new Error(doc.error.message);
    if (!doc.data) throw new Error("Document not found");
    return {
      document: doc.data,
      versions: versions.data ?? [],
      links: links.data ?? [],
      audience: audience.data ?? [],
    };
  });

export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ownerEntityId: z.string().uuid(),
        categoryCode: z.string().min(1),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        visibility: z
          .enum(["entity_private", "requester_private", "party_limited", "project_wide"])
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("create_document", {
      _owner_entity_id: data.ownerEntityId,
      _category_code: data.categoryCode,
      _title: data.title,
      _description: data.description ?? null,
      _visibility: data.visibility ?? "entity_private",
    });
    if (error) throw new Error(error.message);
    return { documentId: id as string };
  });

/** Reserves a version row and returns the storage path the client must upload to. */
export const reserveDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        fileExt: z.string().min(1).max(10),
        mimeType: z.string().min(1).max(150),
        sizeBytes: z.number().int().positive(),
        checksumSha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
        supersedeReason: z.string().max(500).nullable().optional(),
        source: z.enum(["upload", "derived", "external"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("add_document_version", {
      _document_id: data.documentId,
      _file_ext: data.fileExt,
      _mime_type: data.mimeType,
      _size_bytes: data.sizeBytes,
      _checksum_sha256: data.checksumSha256.toLowerCase(),
      _supersede_reason: data.supersedeReason ?? null,
      _source: data.source ?? "upload",
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row as {
      version_id: string;
      version_no: number;
      storage_bucket: string;
      storage_path: string;
    };
  });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: version, error } = await context.supabase
      .from("document_versions")
      .select("storage_bucket, storage_path")
      .eq("id", data.versionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!version) throw new Error("Version not found");

    const signed = await context.supabase.storage
      .from(version.storage_bucket)
      .createSignedUrl(version.storage_path, 300);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, expiresInSeconds: 300 };
  });

export const linkDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        contextType: z.enum(DOC_CONTEXTS),
        contextId: z.string().uuid(),
        relation: z.enum(["attachment", "reference", "deliverable"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("link_document", {
      _document_id: data.documentId,
      _context_type: data.contextType,
      _context_id: data.contextId,
      _relation: data.relation ?? "attachment",
    });
    if (error) throw new Error(error.message);
    return { linkId: id as string };
  });

export const unlinkDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ linkId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("unlink_document", { _link_id: data.linkId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDocumentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        visibility: z.enum([
          "entity_private",
          "requester_private",
          "party_limited",
          "project_wide",
        ]),
        audienceEntityIds: z.array(z.string().uuid()).optional(),
        audienceUserIds: z.array(z.string().uuid()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_document_visibility", {
      _document_id: data.documentId,
      _visibility: data.visibility,
      _audience_entity_ids: data.audienceEntityIds ?? [],
      _audience_user_ids: data.audienceUserIds ?? [],
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ documentId: z.string().uuid(), note: z.string().max(1000).nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_document", {
      _document_id: data.documentId,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const softDeleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentId: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("soft_delete_document", {
      _document_id: data.documentId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("restore_document", {
      _document_id: data.documentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
