import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * التعاقد — معاملات تعاقد مربوطة بسياق (مشروع/طلب/تكليف/إعلان/أخرى).
 *
 * كل معاملة لها طرفان: الطرف الأول هو الحساب النشط للمنشئ، والطرف الثاني إلزامي
 * ويُعرَّف برقم هوية (شخص) أو رقم سجل تجاري (منشأة). المطابقة مع رقم الهوية تتم
 * ببصمة HMAC حتمية على الخادم فقط — الرقم الخام لا يُرسل ولا يُخزَّن ظاهرًا.
 * العزل مفروض في القاعدة عبر RLS؛ لا يمنح التعاقد أي وصول لبيانات المشروع.
 */

const uuid = z.string().uuid();
const entityId = uuid.nullable().default(null);

export const DEAL_STATUSES = ["draft", "negotiating", "agreed", "signed", "cancelled"] as const;
export const DEAL_CONTEXTS = ["project", "request", "assignment", "listing", "other"] as const;
export const PARTY_KINDS = ["person", "entity"] as const;

export type DealParty = {
  party_role: "first" | "second";
  party_kind: "person" | "entity";
  identifier_kind: "national_id" | "cr_number" | null;
  identifier_last4: string | null;
  cr_number: string | null;
  display_name: string | null;
  is_registered: boolean;
  acceptance_status: "pending" | "accepted" | "declined";
  responded_at: string | null;
  matched_user_id: string | null;
  matched_entity_id: string | null;
};

export type Deal = {
  id: string;
  title: string;
  counterparty_name: string | null;
  context_type: string;
  context_id: string | null;
  status: string;
  second_party_status: "pending" | "accepted" | "declined";
  amount: number | string | null;
  currency: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  owner_user_id: string | null;
  entity_id: string | null;
  parties: DealParty[];
  /** اسم الطلب المرتبط (عند ربط المعاملة بطلب) — يظهر فقط لمن يملك صلاحية قراءته. */
  context_title: string | null;
  /** رقم الطلب المرتبط. */
  context_no: string | null;
  /** هل المستخدم الحالي هو الطرف الثاني (فيمكنه القبول أو الرفض)؟ */
  can_respond: boolean;
  /** هل المستخدم الحالي هو الطرف الأول (منشئ المعاملة)؟ */
  is_owner: boolean;
};

/** أرقام عربية/فارسية إلى ASCII ثم إزالة أي فواصل. */
function digitsOnly(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += char;
  }
  return out.replace(/[^0-9]/g, "");
}

