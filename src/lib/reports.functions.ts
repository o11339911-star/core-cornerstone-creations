import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pageSetupSchema, reportContentSchema } from "@/lib/reports/blocks";

/**
 * Phase 15-A — engineering reports.
 * Content is structured blocks (never raw HTML), versions are append-only,
 * approval applies the entity seal server-side only, and every download link
 * is signed by the server for a fixed 60 seconds.
 */

export const REPORT_URL_TTL_SECONDS = 60;

export const listReportTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("report_templates")
      .select("id, owner_scope, entity_id, code, name_ar, name_en, language, direction, status, source")
      .eq("status", "active")
      .order("owner_scope", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMyReportEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("entity_memberships")
      .select("entity_id, role, entities(id, name)")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      entity_id: row.entity_id,
      role: row.role,
      name: (row.entities as { name?: string | null } | null)?.name ?? "—",
    }));
  });

export const getEntityLicenseState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("entity_license_state", {
      _entity_id: data.entityId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row ?? { has_license: false, is_valid: false, reason: "NO_LICENSE" }) as {
      has_license: boolean;
      is_valid: boolean;
      license_number: string | null;
      expires_on: string | null;
      reason: string;
    };
  });

export type ReportListItem = {
  id: string;
  report_number: string;
  title: string;
  language: string;
  status: string;
  entity_id: string;
  project_id: string;
  is_certified: boolean;
  current_version_id: string | null;
  created_at: string;
};

export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ projectId: z.string().uuid().optional(), entityId: z.string().uuid().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("reports")
      .select(
        "id, report_number, title, language, status, entity_id, project_id, is_certified, current_version_id, created_at",
      );
    if (data.projectId) query = query.eq("project_id", data.projectId);
    if (data.entityId) query = query.eq("entity_id", data.entityId);
    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ReportListItem[];
  });

export const getReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reportId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: report, error } = await context.supabase
      .from("reports")
      .select("*")
      .eq("id", data.reportId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!report) throw new Error("Report not found");

    const { data: versions, error: vErr } = await context.supabase
      .from("report_versions")
      .select(
        "id, version_no, status, content, page_setup, snapshot, checksum_sha256, stamp_applied, verify_token, export_pdf_path, export_docx_path, created_by, last_edited_by, submitted_by, approved_by, approved_at, created_at, updated_at",
      )
      .eq("report_id", data.reportId)
      .order("version_no", { ascending: false });
    if (vErr) throw new Error(vErr.message);

    return { report, versions: versions ?? [], viewerId: context.userId };
  });

export const createReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        projectId: z.string().uuid(),
        title: z.string().min(2).max(300),
        templateId: z.string().uuid().nullable().optional(),
        language: z.enum(["ar", "en"]).default("ar"),
        stageId: z.string().uuid().nullable().optional(),
        visitId: z.string().uuid().nullable().optional(),
        propertyId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const args: Record<string, string> = {
      _entity_id: data.entityId,
      _project_id: data.projectId,
      _title: data.title,
      _language: data.language,
    };
    if (data.templateId) args["_template_id"] = data.templateId;
    if (data.stageId) args["_stage_id"] = data.stageId;
    if (data.visitId) args["_visit_id"] = data.visitId;
    if (data.propertyId) args["_property_id"] = data.propertyId;

    const { data: id, error } = await context.supabase.rpc(
      "create_report",
      args as unknown as { _entity_id: string; _project_id: string; _title: string },
    );
    if (error) throw new Error(error.message);
    return { reportId: id as string };
  });

export const saveReportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        versionId: z.string().uuid(),
        content: reportContentSchema,
        pageSetup: pageSetupSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: savedAt, error } = await context.supabase.rpc("save_report_draft", {
      _version_id: data.versionId,
      _content: data.content,
      _page_setup: data.pageSetup ?? null,
    });
    if (error) throw new Error(error.message);
    return { savedAt: savedAt as string };
  });

export const submitReportVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: at, error } = await context.supabase.rpc("submit_report_version", {
      _version_id: data.versionId,
    });
    if (error) throw new Error(error.message);
    return { submittedAt: at as string };
  });

