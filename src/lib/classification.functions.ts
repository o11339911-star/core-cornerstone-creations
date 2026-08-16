import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * التصنيف: الشكل النظامي (الصفة القانونية) منفصل تمامًا عن النشاط الاقتصادي.
 * الأنشطة تأتي من قاموس مُصدَّر في القاعدة (مبني على التصنيف الوطني/ISIC4)،
 * ولا تُبنى أبدًا كقائمة ثابتة في الواجهة، ولا تُسنَد تلقائيًا للمستخدم.
 */

export const ACTIVITY_VERSION = "NCEA-2023-ISIC4";

export type LegalForm = { code: string; name_ar: string; name_en: string };

export type ActivitySuggestion = {
  code: string;
  parent_code: string | null;
  level: number;
  name_ar: string;
  name_en: string;
  path_ar: string;
};

export type EntityActivity = {
  activity_code: string;
  is_primary: boolean;
  name_ar: string | null;
  path_ar: string | null;
};

export const listLegalForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LegalForm[]> => {
    const { data, error } = await context.supabase
      .from("legal_forms")
      .select("code, name_ar, name_en")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []) as LegalForm[];
  });

export const searchEconomicActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ q: z.string().trim().max(120).default(""), limit: z.number().int().min(1).max(50).default(25) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ActivitySuggestion[]> => {
    const { data: rows, error } = await context.supabase.rpc("search_economic_activities", {
      _q: data.q,
      _version: ACTIVITY_VERSION,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as ActivitySuggestion[]).map((r) => ({
      code: r.code,
      parent_code: r.parent_code ?? null,
      level: r.level,
      name_ar: r.name_ar,
      name_en: r.name_en,
      path_ar: r.path_ar,
    }));
  });

export const getEntityLegalForm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ legalFormCode: string | null }> => {
    const { data: row, error } = await context.supabase
      .from("entity_profiles")
      .select("legal_form_code")
      .eq("entity_id", data.entityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { legalFormCode: (row?.legal_form_code as string | null) ?? null };
  });

export const getEntityActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EntityActivity[]> => {
    const { data: rows, error } = await context.supabase
      .from("entity_activities")
      .select("activity_code, is_primary")
      .eq("entity_id", data.entityId)
      .order("is_primary", { ascending: false });
    if (error) throw new Error(error.message);
    const codes = (rows ?? []).map((r) => r.activity_code as string);
    if (codes.length === 0) return [];

    const { data: names } = await context.supabase
      .from("economic_activities")
      .select("code, name_ar")
      .eq("version", ACTIVITY_VERSION)
      .in("code", codes);
    const byCode = new Map((names ?? []).map((n) => [n.code as string, n.name_ar as string]));

    return (rows ?? []).map((r) => ({
      activity_code: r.activity_code as string,
      is_primary: Boolean(r.is_primary),
      name_ar: byCode.get(r.activity_code as string) ?? null,
      path_ar: null,
    }));
  });

/** يستبدل تصنيف الكيان بالكامل — الصلاحية والتدقيق مفروضان في القاعدة. */
export const setEntityClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        legalFormCode: z.string().max(60).nullable().default(null),
        primaryCode: z.string().max(20).nullable().default(null),
        secondaryCodes: z.array(z.string().max(20)).max(10).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.legalFormCode !== null) {
      const { error } = await context.supabase
        .from("entity_profiles")
        .update({ legal_form_code: data.legalFormCode })
        .eq("entity_id", data.entityId);
      if (error) throw new Error(error.message);
    }

    const { error: delError } = await context.supabase
      .from("entity_activities")
      .delete()
      .eq("entity_id", data.entityId);
    if (delError) throw new Error(delError.message);

    const rows = [
      ...(data.primaryCode
        ? [
            {
              entity_id: data.entityId,
              activity_version: ACTIVITY_VERSION,
              activity_code: data.primaryCode,
              is_primary: true,
            },
          ]
        : []),
      ...data.secondaryCodes
        .filter((c) => c !== data.primaryCode)
        .map((c) => ({
          entity_id: data.entityId,
          activity_version: ACTIVITY_VERSION,
          activity_code: c,
          is_primary: false,
        })),
    ];
    if (rows.length) {
      const { error } = await context.supabase.from("entity_activities").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
