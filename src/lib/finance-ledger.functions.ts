import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 16-B — financial documents, contractual retention, and the internal ledger.
 *
 * Rakeez records what the parties did OUTSIDE the platform. It holds no funds,
 * is not an escrow agent, issues no tax documents, and computes no tax. Tax
 * rate and tax amount are plain user-entered fields copied from the original
 * document. Ledger entries are append-only: the only correction is a reversal.
 *
 * Every rule lives in the database. This layer only shapes data for the UI and
 * masks amounts the caller has no finance.view permission to see.
 */

export const DOC_TYPES = [
  "invoice",
  "tax_invoice",
  "credit_note",
  "debit_note",
  "receipt",
] as const;
export type FinancialDocType = (typeof DOC_TYPES)[number];

export const DOC_DIRECTIONS = ["issued", "received"] as const;
export type FinancialDocDirection = (typeof DOC_DIRECTIONS)[number];

export const DOC_STATUSES = ["draft", "issued", "cancelled"] as const;
export type FinancialDocStatus = (typeof DOC_STATUSES)[number];

export const RETENTION_KINDS = ["retention", "advance", "guarantee"] as const;
export type RetentionKind = (typeof RETENTION_KINDS)[number];

export const RETENTION_STATUSES = [
  "active",
  "partially_released",
  "released",
  "forfeited",
  "cancelled",
] as const;
export type RetentionStatus = (typeof RETENTION_STATUSES)[number];

export const RETENTION_EVENT_TYPES = [
  "created",
  "partial_release",
  "full_release",
  "forfeit",
  "cancel",
] as const;
export type RetentionEventType = (typeof RETENTION_EVENT_TYPES)[number];

export const LEDGER_SOURCE_TYPES = [
  "financial_execution",
  "document_issue",
  "document_cancel",
  "retention_event",
  "manual_adjustment",
  "reversal",
] as const;
export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

/** Drops undefined keys so optional RPC args stay truly absent. */
const rpcArgs = <T,>(value: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const projectInput = (input: unknown) =>
  z.object({ projectId: z.string().uuid() }).parse(input);

/* ------------------------------------------------------------------ */
/* Financial documents                                                 */
/* ------------------------------------------------------------------ */

export type FinancialDocumentVersion = {
  id: string;
  version_no: number;
  change_reason: string | null;
  created_at: string;
  is_current: boolean;
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total: number | null;
  retention_amount: number | null;
  currency: string | null;
  amounts_masked: boolean;
};

export type FinancialDocument = {
  id: string;
  project_id: string;
  contract_id: string | null;
  milestone_id: string | null;
  doc_type: FinancialDocType;
  direction: FinancialDocDirection;
  doc_number: string | null;
  issue_date: string;
  status: FinancialDocStatus;
  references_document_id: string | null;
  current_version_id: string | null;
  cancel_reason: string | null;
  created_at: string;
  versions: FinancialDocumentVersion[];
  amounts_masked: boolean;
};

export const listFinancialDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<FinancialDocument[]> => {
    const { data: docs, error } = await context.supabase
      .from("financial_documents")
      .select(
        "id, project_id, contract_id, milestone_id, doc_type, direction, doc_number, issue_date, status, references_document_id, current_version_id, cancel_reason, created_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = docs ?? [];
    if (!rows.length) return [];

    const ids = rows.map((d) => d.id);
    const { data: versions } = await context.supabase
      .from("financial_document_versions")
      .select("id, document_id, version_no, change_reason, created_at")
      .in("document_id", ids)
      .order("version_no", { ascending: true });

    const versionIds = (versions ?? []).map((v) => v.id);
    // RLS hides this table entirely without finance.view, which is the mask.
    const { data: amounts } = versionIds.length
      ? await context.supabase
          .from("financial_document_amounts")
          .select("version_id, subtotal, tax_rate, tax_amount, total, retention_amount, currency")
          .in("version_id", versionIds)
      : { data: [] as Array<Record<string, unknown>> };
    const amountBy = new Map(
      (amounts ?? []).map((a) => [a.version_id as string, a]),
    );

    return rows.map((doc) => {
      const docVersions = (versions ?? [])
        .filter((v) => v.document_id === doc.id)
        .map((v) => {
          const a = amountBy.get(v.id);
          return {
            id: v.id,
            version_no: v.version_no,
            change_reason: v.change_reason,
            created_at: v.created_at,
            is_current: doc.current_version_id === v.id,
            subtotal: toNumber(a?.["subtotal"]),
            tax_rate: toNumber(a?.["tax_rate"]),
            tax_amount: toNumber(a?.["tax_amount"]),
            total: toNumber(a?.["total"]),
            retention_amount: toNumber(a?.["retention_amount"]),
            currency: (a?.["currency"] as string | undefined) ?? null,
            amounts_masked: !a,
          };
        });
      return {
        ...(doc as Omit<FinancialDocument, "versions" | "amounts_masked">),
        versions: docVersions,
        amounts_masked: docVersions.every((v) => v.amounts_masked),
      };
    });
  });

const documentAmountsInput = {
  subtotal: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).default(0),
  taxAmount: z.number().nonnegative().default(0),
  retentionAmount: z.number().nonnegative().default(0),
};

