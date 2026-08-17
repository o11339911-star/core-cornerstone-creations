import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * الأرشيف — مجلدات وعناصر مرتبطة بالحساب الشخصي أو بالكيان النشط.
 * العزل مفروض في القاعدة عبر RLS (private.archive_scope_ok)؛ هذه الطبقة
 * لا تثق بأي معرّف قادم من العميل: entity_id يُعاد التحقق منه في القاعدة.
 */

const uuid = z.string().uuid();
const entityId = uuid.nullable().default(null);

export const ARCHIVE_KINDS = [
  "file",
  "project",
  "property",
  "request",
  "contract",
  "deal",
  "listing",
  "message",
  "thread",
  "document",
  "other",
] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number];

export type ArchiveFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export type ArchiveItem = {
  id: string;
  archive_reference: string;
  archived_at: string;
  original_file_number: string | null;
  copied_from_id: string | null;
  folder_id: string | null;
  title: string;
  kind: string;
  source_table: string | null;
  source_id: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  created_at: string;
};

export const listArchiveFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<ArchiveFolder[]> => {
    let q = context.supabase
      .from("archive_folders")
      .select("id, name, parent_id, created_at")
      .order("name");
    q = data.entityId ? q.eq("entity_id", data.entityId) : q.is("entity_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ArchiveFolder[];
  });

export const createArchiveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        name: z.string().trim().min(1).max(120),
        parentId: uuid.nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("archive_folders")
      .insert({
        entity_id: data.entityId,
        owner_user_id: context.userId,
        parent_id: data.parentId,
        name: data.name,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const renameArchiveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ folderId: uuid, name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("archive_folders")
      .update({ name: data.name })
      .eq("id", data.folderId);
    if (error) throw new Error(error.message);
    return true;
  });

export const listArchiveItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        folderId: uuid.nullable().default(null),
        q: z.string().trim().max(120).default(""),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ArchiveItem[]> => {
    let q = context.supabase
      .from("archive_items")
      .select(
        "id, archive_reference, archived_at, original_file_number, copied_from_id, folder_id, title, kind, source_table, source_id, storage_path, mime_type, size_bytes, note, created_at",
      );
    q = data.entityId ? q.eq("entity_id", data.entityId) : q.is("entity_id", null);
    if (data.folderId) q = q.eq("folder_id", data.folderId);
    if (data.q) q = q.ilike("title", `%${data.q.replace(/[%_]/g, "")}%`);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ArchiveItem[];
  });

/** إضافة عنصر إلى الأرشيف مع إمكانية إنشاء مجلد جديد في نفس العملية. */
export const addToArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        folderId: uuid.nullable().default(null),
        newFolderName: z.string().trim().min(1).max(120).nullable().default(null),
        title: z.string().trim().min(1).max(200),
        kind: z.enum(ARCHIVE_KINDS).default("file"),
        sourceTable: z.string().max(60).nullable().default(null),
        sourceId: uuid.nullable().default(null),
        storagePath: z.string().max(400).nullable().default(null),
        mimeType: z.string().max(160).nullable().default(null),
        sizeBytes: z.number().int().min(0).nullable().default(null),
        note: z.string().max(2000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; folderId: string | null }> => {
    let folderId = data.folderId;
    if (data.newFolderName) {
      const { data: folder, error: folderError } = await context.supabase
        .from("archive_folders")
        .insert({
          entity_id: data.entityId,
          owner_user_id: context.userId,
          name: data.newFolderName,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (folderError) throw new Error(folderError.message);
      folderId = folder.id as string;
    }

    const { data: row, error } = await context.supabase
      .from("archive_items")
      .insert({
        entity_id: data.entityId,
        owner_user_id: context.userId,
        folder_id: folderId,
        title: data.title,
        kind: data.kind,
        source_table: data.sourceTable,
        source_id: data.sourceId,
        storage_path: data.storagePath,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        note: data.note,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("ALREADY_ARCHIVED");
      throw new Error(error.message);
    }
    return { id: row.id as string, folderId };
  });

export const updateArchiveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: uuid,
        title: z.string().trim().min(1).max(200).optional(),
        folderId: uuid.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { title?: string; folder_id?: string | null } = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.folderId !== undefined) patch.folder_id = data.folderId;
    if (Object.keys(patch).length === 0) return true;
    const { error } = await context.supabase
      .from("archive_items")
      .update(patch)
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return true;
  });

export const removeArchiveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ itemId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("archive_items").delete().eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return true;
  });