export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        status: z.enum(DEAL_STATUSES).nullable().default(null),
        includeArchived: z.boolean().default(false),
        /** "mine" = معاملات أنشأتها، "incoming" = معاملات أنا طرفها الثاني. */
        scope: z.enum(["mine", "incoming"]).default("mine"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<Deal[]> => {
    let q = context.supabase
      .from("contracting_deals")
      .select(
        "id, title, counterparty_name, context_type, context_id, status, second_party_status, amount, currency, notes, archived_at, created_at, owner_user_id, entity_id, deal_parties(party_role, party_kind, identifier_kind, identifier_last4, cr_number, display_name, is_registered, acceptance_status, responded_at, matched_user_id, matched_entity_id)",
      );
    if (data.scope === "mine") {
      q = data.entityId ? q.eq("entity_id", data.entityId) : q.is("entity_id", null);
    }
    if (data.status) q = q.eq("status", data.status);
    if (!data.includeArchived) q = q.is("archived_at", null);

    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);

    const myEntities = new Set<string>();
    const { data: memberships } = await context.supabase
      .from("entity_memberships")
      .select("entity_id")
      .eq("user_id", context.userId)
      .eq("status", "active");
    for (const m of memberships ?? []) myEntities.add(m.entity_id as string);

    const mapped = (rows ?? []).map((row) => {
      const parties = ((row as { deal_parties?: DealParty[] }).deal_parties ?? []) as DealParty[];
      const second = parties.find((p) => p.party_role === "second") ?? null;
      const isSecond = Boolean(
        second &&
        (second.matched_user_id === context.userId ||
          (second.matched_entity_id && myEntities.has(second.matched_entity_id))),
      );
      const isOwner =
        row.owner_user_id === context.userId ||
        Boolean(row.entity_id && myEntities.has(row.entity_id as string));
      const { deal_parties: _drop, ...rest } = row as Record<string, unknown> & {
        deal_parties?: unknown;
      };
      return {
        ...(rest as Omit<Deal, "parties" | "can_respond" | "is_owner">),
        parties,
        can_respond: isSecond && second?.acceptance_status === "pending",
        is_owner: isOwner,
      } satisfies Deal;
    });

    return data.scope === "incoming" ? mapped.filter((d) => !d.is_owner) : mapped;
  });

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        title: z.string().trim().min(2, "العنوان قصير جدًا").max(200),
        partyKind: z.enum(PARTY_KINDS),
        /** رقم الهوية (10 أرقام) عندما يكون الطرف الثاني شخصًا. */
        nationalId: z.string().trim().max(40).nullable().default(null),
        /** رقم السجل التجاري (10 أرقام) عندما يكون الطرف الثاني منشأة. */
        crNumber: z.string().trim().max(40).nullable().default(null),
        /** اسم الطرف الثاني اختياري تمامًا؛ الخادم يعيد اشتقاقه عند وجود مطابقة. */
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
  .handler(async ({ data, context }): Promise<{ id: string; matched: boolean }> => {
    let fingerprint: string | null = null;
    let last4: string | null = null;
    let cr: string | null = null;

    if (data.partyKind === "person") {
      const digits = digitsOnly(data.nationalId ?? "");
      const { isValidSaudiId } = await import("@/lib/identity-format");
      if (!isValidSaudiId(digits)) throw new Error("SECOND_PARTY_ID_INVALID");
      const { identityFingerprint } = await import("@/lib/identity-crypto.server");
      fingerprint = identityFingerprint(digits);
      last4 = digits.slice(-4);
    } else {
      cr = digitsOnly(data.crNumber ?? "");
      if (!/^[0-9]{10}$/.test(cr)) throw new Error("SECOND_PARTY_CR_INVALID");
    }

    // الوسائط المولّدة تُعرَّف غير قابلة للـ null رغم أن الدالة تقبلها.
    const args = {
      _entity_id: data.entityId,
      _title: data.title,
      _party_kind: data.partyKind,
      _identifier_fingerprint: fingerprint,
      _identifier_last4: last4,
      _cr_number: cr,
      _display_name: data.counterpartyName?.trim() ? data.counterpartyName.trim() : null,
      _context_type: data.contextType,
      _context_id: data.contextId,
      _amount: data.amount,
      _currency: data.currency,
      _notes: data.notes,
    } as unknown as Parameters<typeof context.supabase.rpc<"create_contracting_deal">>[1];

    const { data: id, error } = await context.supabase.rpc("create_contracting_deal", args);
    if (error) {
      if (error.message.includes("SECOND_PARTY_IS_SELF")) throw new Error("SECOND_PARTY_IS_SELF");
      if (error.message.includes("NOT_ENTITY_MEMBER")) throw new Error("NOT_ENTITY_MEMBER");
      if (error.message.includes("SECOND_PARTY_CR_INVALID"))
        throw new Error("SECOND_PARTY_CR_INVALID");
      throw new Error("DEAL_CREATE_FAILED");
    }

    const { data: party } = await context.supabase
      .from("deal_parties")
      .select("is_registered")
      .eq("deal_id", id as string)
      .eq("party_role", "second")
      .maybeSingle();

    return { id: id as string, matched: Boolean(party?.is_registered) };
  });

export const respondToDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dealId: uuid, accept: z.boolean() }).parse(input))
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { data: status, error } = await context.supabase.rpc("respond_contracting_deal", {
      _deal_id: data.dealId,
      _accept: data.accept,
    });
    if (error) {
      if (error.message.includes("NOT_SECOND_PARTY")) throw new Error("NOT_SECOND_PARTY");
      throw new Error("DEAL_RESPOND_FAILED");
    }
    return { status: status as string };
  });

export const updateDealStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ dealId: uuid, status: z.enum(DEAL_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracting_deals")
      .update({ status: data.status })
      .eq("id", data.dealId);
    if (error) {
      if (error.message.includes("SECOND_PARTY_NOT_ACCEPTED")) {
        throw new Error("SECOND_PARTY_NOT_ACCEPTED");
      }
      throw new Error("DEAL_STATUS_FAILED");
    }
    return true;
  });

export const setDealArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ dealId: uuid, archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracting_deals")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.dealId);
    if (error) throw new Error(error.message);
    return true;
  });
