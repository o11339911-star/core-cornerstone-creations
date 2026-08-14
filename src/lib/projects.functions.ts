import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server wrappers for project templates and project creation.
 * Authorization is always re-derived from the authenticated user; the
 * client-side "active account" scope is never trusted here.
 */

export const projectTemplateSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  description_ar: z.string().nullable(),
  description_en: z.string().nullable(),
  requires_license: z.boolean(),
  feature_flag: z.string().nullable(),
});
export type ProjectTemplate = z.infer<typeof projectTemplateSchema>;

export const stageTemplateSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  order_index: z.number(),
  name_ar: z.string(),
  name_en: z.string(),
  kind: z.enum(["core", "optional"]),
  is_required: z.boolean(),
  default_duration_days: z.number().nullable(),
});
export type StageTemplate = z.infer<typeof stageTemplateSchema>;

/** Active (non feature-flagged) project types available for creation. */
export const listProjectTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProjectTemplate[]> => {
    const { data, error } = await context.supabase
      .from("project_templates")
      .select(
        "id, code, name_ar, name_en, description_ar, description_en, requires_license, feature_flag",
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return projectTemplateSchema.array().parse(data ?? []);
  });

/** Default stage library of a single project type, in display order. */
export const listStageTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ projectTemplateId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }): Promise<StageTemplate[]> => {
    const { data: rows, error } = await context.supabase
      .from("stage_templates")
      .select("id, code, order_index, name_ar, name_en, kind, is_required, default_duration_days")
      .eq("project_template_id", data.projectTemplateId)
      .is("deleted_at", null)
      .order("order_index", { ascending: true });

    if (error) throw error;
    return stageTemplateSchema.array().parse(rows ?? []);
  });

export const createProjectInputSchema = z.object({
  projectTemplateId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  entityId: z.string().uuid().nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  landArea: z.number().positive().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expectedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Optional stage codes the user chose to include beyond the required core ones. */
  optionalStageCodes: z.array(z.string()).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

/**
 * Creates a project owned by the caller (optionally scoped to an entity the
 * caller is an active member of) and materializes the template stages.
 */
export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createProjectInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string; stageCount: number }> => {
    const supabase = context.supabase;

    // Template must exist and be creatable (feature-flagged types are inactive).
    const { data: template, error: templateError } = await supabase
      .from("project_templates")
      .select("id, is_active, requires_license")
      .eq("id", data.projectTemplateId)
      .is("deleted_at", null)
      .maybeSingle();

    if (templateError) throw templateError;
    if (!template || !template.is_active || template.requires_license) {
      throw new Error("PROJECT_TEMPLATE_UNAVAILABLE");
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        owner_id: context.userId,
        created_by: context.userId,
        entity_id: data.entityId ?? null,
        project_template_id: data.projectTemplateId,
        name: data.name,
        status: "draft",
        city: data.city ?? null,
        district: data.district ?? null,
        land_area: data.landArea ?? null,
        start_date: data.startDate ?? null,
        expected_end_date: data.expectedEndDate ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();

    if (projectError) throw projectError;

    const { data: stages, error: stagesError } = await supabase
      .from("stage_templates")
      .select("id, code, order_index, name_ar, name_en, kind, is_required")
      .eq("project_template_id", data.projectTemplateId)
      .is("deleted_at", null)
      .order("order_index", { ascending: true });

    if (stagesError) throw stagesError;

    const chosen = new Set(data.optionalStageCodes ?? []);
    const selected = (stages ?? []).filter(
      (stage) => stage.kind === "core" || chosen.has(stage.code),
    );

    if (selected.length > 0) {
      const { error: insertStagesError } = await supabase.from("project_stages").insert(
        selected.map((stage, index) => ({
          project_id: project.id,
          stage_template_id: stage.id,
          source: stage.kind === "core" ? "core" : "library",
          order_index: index + 1,
          name_ar: stage.name_ar,
          name_en: stage.name_en,
          is_required: stage.is_required,
          status: "pending",
        })),
      );
      if (insertStagesError) throw insertStagesError;
    }

    return { id: project.id, stageCount: selected.length };
  });