/** رابط تنزيل مؤقت لملف مؤرشف — التخزين خاص ولا يُقدَّم رابط دائم أبدًا. */
export const getArchiveFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(3).max(400) }).parse(input))
  .handler(async ({ data, context }): Promise<string> => {
    const { data: signed, error } = await context.supabase.storage
      .from("archive")
      .createSignedUrl(data.path, 300);
    if (error || !signed) throw new Error(error?.message ?? "SIGN_FAILED");
    return signed.signedUrl;
  });

/** بادئة مسار التخزين للحساب النشط — التحقق النهائي يقع في سياسات التخزين. */
export const getArchiveUploadPrefix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<string> =>
    data.entityId ? `e/${data.entityId}` : `u/${context.userId}`,
  );

/* ------------------------------------------------------------------ */
/* سجل النسخ، النسخ، والتوثيق                                          */
/* ------------------------------------------------------------------ */

export type ArchiveVersion = {
  id: string;
  version_no: number;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  created_at: string;
};

/** سجل تعديلات ملف واحد — داخلي، لا يظهر في قائمة الأرشيف. */
export const listArchiveVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ itemId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<ArchiveVersion[]> => {
    const { data: rows, error } = await context.supabase
      .from("archive_item_versions")
      .select("id, version_no, title, storage_path, mime_type, size_bytes, note, created_at")
      .eq("item_id", data.itemId)
      .order("version_no", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ArchiveVersion[];
  });

/**
 * حفظ تعديل على نفس الملف: يحدّث نفس archive_item_id ونفس البطاقة،
 * ويسجّل النسخة في version_history — لا ينشئ بطاقة جديدة أبدًا.
 */
export const saveArchiveFileVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: uuid,
        title: z.string().trim().min(1).max(200),
        storagePath: z.string().min(3).max(400),
        mimeType: z.string().max(160),
        sizeBytes: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ previousPath: string | null }> => {
    const { data: item, error: readError } = await context.supabase
      .from("archive_items")
      .select("id, storage_path")
      .eq("id", data.itemId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!item) throw new Error("NOT_FOUND");

    const { data: last } = await context.supabase
      .from("archive_item_versions")
      .select("version_no")
      .eq("item_id", data.itemId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = ((last?.version_no as number | undefined) ?? 0) + 1;

    const { error: versionError } = await context.supabase.from("archive_item_versions").insert({
      item_id: data.itemId,
      version_no: nextNo,
      title: data.title,
      storage_path: data.storagePath,
      mime_type: data.mimeType,
      size_bytes: data.sizeBytes,
      created_by: context.userId,
    });
    if (versionError) throw new Error(versionError.message);

    const { error } = await context.supabase
      .from("archive_items")
      .update({
        title: data.title,
        storage_path: data.storagePath,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);

    return { previousPath: (item.storage_path as string | null) ?? null };
  });

/** نسخ ملف: بطاقة جديدة بمرجع جديد مع حفظ copied_from_id. */
export const copyArchiveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceItemId: uuid,
        title: z.string().trim().min(1).max(200),
        storagePath: z.string().min(3).max(400),
        mimeType: z.string().max(160).nullable().default(null),
        sizeBytes: z.number().int().min(0).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; reference: string }> => {
    const { data: src, error: readError } = await context.supabase
      .from("archive_items")
      .select("entity_id, folder_id, kind, original_file_number, archive_reference")
      .eq("id", data.sourceItemId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!src) throw new Error("NOT_FOUND");

    const { data: row, error } = await context.supabase
      .from("archive_items")
      .insert({
        entity_id: src.entity_id as string | null,
        owner_user_id: context.userId,
        folder_id: src.folder_id as string | null,
        title: data.title,
        kind: "file",
        storage_path: data.storagePath,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        original_file_number: (src.original_file_number as string | null) ?? null,
        copied_from_id: data.sourceItemId,
        archived_from: "archive_copy",
        source_type: "archive_item",
        source_id: data.sourceItemId,
        created_by: context.userId,
      })
      .select("id, archive_reference")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, reference: row.archive_reference as string };
  });

/** إصدار بصمة ركيز لنسخة ثابتة — سجل سلامة داخلي وليس توقيعًا حكوميًا. */
export const issueArchiveStamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ itemId: uuid, checksum: z.string().regex(/^[0-9a-f]{64}$/) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("issue_archive_stamp", {
      p_item_id: data.itemId,
      p_checksum: data.checksum,
    });
    if (error) throw new Error(error.message);
    return res as {
      reference: string;
      issued_at: string;
      fingerprint: string;
      issuer: string;
      status: string;
    };
  });
