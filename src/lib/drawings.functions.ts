import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * وحدة المخططات الهندسية (CAD).
 *
 * الملفات الأصلية في مخزن خاص `cad-originals` ولا تُعدَّل ولا تُحذف إطلاقًا؛
 * كل كتابة تمرّ عبر RPC متحقَّق منه (SECURITY DEFINER في مخطط private)،
 * والجداول تمنح SELECT فقط ومحكومة بـ RLS عبر محرك الصلاحيات private.can
 * على وحدة "drawings" مع سقف الأطراف لكل مشروع.
 */

const uuid = z.string().uuid();

export const CAD_BUCKET = "cad-originals";

export const DRAWING_DISCIPLINES = [
  "architectural",
  "structural",
  "mechanical",
  "electrical",
  "plumbing",
  "civil",
  "landscape",
  "survey",
  "other",
] as const;

export const DRAWING_FORMATS = ["pdf", "dwg", "dxf", "ifc", "zip"] as const;

export const drawingSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  owner_entity_id: z.string().uuid(),
  document_id: z.string().uuid(),
  drawing_no: z.string(),
  discipline: z.string(),
  sheet_no: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DrawingRecord = z.infer<typeof drawingSchema>;

export const drawingRevisionSchema = z.object({
  id: z.string().uuid(),
  drawing_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  revision_label: z.string(),
  format: z.string(),
  sheet_count: z.number().nullable(),
  created_by: z.string().uuid(),
  created_at: z.string(),
});
export type DrawingRevision = z.infer<typeof drawingRevisionSchema>;

export const drawingEventSchema = z.object({
  id: z.string().uuid(),
  drawing_id: z.string().uuid(),
  from_status: z.string().nullable(),
  to_status: z.string(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type DrawingEvent = z.infer<typeof drawingEventSchema>;

export const drawingMarkupSchema = z.object({
  id: z.string().uuid(),
  drawing_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  page_no: z.number(),
  body: z.string(),
  resolved_at: z.string().nullable(),
  created_by: z.string().uuid(),
  created_at: z.string(),
});
export type DrawingMarkup = z.infer<typeof drawingMarkupSchema>;

export const drawingJobSchema = z.object({
  id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  provider: z.string(),
  status: z.string(),
  error_code: z.string().nullable(),
  created_at: z.string(),
});
export type DrawingJob = z.infer<typeof drawingJobSchema>;

const DRAWING_COLS =
  "id, project_id, owner_entity_id, document_id, drawing_no, discipline, sheet_no, title, status, created_at, updated_at";
const REVISION_COLS =
  "id, drawing_id, document_version_id, revision_label, format, sheet_count, created_by, created_at";
const EVENT_COLS = "id, drawing_id, from_status, to_status, note, created_at";
const MARKUP_COLS =
  "id, drawing_id, document_version_id, page_no, body, resolved_at, created_by, created_at";
const JOB_COLS = "id, document_version_id, provider, status, error_code, created_at";

/* ------------------------------------------------------------------ reads */

export const listProjectDrawings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<DrawingRecord[]> => {
    const { data: rows, error } = await context.supabase
      .from("drawing_records")
      .select(DRAWING_COLS)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(drawingSchema).parse(rows ?? []);
  });

export const getDrawing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ drawingId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("drawing_records")
      .select(DRAWING_COLS)
      .eq("id", data.drawingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const [revisions, events, markups, jobs] = await Promise.all([
      context.supabase
        .from("drawing_version_meta")
        .select(REVISION_COLS)
        .eq("drawing_id", data.drawingId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("drawing_status_events")
        .select(EVENT_COLS)
        .eq("drawing_id", data.drawingId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("drawing_markups")
        .select(MARKUP_COLS)
        .eq("drawing_id", data.drawingId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("drawing_conversion_jobs")
        .select(JOB_COLS)
        .eq("drawing_id", data.drawingId)
        .order("created_at", { ascending: false }),
    ]);

    return {
      drawing: drawingSchema.parse(row),
      revisions: z.array(drawingRevisionSchema).parse(revisions.data ?? []),
      events: z.array(drawingEventSchema).parse(events.data ?? []),
      markups: z.array(drawingMarkupSchema).parse(markups.data ?? []),
      jobs: z.array(drawingJobSchema).parse(jobs.data ?? []),
    };
  });

export const getDrawingsModuleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row, error } = await context.supabase
      .from("drawing_module_settings")
      .select("aps_enabled, aps_client_id_env, aps_client_secret_env")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      apsEnabled: Boolean(row?.aps_enabled),
      // أسماء متغيرات البيئة فقط — لا قيم أسرار إطلاقًا.
      apsClientIdEnv: row?.aps_client_id_env ?? "APS_CLIENT_ID",
      apsClientSecretEnv: row?.aps_client_secret_env ?? "APS_CLIENT_SECRET",
      apsSecretsPresent: Boolean(
        process.env[row?.aps_client_id_env ?? "APS_CLIENT_ID"] &&
          process.env[row?.aps_client_secret_env ?? "APS_CLIENT_SECRET"],
      ),
    };
  });

