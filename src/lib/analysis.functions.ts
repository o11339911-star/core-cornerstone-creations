import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Client-side document analysis pipeline (Phase — "تحليل الملفات").
 * Extraction happens entirely in the browser (see src/lib/analysis/extract.ts);
 * these server functions only persist the review-required draft and apply it
 * to a deed/licence once a human explicitly confirms it.
 */

export const ANALYSIS_ENGINES = ["pdf_text", "ocr_tesseract", "manual"] as const;
export type AnalysisEngine = (typeof ANALYSIS_ENGINES)[number];

export const ANALYSIS_STATUSES = ["review_required", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_DETECTED_TYPES = [
  "deed",
  "building_license",
  "property_doc",
  "identity",
  "other",
] as const;
export type AnalysisDetectedType = (typeof ANALYSIS_DETECTED_TYPES)[number];

export const ANALYSIS_TARGETS = ["deed", "building_license"] as const;
export type AnalysisTarget = (typeof ANALYSIS_TARGETS)[number];

const jsonValue: z.ZodType<unknown> = z.any();

/** Persists a fresh (never yet reviewed) analysis draft for one document version. */
export const recordAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentVersionId: z.string().uuid(),
        engine: z.enum(ANALYSIS_ENGINES),
        status: z.enum(ANALYSIS_STATUSES),
        detectedType: z.enum(ANALYSIS_DETECTED_TYPES).nullable().optional(),
        extractedFields: jsonValue.optional(),
        fieldConfidence: jsonValue.optional(),
        conflicts: jsonValue.optional(),
        failureReason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("record_document_analysis", {
      _document_version_id: data.documentVersionId,
      _engine: data.engine,
      _status: data.status,
      _extracted_fields: (data.extractedFields ?? {}) as never,
      _field_confidence: (data.fieldConfidence ?? {}) as never,
      _conflicts: (data.conflicts ?? []) as never,
      ...(data.detectedType ? { _detected_type: data.detectedType } : {}),
      ...(data.failureReason ? { _failure_reason: data.failureReason } : {}),
    });
    if (error) throw new Error(error.message);
    return { analysisId: id as string };
  });

/** Applies a reviewed analysis to a deed/licence head + version. Nothing is
 * written to the property before this is called explicitly by the user. */
export const confirmAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        analysisId: z.string().uuid(),
        propertyId: z.string().uuid(),
        target: z.enum(ANALYSIS_TARGETS),
        headId: z.string().uuid().nullable().optional(),
        number: z
          .string()
          .trim()
          .regex(/^[0-9A-Za-z/-]{1,60}$/, "رقم غير صالح"),
        issuer: z.string().trim().max(160).nullable().optional(),
        date1: z.string().nullable().optional(),
        date2: z.string().nullable().optional(),
        area: z.number().positive().nullable().optional(),
        ownerSnapshot: z.string().trim().max(200).nullable().optional(),
        scopeText: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc(
      "confirm_document_analysis",
      compactArgs({
        _analysis_id: data.analysisId,
        _property_id: data.propertyId,
        _target: data.target,
        _head_id: data.headId,
        _number: data.number,
        _issuer: data.issuer,
        _date_1: data.date1,
        _date_2: data.date2,
        _area: data.area,
        _owner_snapshot: data.ownerSnapshot,
        _scope_text: data.scopeText,
      }) as never,
    );
    if (error) throw new Error(error.message);
    return { versionId: id as string };
  });

export const rejectAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ analysisId: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("reject_document_analysis", {
      _analysis_id: data.analysisId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok) };
  });

/** Must be called whenever a reserved version's upload (or a step right
 * after it) fails, so the document never points at a half-uploaded file. */
export const abortUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ versionId: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("abort_document_upload", {
      _version_id: data.versionId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok) };
  });

export const analysisRowSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  status: z.string(),
  engine: z.string(),
  detected_type: z.string().nullable(),
  extracted_fields: z.record(z.string(), z.any()).nullable(),
  field_confidence: z.record(z.string(), z.any()).nullable(),
  conflicts: z.any().nullable(),
  failure_reason: z.string().nullable(),
  review_note: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string(),
});
export type AnalysisRow = z.infer<typeof analysisRowSchema>;

export const getAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ analysisId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("document_analyses")
      .select("*")
      .eq("id", data.analysisId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Analysis not found");
    return analysisRowSchema.parse(row);
  });

/** All analyses for documents linked to one property. */
export const listPropertyAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: links, error: linkError } = await context.supabase
      .from("document_links")
      .select("document_id")
      .eq("context_type", "property")
      .eq("context_id", data.propertyId);
    if (linkError) throw new Error(linkError.message);
    const documentIds = (links ?? []).map((l) => l.document_id);
    if (documentIds.length === 0) return [] as AnalysisRow[];

    const { data: rows, error } = await context.supabase
      .from("document_analyses")
      .select("*")
      .in("document_id", documentIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return analysisRowSchema.array().parse(rows ?? []);
  });