export const createFinancialDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        docType: z.enum(DOC_TYPES),
        direction: z.enum(DOC_DIRECTIONS),
        docNumber: z.string().trim().max(80).nullable().optional(),
        issueDate: z.string().nullable().optional(),
        contractId: z.string().uuid().nullable().optional(),
        milestoneId: z.string().uuid().nullable().optional(),
        referencesDocumentId: z.string().uuid().nullable().optional(),
        ...documentAmountsInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc(
      "create_financial_document",
      rpcArgs({
        _project_id: data.projectId,
        _doc_type: data.docType,
        _direction: data.direction,
        _subtotal: data.subtotal,
        _tax_rate: data.taxRate,
        _tax_amount: data.taxAmount,
        _doc_number: data.docNumber || undefined,
        _issue_date: data.issueDate || undefined,
        _contract_id: data.contractId ?? undefined,
        _milestone_id: data.milestoneId ?? undefined,
        _references_document_id: data.referencesDocumentId ?? undefined,
        _retention_amount: data.retentionAmount,
      }),
    );
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

/** A correction never edits anything: it appends a new version. */
export const reviseFinancialDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        changeReason: z.string().trim().min(3).max(500),
        ...documentAmountsInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ versionId: string }> => {
    const { data: id, error } = await context.supabase.rpc(
      "revise_financial_document",
      rpcArgs({
        _document_id: data.documentId,
        _subtotal: data.subtotal,
        _change_reason: data.changeReason,
        _tax_rate: data.taxRate,
        _tax_amount: data.taxAmount,
        _retention_amount: data.retentionAmount,
      }),
    );
    if (error) throw new Error(error.message);
    return { versionId: id as unknown as string };
  });

export const issueFinancialDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ entryId: string | null }> => {
    const { data: id, error } = await context.supabase.rpc("issue_financial_document", {
      _document_id: data.documentId,
    });
    if (error) throw new Error(error.message);
    return { entryId: (id as unknown as string) ?? null };
  });

export const cancelFinancialDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("cancel_financial_document", {
      _document_id: data.documentId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Retention holds                                                     */
/* ------------------------------------------------------------------ */

export type RetentionEvent = {
  id: string;
  event_type: RetentionEventType;
  event_date: string;
  note: string | null;
  acted_at: string;
  amount: number | null;
  amount_masked: boolean;
};

export type RetentionHold = {
  id: string;
  project_id: string;
  contract_id: string | null;
  milestone_id: string | null;
  kind: RetentionKind;
  hold_start_date: string;
  expected_release_date: string | null;
  release_terms_ar: string | null;
  release_terms_en: string | null;
  status: RetentionStatus;
  created_at: string;
  held_amount: number | null;
  released_amount: number | null;
  remaining_amount: number | null;
  currency: string | null;
  amounts_masked: boolean;
  events: RetentionEvent[];
};

export const listRetentionHolds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<RetentionHold[]> => {
    const { data: holds, error } = await context.supabase
      .from("retention_holds")
      .select(
        "id, project_id, contract_id, milestone_id, kind, hold_start_date, expected_release_date, release_terms_ar, release_terms_en, status, created_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = holds ?? [];
    if (!rows.length) return [];
    const ids = rows.map((h) => h.id);

    const { data: amounts } = await context.supabase
      .from("retention_hold_amounts")
      .select("hold_id, held_amount, released_amount, currency")
      .in("hold_id", ids);
    const amountBy = new Map((amounts ?? []).map((a) => [a.hold_id as string, a]));

    const { data: events } = await context.supabase
      .from("retention_events")
      .select("id, hold_id, event_type, event_date, note, acted_at")
      .in("hold_id", ids)
      .order("acted_at", { ascending: true });
    const eventIds = (events ?? []).map((e) => e.id);
    const { data: eventAmounts } = eventIds.length
      ? await context.supabase
          .from("retention_event_amounts")
          .select("event_id, amount")
          .in("event_id", eventIds)
      : { data: [] as Array<Record<string, unknown>> };
    const eventAmountBy = new Map(
      (eventAmounts ?? []).map((a) => [a.event_id as string, toNumber(a.amount)]),
    );

    return rows.map((hold) => {
      const a = amountBy.get(hold.id);
      const held = toNumber(a?.["held_amount"]);
      const released = toNumber(a?.["released_amount"]);
      return {
        ...(hold as Omit<
          RetentionHold,
          | "held_amount"
          | "released_amount"
          | "remaining_amount"
          | "currency"
          | "amounts_masked"
          | "events"
        >),
        held_amount: held,
        released_amount: released,
        remaining_amount: held === null || released === null ? null : held - released,
        currency: (a?.["currency"] as string | undefined) ?? null,
        amounts_masked: !a,
        events: (events ?? [])
          .filter((e) => e.hold_id === hold.id)
          .map((e) => ({
            id: e.id,
            event_type: e.event_type as RetentionEventType,
            event_date: e.event_date,
            note: e.note,
            acted_at: e.acted_at,
            amount: eventAmountBy.get(e.id) ?? null,
            amount_masked: !eventAmountBy.has(e.id),
          })),
      };
    });
  });

export const createRetentionHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        heldAmount: z.number().positive(),
        kind: z.enum(RETENTION_KINDS).default("retention"),
        contractId: z.string().uuid().nullable().optional(),
        milestoneId: z.string().uuid().nullable().optional(),
        expectedReleaseDate: z.string().nullable().optional(),
        releaseTermsAr: z.string().trim().max(1000).nullable().optional(),
        releaseTermsEn: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc(
      "create_retention_hold",
      rpcArgs({
        _project_id: data.projectId,
        _held_amount: data.heldAmount,
        _kind: data.kind,
        _contract_id: data.contractId ?? undefined,
        _milestone_id: data.milestoneId ?? undefined,
        _expected_release_date: data.expectedReleaseDate || undefined,
        _release_terms_ar: data.releaseTermsAr || undefined,
        _release_terms_en: data.releaseTermsEn || undefined,
      }),
    );
    if (error) throw new Error(error.message);
    return { id: id as unknown as string };
  });

