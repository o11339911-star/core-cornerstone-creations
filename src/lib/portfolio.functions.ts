import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 18 — track record (portfolio). Entries can only be produced from a
 * closed project with an approved final acceptance, and the database rejects
 * any financial value or non-public attachment.
 */

const entrySchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  project_id: z.string().uuid(),
  title_ar: z.string(),
  title_en: z.string(),
  summary_ar: z.string().nullable(),
  summary_en: z.string().nullable(),
  project_type_code: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  completed_on: z.string().nullable(),
  is_public: z.boolean(),
});
export type PortfolioEntry = z.infer<typeof entrySchema>;

const ENTRY_COLUMNS =
  "id, entity_id, project_id, title_ar, title_en, summary_ar, summary_en, project_type_code, city, district, completed_on, is_public";

export const listPortfolioEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: z.string().uuid().nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PortfolioEntry[]> => {
    let query = context.supabase
      .from("portfolio_entries")
      .select(ENTRY_COLUMNS)
      .order("completed_on", { ascending: false, nullsFirst: false });
    if (data.entityId) query = query.eq("entity_id", data.entityId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return z.array(entrySchema).parse(rows ?? []);
  });

export const publishPortfolioEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        titleAr: z.string().min(3).max(200),
        titleEn: z.string().min(3).max(200),
        summaryAr: z.string().max(2000).nullable().default(null),
        summaryEn: z.string().max(2000).nullable().default(null),
        isPublic: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("publish_portfolio_entry", {
      _project_id: data.projectId,
      _title_ar: data.titleAr,
      _title_en: data.titleEn,
      _is_public: data.isPublic,
      ...(data.summaryAr ? { _summary_ar: data.summaryAr } : {}),
      ...(data.summaryEn ? { _summary_en: data.summaryEn } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });
