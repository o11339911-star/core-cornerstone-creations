import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Phase 18 — warranties. Expiry alerts reuse the Phase 17 duration engine. */

const warrantySchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string(),
  scope_kind: z.string(),
  system_code: z.string().nullable(),
  provider_kind: z.string(),
  provider_name: z.string().nullable(),
  warranty_type: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  status: z.string(),
});
export type Warranty = z.infer<typeof warrantySchema>;

export const listWarranties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Warranty[]> => {
    const { data: rows, error } = await context.supabase
      .from("warranties")
      .select(
        "id, project_id, title, scope_kind, system_code, provider_kind, provider_name, warranty_type, starts_on, ends_on, status",
      )
      .eq("project_id", data.projectId)
      .order("ends_on", { ascending: true });
    if (error) throw new Error(error.message);
    return z.array(warrantySchema).parse(rows ?? []);
  });

export const registerWarranty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(3).max(200),
        warrantyType: z.enum(["workmanship", "material", "equipment", "structural"]),
        startsOn: z.string(),
        endsOn: z.string(),
        scopeKind: z.enum(["system", "component", "whole_project"]).default("system"),
        systemCode: z.string().max(60).nullable().default(null),
        providerKind: z.enum(["contractor", "supplier"]).default("contractor"),
        providerName: z.string().max(200).nullable().default(null),
        documentId: z.string().uuid().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("register_warranty", {
      _project_id: data.projectId,
      _title: data.title,
      _warranty_type: data.warrantyType,
      _starts_on: data.startsOn,
      _ends_on: data.endsOn,
      _scope_kind: data.scopeKind,
      _provider_kind: data.providerKind,
      ...(data.systemCode ? { _system_code: data.systemCode } : {}),
      ...(data.providerName ? { _provider_name: data.providerName } : {}),
      ...(data.documentId ? { _document_id: data.documentId } : {}),
    });
    if (error) throw new Error(error.message);
    return id as string;
  });
