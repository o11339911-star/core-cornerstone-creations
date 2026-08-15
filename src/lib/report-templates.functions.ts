import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pageSetupSchema, reportContentSchema } from "@/lib/reports/blocks";
import { IMPORT_MAX_BYTES, checkImportFile } from "@/lib/reports/import-rules";

/**
 * Phase 15-B — template import + Rakeez library administration.
 * Every write goes through a SECURITY DEFINER RPC that re-checks authorisation;
 * nothing here queries reports, report_versions, report_assets or project data.
 */

export const IMPORT_URL_TTL_SECONDS = 60;
const IMPORT_BUCKET = "report-imports";

const base64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const amIPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("am_i_platform_admin");
    if (error) throw new Error(error.message);
    return { isPlatformAdmin: data === true };
  });

export type TemplateRow = {
  id: string;
  owner_scope: string;
  entity_id: string | null;
  code: string | null;
  name_ar: string;
  name_en: string;
  language: string;
  direction: string;
  source: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

const TEMPLATE_COLUMNS =
  "id, owner_scope, entity_id, code, name_ar, name_en, language, direction, source, status, reviewed_by, reviewed_at, updated_at";

export const listEntityTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("report_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("entity_id", data.entityId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TemplateRow[];
  });

/** Rakeez library only — deliberately scoped so no entity data can leak in. */
export const listRakeezTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("am_i_platform_admin");
    if (adminErr) throw new Error(adminErr.message);
    if (isAdmin !== true) throw new Error("Forbidden");
    const { data: rows, error } = await context.supabase
      .from("report_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("owner_scope", "rakeez")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TemplateRow[];
  });

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("report_templates")
      .select(`${TEMPLATE_COLUMNS}, content, page_setup`)
      .eq("id", data.templateId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Template not found");
    return row;
  });

export const upsertRakeezTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        templateId: z.string().uuid().nullable().optional(),
        code: z.string().max(80).optional(),
        nameAr: z.string().min(2).max(200),
        nameEn: z.string().min(2).max(200),
        language: z.enum(["ar", "en"]).default("ar"),
        content: reportContentSchema,
        pageSetup: pageSetupSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("upsert_rakeez_template", {
      _template_id: data.templateId ?? null,
      _code: data.code ?? null,
      _name_ar: data.nameAr,
      _name_en: data.nameEn,
      _language: data.language,
      _content: data.content,
      _page_setup: data.pageSetup ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { templateId: id as string };
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        templateId: z.string().uuid(),
        nameAr: z.string().min(2).max(200).optional(),
        nameEn: z.string().min(2).max(200).optional(),
        content: reportContentSchema.optional(),
        pageSetup: pageSetupSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("update_report_template", {
      _template_id: data.templateId,
      _name_ar: data.nameAr ?? null,
      _name_en: data.nameEn ?? null,
      _content: data.content ?? null,
      _page_setup: data.pageSetup ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reviewTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ templateId: z.string().uuid(), note: z.string().max(1000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: at, error } = await context.supabase.rpc("review_report_template", {
      _template_id: data.templateId,
      _note: data.note ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { reviewedAt: at as string };
  });

export const activateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: at, error } = await context.supabase.rpc("activate_report_template", {
      _template_id: data.templateId,
    });
    if (error) throw new Error(error.message);
    return { activatedAt: at as string };
  });

export const archiveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("archive_report_template", {
      _template_id: data.templateId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ImportRow = {
  id: string;
  template_id: string | null;
  owner_scope: string;
  entity_id: string | null;
  kind: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  status: string;
  blocks_created: number;
  dropped_report: unknown;
  warnings: unknown;
  error_text: string | null;
  created_at: string;
};

const IMPORT_COLUMNS =
  "id, template_id, owner_scope, entity_id, kind, storage_path, mime_type, size_bytes, checksum_sha256, status, blocks_created, dropped_report, warnings, error_text, created_at";

export const listTemplateImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ entityId: z.string().uuid().optional(), ownerScope: z.enum(["entity", "rakeez"]).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase.from("report_template_imports").select(IMPORT_COLUMNS);
    if (data.entityId) query = query.eq("entity_id", data.entityId);
    if (data.ownerScope) query = query.eq("owner_scope", data.ownerScope);
    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ImportRow[];
  });

export const getTemplateImport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ importId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("report_template_imports")
      .select(IMPORT_COLUMNS)
      .eq("id", data.importId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Import not found");
    return row as ImportRow;
  });

/**
 * Upload + validate + parse in one server round trip so the browser can never
 * skip the extension / MIME / magic-byte gate.
 */