export const approveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ versionId: z.string().uuid(), note: z.string().max(1000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const approveArgs: Record<string, string> = { _version_id: data.versionId };
    if (data.note) approveArgs["_note"] = data.note;
    const { data: at, error } = await context.supabase.rpc(
      "approve_report",
      approveArgs as unknown as { _version_id: string },
    );
    if (error) throw new Error(error.message);
    return { approvedAt: at as string };
  });

export const createReportVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reportId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const versionArgs: Record<string, string> = { _report_id: data.reportId };
    if (data.reason) versionArgs["_reason"] = data.reason;
    const { data: id, error } = await context.supabase.rpc(
      "create_report_version",
      versionArgs as unknown as { _report_id: string },
    );
    if (error) throw new Error(error.message);
    return { versionId: id as string };
  });

export const createEntityReportTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        nameAr: z.string().min(2).max(200),
        nameEn: z.string().min(2).max(200),
        language: z.enum(["ar", "en"]).default("ar"),
        content: reportContentSchema,
        pageSetup: pageSetupSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("create_entity_report_template", {
      _entity_id: data.entityId,
      _name_ar: data.nameAr,
      _name_en: data.nameEn,
      _language: data.language,
      _content: data.content,
      _page_setup: data.pageSetup ?? null,
    });
    if (error) throw new Error(error.message);
    return { templateId: id as string };
  });

/** Reserve an identifier-only storage path for an inline report image. */
export const reserveReportAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reportId: z.string().uuid(),
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
        caption: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed, error: canError } = await context.supabase.rpc("can_access_report_version", {
      _version_id: "00000000-0000-0000-0000-000000000000",
      _action: "view",
    });
    void allowed;
    void canError;

    const { data: report, error: repErr } = await context.supabase
      .from("reports")
      .select("id, entity_id")
      .eq("id", data.reportId)
      .maybeSingle();
    if (repErr) throw new Error(repErr.message);
    if (!report) throw new Error("Forbidden");

    const assetId = crypto.randomUUID();
    const ext = data.mimeType === "image/png" ? "png" : data.mimeType === "image/webp" ? "webp" : "jpg";
    const path = `assets/${report.entity_id}/${report.id}/${assetId}.${ext}`;

    const { error } = await context.supabase.from("report_assets").insert({
      id: assetId,
      report_id: report.id,
      storage_path: path,
      mime_type: data.mimeType,
      size_bytes: data.sizeBytes,
      caption: data.caption ?? null,
      uploaded_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);

    return { assetId, storagePath: path, bucket: "reports" };
  });