export const releaseRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        holdId: z.string().uuid(),
        amount: z.number().positive(),
        note: z.string().trim().max(500).nullable().optional(),
        documentId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "release_retention",
      rpcArgs({
        _hold_id: data.holdId,
        _amount: data.amount,
        _note: data.note || undefined,
        _document_id: data.documentId ?? undefined,
      }),
    );
    if (error) throw new Error(error.message);
    return z
      .object({ event_id: z.string().uuid(), status: z.enum(RETENTION_STATUSES) })
      .parse(result);
  });

export const forfeitRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        holdId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("forfeit_retention", {
      _hold_id: data.holdId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelRetentionHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        holdId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("cancel_retention_hold", {
      _hold_id: data.holdId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

export type LedgerLine = {
  id: string;
  line_no: number;
  account_code: string;
  account_name_ar: string | null;
  account_name_en: string | null;
  side: "debit" | "credit";
  amount: number;
  currency: string;
  memo: string | null;
};

export type LedgerEntry = {
  id: string;
  entry_date: string;
  source_type: LedgerSourceType;
  source_id: string | null;
  memo: string | null;
  is_reversal: boolean;
  reverses_entry_id: string | null;
  reversed_by_entry_id: string | null;
  created_at: string;
  lines: LedgerLine[];
  amounts_masked: boolean;
  total_debit: number | null;
  total_credit: number | null;
};

export const listLedgerEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<LedgerEntry[]> => {
    const { data: entries, error } = await context.supabase
      .from("ledger_entries")
      .select(
        "id, entry_date, source_type, source_id, memo, is_reversal, reverses_entry_id, created_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = entries ?? [];
    if (!rows.length) return [];

    const ids = rows.map((e) => e.id);
    const { data: lines } = await context.supabase
      .from("ledger_lines")
      .select("id, entry_id, line_no, account_code, side, amount, currency, memo")
      .in("entry_id", ids)
      .order("line_no", { ascending: true });

    const { data: accounts } = await context.supabase
      .from("ledger_accounts")
      .select("code, name_ar, name_en");
    const accountBy = new Map((accounts ?? []).map((a) => [a.code as string, a]));

    const reversedBy = new Map(
      rows
        .filter((e) => e.reverses_entry_id)
        .map((e) => [e.reverses_entry_id as string, e.id]),
    );

    return rows.map((entry) => {
      const entryLines = (lines ?? [])
        .filter((l) => l.entry_id === entry.id)
        .map((l) => {
          const account = accountBy.get(l.account_code as string);
          return {
            id: l.id,
            line_no: l.line_no,
            account_code: l.account_code,
            account_name_ar: (account?.["name_ar"] as string | undefined) ?? null,
            account_name_en: (account?.["name_en"] as string | undefined) ?? null,
            side: l.side as "debit" | "credit",
            amount: Number(l.amount),
            currency: l.currency,
            memo: l.memo,
          };
        });
      const masked = entryLines.length === 0;
      const sum = (side: "debit" | "credit") =>
        entryLines.filter((l) => l.side === side).reduce((t, l) => t + l.amount, 0);
      return {
        ...(entry as Omit<
          LedgerEntry,
          "lines" | "amounts_masked" | "total_debit" | "total_credit" | "reversed_by_entry_id"
        >),
        reversed_by_entry_id: reversedBy.get(entry.id) ?? null,
        lines: entryLines,
        amounts_masked: masked,
        total_debit: masked ? null : sum("debit"),
        total_credit: masked ? null : sum("credit"),
      };
    });
  });

/** The only correction path. A given entry can be reversed at most once. */
export const reverseLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entryId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ entryId: string }> => {
    const { data: id, error } = await context.supabase.rpc("reverse_ledger_entry", {
      _entry_id: data.entryId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { entryId: id as unknown as string };
  });