export const importTemplateFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ownerScope: z.enum(["entity", "rakeez"]).default("entity"),
        entityId: z.string().uuid().nullable().optional(),
        fileName: z.string().min(1).max(300),
        mimeType: z.string().min(1).max(200),
        sizeBytes: z.number().int().positive(),
        contentBase64: z.string().min(8).max(Math.ceil((IMPORT_MAX_BYTES * 4) / 3) + 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const bytes = base64ToBytes(data.contentBase64);
    const verdict = checkImportFile(data.fileName, data.mimeType, bytes.byteLength, bytes);
    if (!verdict.ok) throw new Error(`REJECTED:${verdict.reason}`);
    if (bytes.byteLength !== data.sizeBytes) throw new Error("REJECTED:SIZE_MISMATCH");

    const checksum = await sha256Hex(bytes);
    const { data: created, error } = await context.supabase.rpc("create_template_import", {
      _owner_scope: data.ownerScope,
      _entity_id: data.ownerScope === "entity" ? (data.entityId ?? null) : null,
      _kind: verdict.kind,
      _mime_type: data.mimeType,
      _size_bytes: bytes.byteLength,
      _checksum_sha256: checksum,
    } as never);
    if (error) throw new Error(error.message);
    const record = (Array.isArray(created) ? created[0] : created) as {
      import_id: string;
      storage_bucket: string;
      storage_path: string;
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upload = await supabaseAdmin.storage
      .from(IMPORT_BUCKET)
      .upload(record.storage_path, bytes, { contentType: data.mimeType, upsert: false });
    if (upload.error) throw new Error(upload.error.message);

    let parsed;
    try {
      if (verdict.kind === "docx") {
        const { parseDocxToBlocks } = await import("@/lib/reports/docx-import.server");
        parsed = parseDocxToBlocks(bytes);
      } else {
        const { parsePdfToBlocks } = await import("@/lib/reports/pdf-import.server");
        parsed = parsePdfToBlocks(bytes);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "تعذّر تحليل الملف";
      await context.supabase.rpc("record_template_import_parse", {
        _import_id: record.import_id,
        _status: "failed",
        _blocks_created: 0,
        _dropped_report: [],
        _warnings: [],
        _error_text: message,
      } as never);
      throw new Error(message);
    }

    const { error: recErr } = await context.supabase.rpc("record_template_import_parse", {
      _import_id: record.import_id,
      _status: "parsed",
      _blocks_created: parsed.content.blocks.length,
      _dropped_report: parsed.dropped,
      _warnings: parsed.warnings,
      _error_text: null,
    } as never);
    if (recErr) throw new Error(recErr.message);

    return {
      importId: record.import_id,
      kind: verdict.kind,
      content: parsed.content,
      dropped: parsed.dropped,
      warnings: parsed.warnings,
      checksum,
    };
  });

/** Re-parse the stored source for the side-by-side review screen. */
export const getImportPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ importId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("report_template_imports")
      .select("id, kind, storage_path")
      .eq("id", data.importId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const file = await supabaseAdmin.storage.from(IMPORT_BUCKET).download(row.storage_path);
    if (file.error || !file.data) throw new Error("تعذّر قراءة الملف الأصلي");
    const bytes = new Uint8Array(await file.data.arrayBuffer());

    if (row.kind === "pdf") {
      const { extractPdfPagesText, parsePdfToBlocks } = await import("@/lib/reports/pdf-import.server");
      const reparsed = parsePdfToBlocks(bytes);
      return { kind: "pdf" as const, pages: extractPdfPagesText(bytes), content: reparsed.content };
    }
    const { parseDocxToBlocks } = await import("@/lib/reports/docx-import.server");
    const reparsed = parseDocxToBlocks(bytes);
    const plain = reparsed.content.blocks
      .map((b) =>
        b.type === "heading" || b.type === "paragraph"
          ? b.text
          : b.type === "list"
            ? b.items.map((i) => `• ${i}`).join("\n")
            : b.type === "table"
              ? [b.header.join(" | "), ...b.rows.map((r) => r.join(" | "))].join("\n")
              : `[${b.type}]`,
      )
      .join("\n");
    return { kind: "docx" as const, pages: [plain], content: reparsed.content };
  });

export const getImportSourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ importId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("report_template_imports")
      .select("storage_path")
      .eq("id", data.importId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Forbidden");
    const signed = await context.supabase.storage
      .from(IMPORT_BUCKET)
      .createSignedUrl(row.storage_path, IMPORT_URL_TTL_SECONDS);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, expiresInSeconds: IMPORT_URL_TTL_SECONDS };
  });

export const applyTemplateImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        importId: z.string().uuid(),
        nameAr: z.string().min(2).max(200),
        nameEn: z.string().min(2).max(200),
        language: z.enum(["ar", "en"]).default("ar"),
        content: reportContentSchema,
        pageSetup: pageSetupSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("apply_template_import", {
      _import_id: data.importId,
      _name_ar: data.nameAr,
      _name_en: data.nameEn,
      _language: data.language,
      _content: data.content,
      _page_setup: data.pageSetup ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { templateId: id as string };
  });