export const getReportDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // Only version id + kind are accepted; any client-provided expiry is ignored.
  .inputValidator((input: unknown) =>
    z.object({ versionId: z.string().uuid(), kind: z.enum(["pdf", "docx"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed, error: canError } = await context.supabase.rpc("can_access_report_version", {
      _version_id: data.versionId,
      _action: "export",
    });
    if (canError) throw new Error(canError.message);
    if (!allowed) throw new Error("Forbidden");

    const { data: version, error } = await context.supabase
      .from("report_versions")
      .select("export_pdf_path, export_docx_path")
      .eq("id", data.versionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!version) throw new Error("Version not found");

    const path = data.kind === "pdf" ? version.export_pdf_path : version.export_docx_path;
    if (!path) throw new Error("Export not generated yet");

    const signed = await context.supabase.storage
      .from("reports")
      .createSignedUrl(path, REPORT_URL_TTL_SECONDS);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, expiresInSeconds: REPORT_URL_TTL_SECONDS };
  });

export const exportReportVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ versionId: z.string().uuid(), kind: z.enum(["pdf", "docx"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed, error: canError } = await context.supabase.rpc("can_access_report_version", {
      _version_id: data.versionId,
      _action: "export",
    });
    if (canError) throw new Error(canError.message);
    if (!allowed) throw new Error("Forbidden");

    const { data: version, error: vErr } = await context.supabase
      .from("report_versions")
      .select("id, report_id, version_no, content, page_setup, snapshot, status, verify_token, stamp_applied")
      .eq("id", data.versionId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!version) throw new Error("Version not found");

    const { data: report, error: rErr } = await context.supabase
      .from("reports")
      .select("id, entity_id, report_number, title, language")
      .eq("id", version.report_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!report) throw new Error("Report not found");

    const { data: assets } = await context.supabase
      .from("report_assets")
      .select("id, storage_path, mime_type")
      .eq("report_id", report.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { flattenBlocks } = await import("@/lib/reports/render.server");

    const assetPaths: Record<string, string> = {};
    const assetMime: Record<string, string> = {};
    for (const a of assets ?? []) {
      assetPaths[a.id] = a.storage_path;
      assetMime[a.storage_path] = a.mime_type;
    }

    const snapshot = (version.snapshot ?? {}) as Record<string, unknown>;
    const entity = (snapshot["entity"] ?? {}) as Record<string, unknown>;
    const licence = (snapshot["license"] ?? {}) as Record<string, unknown>;
    const locale = (report.language === "en" ? "en" : "ar") as "ar" | "en";
    const parsed = reportContentSchema.parse(version.content);
    const lines = flattenBlocks(parsed, snapshot, locale, assetPaths);

    const sealPath =
      version.status === "approved" && version.stamp_applied
        ? (
            await supabaseAdmin
              .from("entity_seals")
              .select("storage_path")
              .eq("entity_id", report.entity_id)
              .eq("is_active", true)
              .maybeSingle()
          ).data?.storage_path ?? null
        : null;

    const loadImage = async (path: string) => {
      const file = await supabaseAdmin.storage.from("reports").download(path);
      if (file.error || !file.data) return null;
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      const mime = assetMime[path] ?? (path.endsWith(".png") ? "image/png" : "image/jpeg");
      return { bytes, mime };
    };

    if (sealPath) {
      lines.push({
        kind: "image",
        path: sealPath,
        widthPercent: 25,
        caption: locale === "ar" ? "ختم الاعتماد" : "Approval seal",
      });
    }

    const certified =
      version.status === "approved" && licence["is_valid"] === true
        ? locale === "ar"
          ? "موثّق"
          : "Certified"
        : locale === "ar"
          ? "غير موثّق"
          : "Not certified";

    const headerText = `${String(entity["name"] ?? "")} — ${report.report_number} — ${certified}`;
    const verifyUrl = `${process.env["SITE_URL"] ?? "https://rakeez.app"}/verify/${version.verify_token}`;
    const footerText =
      locale === "ar"
        ? `تحقّق من صحة التقرير عبر رمز QR — ${report.report_number}`
        : `Verify this report with the QR code — ${report.report_number}`;

    let bytes: Uint8Array;
    let contentType: string;
    let ext: string;
    if (data.kind === "pdf") {
      const { renderReportPdf } = await import("@/lib/reports/pdf.server");
      const pageSetup = pageSetupSchema.parse(version.page_setup ?? {});
      bytes = await renderReportPdf({
        lines,
        locale,
        title: report.title,
        headerText,
        footerText,
        verifyUrl,
        marginMm: pageSetup.marginMm,
        loadImage,
      });
      contentType = "application/pdf";
      ext = "pdf";
    } else {
      const { renderReportDocx } = await import("@/lib/reports/docx.server");
      bytes = await renderReportDocx({
        lines,
        locale,
        title: report.title,
        headerText,
        footerText,
        verifyUrl,
        loadImage,
      });
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      ext = "docx";
    }

    const path = `exports/${report.entity_id}/${report.id}/${version.id}.${ext}`;
    const upload = await supabaseAdmin.storage
      .from("reports")
      .upload(path, bytes, { contentType, upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    const { error: recErr } = await context.supabase.rpc("record_report_export", {
      _version_id: version.id,
      _kind: data.kind,
      _path: path,
    });
    if (recErr) throw new Error(recErr.message);

    return { path, kind: data.kind, sizeBytes: bytes.byteLength, certified };
  });

/** Public verification — minimal disclosure only. */
export const verifyReport = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Supabase is not configured");
    const anon = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: rows, error } = await anon.rpc("verify_report", { _token: data.token });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    return row as {
      report_number: string;
      status: string;
      approved_at: string | null;
      entity_name: string;
    };
  });
