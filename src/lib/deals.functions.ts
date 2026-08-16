import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * صندوق التعاقد — معاملات تعاقد مربوطة بسياق (مشروع/طلب/تكليف/إعلان/أخرى).
 * العزل مفروض في القاعدة عبر RLS؛ لا يمنح التعاقد أي وصول لبيانات المشروع.
 */

const uuid = z.string().uuid();
const entityId = uuid.nullable().default(null);

export const DEAL_STATUSES = ["draft", "negotiating", "agreed", "signed", "cancelled"] as const;
export const DEAL_CONTEXTS = ["project", "request", "assignment", "listing", "other"] as const;

export type Deal = {
  id: string;
  title: string;
  counterparty_name: string | null;
  context_type: string;
  context_id: string | null;
  status: string;
  amount: number | string | null;
  currency: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
};

export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        status: z.enum(DEAL_STATUSES).nullable().default(null),
        includeArchived: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<Deal[]> => {
    let q = context.supabase
      .from("contracting_deals")
      .select(
        "id, title, counterparty_name, context_type, context_id, status, amount, currency, notes, archived_at, created_at",
      );
    q = data.entityId ? q.eq("entity_id", data.entityId) : q.is("entity_id", null);
    if (data.status) q = q.eq("status", data.status);
    if (!data.includeArchived) q = q.is("archived_at", null);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Deal[];
  });

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        title: z.string().trim().min(2).max(200),
        counterpartyName: z.string().trim().max(160).nullable().default(null),
        contextType: z.enum(DEAL_CONTEXTS).default("other"),
        contextId: uuid.nullable().default(null),
        amount: z.number().min(0).nullable().default(null),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .default("SAR"),
        notes: z.string().max(4000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("contracting_deals")
      .insert({
        entity_id: data.entityId,
        owner_user_id: context.userId,
        title: data.title,
        counterparty_name: data.counterpartyName,
        context_type: data.contextType,
        context_id: data.contextId,
        amount: data.amount,
        currency: data.currency,
        notes: data.notes,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateDealStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, status: z.enum(DEAL_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracting_deals")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return true;
  });

export const setDealArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid, archived: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracting_deals")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return true;
  });