/* ----------------------------------------------------------------- writes */

export const createDrawing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        drawingNo: z.string().min(1).max(60),
        discipline: z.enum(DRAWING_DISCIPLINES),
        title: z.string().min(2).max(200),
        sheetNo: z.string().max(40).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("entity_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project?.entity_id) throw new Error("المشروع غير متاح");

    const { data: id, error } = await context.supabase.rpc("create_drawing", {
      _project_id: data.projectId,
      _owner_entity_id: project.entity_id,
      _drawing_no: data.drawingNo,
      _discipline: data.discipline,
      _title: data.title,
      _sheet_no: data.sheetNo ?? undefined,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

/** يسجّل نسخة جديدة ويعيد مسار الرفع الموقّع للمخزن الخاص. */
export const startDrawingUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        drawingId: uuid,
        fileExt: z.enum(DRAWING_FORMATS),
        mimeType: z.string().min(3).max(160),
        sizeBytes: z.number().int().positive().max(209715200),
        checksumSha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
        revisionLabel: z.string().min(1).max(40),
        supersedeReason: z.string().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("add_drawing_version", {
      _drawing_id: data.drawingId,
      _file_ext: data.fileExt,
      _mime_type: data.mimeType,
      _size_bytes: data.sizeBytes,
      _checksum_sha256: data.checksumSha256,
      _revision_label: data.revisionLabel,
      _supersede_reason: data.supersedeReason ?? undefined,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("تعذّر إنشاء النسخة");

    const signed = await context.supabase.storage
      .from(CAD_BUCKET)
      .createSignedUploadUrl(row.storage_path as string);
    if (signed.error) throw new Error(signed.error.message);

    return {
      versionId: row.version_id as string,
      versionNo: row.version_no as number,
      bucket: CAD_BUCKET,
      path: row.storage_path as string,
      token: signed.data.token,
    };
  });

export const getDrawingFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: version, error } = await context.supabase
      .from("document_versions")
      .select("storage_bucket, storage_path")
      .eq("id", data.versionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!version?.storage_path) throw new Error("الملف غير متاح");
    const signed = await context.supabase.storage
      .from(version.storage_bucket ?? CAD_BUCKET)
      .createSignedUrl(version.storage_path, 120);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, expiresInSeconds: 120 };
  });

export const setDrawingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        drawingId: uuid,
        toStatus: z.enum([
          "under_review",
          "returned",
          "approved",
          "issued_for_construction",
          "as_built",
          "superseded",
        ]),
        note: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_drawing_status", {
      _drawing_id: data.drawingId,
      _to_status: data.toStatus,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enqueueDrawingConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("enqueue_drawing_conversion", {
      _document_version_id: data.versionId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { status: (row?.status as string) ?? "disabled", provider: (row?.provider as string) ?? "aps" };
  });

export const addDrawingMarkup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        drawingId: uuid,
        versionId: uuid,
        body: z.string().min(2).max(2000),
        pageNo: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("add_drawing_markup", {
      _drawing_id: data.drawingId,
      _document_version_id: data.versionId,
      _body: data.body,
      _page_no: data.pageNo,
      _anchor: {},
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

export const resolveDrawingMarkup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ markupId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("resolve_drawing_markup", {
      _markup_id: data.markupId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
