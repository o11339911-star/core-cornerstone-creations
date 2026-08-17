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

/** حفظ ذري للتصنيف عبر دالة قاعدة بيانات واحدة (شكل نظامي + أنشطة) — إما الكل أو لا شيء. */
export const setEntityClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        legalFormCode: z.string().max(60).nullable().default(null),
        setLegalForm: z.boolean().default(true),
        applyActivities: z.boolean().default(true),
        primaryCode: z.string().max(20).nullable().default(null),
        secondaryCodes: z.array(z.string().max(20)).max(10).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const args = {
      _entity_id: data.entityId,
      _set_legal_form: data.setLegalForm,
      _apply_activities: data.applyActivities,
      _secondary_codes: data.secondaryCodes.filter((c) => c !== data.primaryCode),
      _version: ACTIVITY_VERSION,
      ...(data.legalFormCode ? { _legal_form_code: data.legalFormCode } : {}),
      ...(data.primaryCode ? { _primary_code: data.primaryCode } : {}),
    };
    const { error } = await context.supabase.rpc("set_entity_classification", args);
    if (error) {
      const m = error.message;
      if (m.includes("FORBIDDEN") || m.includes("AUTH_REQUIRED")) throw new Error("FORBIDDEN");
      if (m.includes("INVALID_LEGAL_FORM")) throw new Error("INVALID_LEGAL_FORM");
      if (m.includes("INVALID_ACTIVITY_CODE")) throw new Error("INVALID_ACTIVITY_CODE");
      if (m.includes("TARGET_NOT_FOUND")) throw new Error("TARGET_NOT_FOUND");
      throw new Error("UNKNOWN");
    }
    return { ok: true } as const;
  });
