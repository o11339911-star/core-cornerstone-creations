import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 26 — legal documents (privacy, terms, IP, complaints).
 *
 * Reading a published document is intentionally anonymous: policy pages must
 * be readable before signing in. Acceptance, on the other hand, always runs as
 * the signed-in user and is recorded per document version.
 */

export const legalDocumentSchema = z.object({
  code: z.string(),
  title_ar: z.string(),
  slug: z.string(),
  version: z.string(),
  effective_date: z.string(),
  published_at: z.string().nullable(),
  body_md: z.string(),
});
export type LegalDocument = z.infer<typeof legalDocumentSchema>;

export const legalIndexItemSchema = z.object({
  code: z.string(),
  title_ar: z.string(),
  slug: z.string(),
  version: z.string(),
  effective_date: z.string(),
});
export type LegalIndexItem = z.infer<typeof legalIndexItemSchema>;

export const pendingAcceptanceSchema = z.object({
  document_id: z.string().uuid(),
  version_id: z.string().uuid(),
  code: z.string(),
  title_ar: z.string(),
  version: z.string(),
  effective_date: z.string(),
});
export type PendingAcceptance = z.infer<typeof pendingAcceptanceSchema>;

export const LEGAL_CODES = ["privacy", "terms", "ip", "complaints"] as const;
export type LegalCode = (typeof LEGAL_CODES)[number];

async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Public read of the current published version. `null` when not published. */
export const getLegalDocument = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ code: z.enum(LEGAL_CODES) }).parse(input),
  )
  .handler(async ({ data }): Promise<LegalDocument | null> => {
    const anon = await anonClient();
    const { data: row, error } = await anon.rpc("get_legal_document", { _code: data.code });
    if (error) throw new Error(error.message);
    if (!row) return null;
    return legalDocumentSchema.parse(row);
  });

/** Public index of the four policy documents. */
export const listLegalDocuments = createServerFn({ method: "GET" }).handler(
  async (): Promise<LegalIndexItem[]> => {
    const anon = await anonClient();
    const { data, error } = await anon.rpc("list_legal_documents");
    if (error) throw new Error(error.message);
    return legalIndexItemSchema.array().parse(data ?? []);
  },
);

/** Versions the signed-in user has not accepted yet. */
export const getPendingAcceptances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingAcceptance[]> => {
    const { data, error } = await context.supabase.rpc("pending_policy_acceptances");
    if (error) throw new Error(error.message);
    return pendingAcceptanceSchema.array().parse(data ?? []);
  });

/** Records an explicit, per-version acceptance. Never pre-checked in the UI. */
export const acceptPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        versionIds: z.array(z.string().uuid()).min(1),
        context: z.enum(["login_gate", "invitation", "settings"]).default("login_gate"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: count, error } = await context.supabase.rpc("accept_policies", {
      _version_ids: data.versionIds,
      _context: data.context,
    });
    if (error) throw new Error(error.message);
    return { accepted: (count as number) ?? 0 };
  });
