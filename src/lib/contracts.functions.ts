import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 10 — contracts, versions, extensions and change orders.
 * All authorization lives in the database (phase-5 engine, RLS and
 * SECURITY DEFINER RPCs with internal checks). Nothing is trusted here.
 * Approval is an INTERNAL approval only, not a certified e-signature.
 */

export const CONTRACT_TYPES = [
  "design",
  "supervision",
  "construction",
  "supply",
  "consulting",
  "other",
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = ["draft", "active", "suspended", "closed", "cancelled"] as const;

const contractSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  property_id: z.string().uuid().nullable(),
  contract_type: z.enum(CONTRACT_TYPES),
  contract_number: z.string().nullable(),
  title: z.string(),
  currency: z.string(),
  status: z.enum(CONTRACT_STATUSES),
  current_version_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type Contract = z.infer<typeof contractSchema>;

const CONTRACT_COLUMNS =
  "id, project_id, property_id, contract_type, contract_number, title, currency, status, current_version_id, created_at";

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Contract[]> => {
    const { data: rows, error } = await context.supabase
      .from("contracts")
      .select(CONTRACT_COLUMNS)
      .eq("project_id", data.projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(contractSchema).parse(rows ?? []);
  });

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(2).max(200),
        contractType: z.enum(CONTRACT_TYPES),
        contractNumber: z.string().max(80).nullable().optional(),
        startsOn: z.string().min(4),
        endsOn: z.string().min(4).nullable().optional(),
        termsText: z.string().max(20000).nullable().optional(),
        amount: z.number().nonnegative().nullable().optional(),
        paymentTerms: z.string().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: contract, error } = await context.supabase
      .from("contracts")
      .insert({
        project_id: data.projectId,
        title: data.title,
        contract_type: data.contractType,
        contract_number: data.contractNumber ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: version, error: versionError } = await context.supabase
      .from("contract_versions")
      .insert({
        contract_id: contract.id,
        starts_on: data.startsOn,
        ends_on: data.endsOn ?? null,
        terms_text: data.termsText ?? null,
        source: "original",
        created_by: context.userId,
        version_no: 0, // replaced by the assign-version trigger
      })
      .select("id")
      .single();
    if (versionError) throw new Error(versionError.message);

    if (data.amount != null || data.paymentTerms) {
      // Fails by design when the caller has no finance permission.
      const { error: amountError } = await context.supabase
        .from("contract_version_amounts")
        .insert({
          version_id: version.id,
          amount: data.amount ?? 0,
          payment_terms: data.paymentTerms ?? null,
        });
      if (amountError) throw new Error(amountError.message);
    }

    return { contractId: contract.id as string, versionId: version.id as string };
  });

const versionSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  version_no: z.number(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  terms_text: z.string().nullable(),
  source: z.string(),
  change_reason: z.string().nullable(),
  approved_at: z.string().nullable(),
  approval_note: z.string().nullable(),
  created_at: z.string(),
});

export const listContractVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contract_versions")
      .select(
        "id, contract_id, version_no, starts_on, ends_on, terms_text, source, change_reason, approved_at, approval_note, created_at",
      )
      .eq("contract_id", data.contractId)
      .order("version_no", { ascending: false });
    if (error) throw new Error(error.message);
    const versions = z.array(versionSchema).parse(rows ?? []);

    // Amounts live in a separate table guarded by the finance permission:
    // callers without it simply get no rows, so the value stays hidden.
    const { data: amounts } = await context.supabase
      .from("contract_version_amounts")
      .select("version_id, amount, payment_terms")
      .in(
        "version_id",
        versions.map((v) => v.id),
      );

    const byVersion = new Map(
      (amounts ?? []).map((a) => [a.version_id as string, a as { amount: number | null; payment_terms: string | null }]),
    );

    return versions.map((v) => ({
      ...v,
      amount: byVersion.get(v.id)?.amount ?? null,
      payment_terms: byVersion.get(v.id)?.payment_terms ?? null,
      amount_visible: byVersion.has(v.id),
    }));
  });

export const approveContractVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ versionId: z.string().uuid(), note: z.string().max(2000).nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: approvedAt, error } = await context.supabase.rpc("approve_contract_version", {
      _version_id: data.versionId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { approvedAt: approvedAt as string };
  });

export const requestContractExtension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contractId: z.string().uuid(),
        requestedEndsOn: z.string().min(4),
        reason: z.string().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contract_extensions")
      .insert({
        contract_id: data.contractId,
        requested_ends_on: data.requestedEndsOn,
        reason: data.reason ?? null,
        requested_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { extensionId: row.id as string };
  });

export const listContractExtensions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contract_extensions")
      .select(
        "id, contract_id, requested_ends_on, reason, status, decision_note, resulting_version_id, created_at",
      )
      .eq("contract_id", data.contractId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const decideContractExtension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        extensionId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: versionId, error } = await context.supabase.rpc("decide_contract_extension", {
      _extension_id: data.extensionId,
      _approve: data.approve,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { resultingVersionId: (versionId as string | null) ?? null };
  });

export const requestChangeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contractId: z.string().uuid(),
        title: z.string().min(2).max(200),
        description: z.string().max(20000).nullable().optional(),
        durationDeltaDays: z.number().int().optional(),
        amountDelta: z.number().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("change_orders")
      .insert({
        contract_id: data.contractId,
        title: data.title,
        description: data.description ?? null,
        duration_delta_days: data.durationDeltaDays ?? 0,
        requested_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.amountDelta != null) {
      const { error: amountError } = await context.supabase
        .from("change_order_amounts")
        .insert({ change_order_id: row.id, amount_delta: data.amountDelta });
      if (amountError) throw new Error(amountError.message);
    }
    return { changeOrderId: row.id as string };
  });

export const listChangeOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ contractId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("change_orders")
      .select(
        "id, contract_id, title, description, duration_delta_days, status, decision_note, resulting_version_id, created_at",
      )
      .eq("contract_id", data.contractId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const decideChangeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        changeOrderId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: versionId, error } = await context.supabase.rpc("decide_change_order", {
      _change_order_id: data.changeOrderId,
      _approve: data.approve,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { resultingVersionId: (versionId as string | null) ?? null };
  });
