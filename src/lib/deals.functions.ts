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

export const DEAL_STATUSES = ["new", "negotiating", "agreed", "signed", "cancelled"] as const;
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
  /** الرقم المرجعي المعتمد (REQ-000000) من التسلسل المركزي نفسه للطلبات. */
  reference_no: string;
  title: string;
  counterparty_name: string | null;
  context_type: string;
  context_id: string | null;
  status: string;
  second_party_status: "pending" | "accepted" | "declined";
  /** حالة مستقبل الطلب المعتمدة: بانتظار / قبول / رفض. */
  recipient_status: "pending" | "accepted" | "rejected";
  recipient_response_reason: string | null;
  recipient_responded_at: string | null;
  /** المعاملة الملغاة التي أُعيد إرسال هذا الطلب منها. */
  resubmitted_from_id: string | null;
  project_id: string | null;
  project_name: string | null;
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
        "id, reference_no, title, counterparty_name, context_type, context_id, status, second_party_status, recipient_status, recipient_response_reason, recipient_responded_at, resubmitted_from_id, project_id, amount, currency, notes, archived_at, created_at, owner_user_id, entity_id, deal_parties(party_role, party_kind, identifier_kind, identifier_last4, cr_number, display_name, is_registered, acceptance_status, responded_at, matched_user_id, matched_entity_id)",
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

    // أسماء الطلبات المرتبطة — قراءة محكومة بـ RLS، فما لا يملكه المستخدم لا يعود.
    const requestIds = Array.from(
      new Set(
        (rows ?? [])
          .filter((r) => r.context_type === "request" && r.context_id)
          .map((r) => r.context_id as string),
      ),
    );
    const requestMap = new Map<string, { no: string; subject: string }>();
    if (requestIds.length > 0) {
      const { data: reqRows } = await context.supabase
        .from("requests")
        .select("id, request_no, subject")
        .in("id", requestIds);
      for (const r of reqRows ?? []) {
        requestMap.set(r.id as string, {
          no: (r.request_no as string) ?? "",
          subject: (r.subject as string) ?? "",
        });
      }
    }

    // أسماء المشاريع المرتبطة — القراءة محكومة بـ RLS، فلا يظهر اسم مشروع لا يملكه المستخدم.
    const projectIds = Array.from(
      new Set((rows ?? []).map((r) => r.project_id as string | null).filter(Boolean) as string[]),
    );
    const projectMap = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: projRows } = await context.supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      for (const p of projRows ?? []) projectMap.set(p.id as string, (p.name as string) ?? "");
    }

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
      const req = row.context_id ? requestMap.get(row.context_id as string) : undefined;
      return {
        ...(rest as Omit<
          Deal,
          "parties" | "can_respond" | "is_owner" | "context_title" | "context_no" | "project_name"
        >),
        parties,
        project_name: row.project_id ? (projectMap.get(row.project_id as string) ?? null) : null,
        context_title: req?.subject || null,
        context_no: req?.no || null,
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
        /** ربط اختياري بمشروع من مشاريع الحساب النشط — لا يمنح أي وصول للطرف الآخر. */
        projectId: uuid.nullable().default(null),
        /** المعاملة الملغاة التي أُعيد الطلب منها. */
        resubmittedFromId: uuid.nullable().default(null),
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

    if (data.projectId) {
      const { error: linkError } = await context.supabase.rpc("link_deal_project", {
        _deal_id: id as string,
        _project_id: data.projectId,
      });
      if (linkError) throw new Error("PROJECT_LINK_FORBIDDEN");
    }
    if (data.resubmittedFromId) {
      await context.supabase.rpc("link_deal_resubmission", {
        _new_deal_id: id as string,
        _source_deal_id: data.resubmittedFromId,
      });
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
  .inputValidator((input: unknown) =>
    z
      .object({
        dealId: uuid,
        accept: z.boolean(),
        reason: z.string().trim().max(2000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { data: status, error } = await context.supabase.rpc("respond_contracting_deal", {
      _deal_id: data.dealId,
      _accept: data.accept,
      _reason: data.accept ? null : (data.reason ?? null),
    } as never);
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

/** بيانات طالب الخدمة (الطرف الأول) — تُجلب فقط عند فتح معاملة محددة. */
export type DealRequester = {
  found: boolean;
  kind: "person" | "entity" | null;
  name: string | null;
  /** رقم الهوية/الإقامة الكامل للشخص، أو null عند تعذّر الاشتقاق. */
  nationalId: string | null;
  last4: string | null;
  crNumber: string | null;
  unifiedNationalNumber: string | null;
};

export const getDealRequester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dealId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<DealRequester> => {
    // الصلاحية مفروضة داخل الدالة (auth.uid + private.deal_visible) وليس بالدور وحده.
    const { data: row, error } = await context.supabase.rpc("deal_requester_details", {
      _deal_id: data.dealId,
    });
    if (error) throw new Error("DEAL_REQUESTER_FORBIDDEN");

    const r = (row ?? {}) as Record<string, unknown>;
    if (!r["found"]) {
      return {
        found: false,
        kind: null,
        name: null,
        nationalId: null,
        last4: null,
        crNumber: null,
        unifiedNationalNumber: null,
      };
    }

    let nationalId: string | null = null;
    if (r["kind"] === "person") {
      // معرّف الطرف الأول يُقرأ بصلاحية المستخدم نفسه (RLS/deal_visible)، ثم يُفكّ التشفير
      // خادميًا فقط عبر المسار الخدمي — لا يخرج أي cipher من القاعدة إلى الواجهة.
      const { data: firstParty } = await context.supabase
        .from("deal_parties")
        .select("matched_user_id")
        .eq("deal_id", data.dealId)
        .eq("party_role", "first")
        .maybeSingle();
      const subjectId = (firstParty?.matched_user_id as string | null) ?? null;
      if (subjectId) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: cipher } = await supabaseAdmin.rpc("svc_identity_cipher", {
            _user_id: subjectId,
            _actor: context.userId,
          });
          if (typeof cipher === "string" && cipher) {
            const { decryptIdentity } = await import("@/lib/identity-crypto.server");
            nationalId = decryptIdentity(cipher);
          }
        } catch {
          nationalId = null;
        }
      }
    }

    return {
      found: true,
      kind: r["kind"] === "person" ? "person" : "entity",
      name: (r["name"] as string | null) ?? null,
      nationalId,
      last4: (r["last4"] as string | null) ?? null,
      crNumber: (r["cr_number"] as string | null) ?? null,
      unifiedNationalNumber: (r["unified_national_number"] as string | null) ?? null,
    };
  });

/** مشاريع الحساب النشط المتاحة للربط — القراءة محكومة بـ RLS ولا تعود مشاريع لا يملكها المستخدم. */
export const listLinkableProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ id: string; name: string }[]> => {
    let q = context.supabase.from("projects").select("id, name").order("created_at", {
      ascending: false,
    });
    q = data.entityId ? q.eq("entity_id", data.entityId) : q.is("entity_id", null);
    const { data: rows, error } = await q.limit(200);
    if (error) throw new Error("PROJECTS_LOAD_FAILED");
    return (rows ?? []).map((r) => ({ id: r.id as string, name: (r.name as string) ?? "" }));
  });

export const DEAL_MESSAGE_KINDS = ["reply", "info_request", "document_request"] as const;

export type DealAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
};

export type DealMessage = {
  id: string;
  kind: (typeof DEAL_MESSAGE_KINDS)[number];
  body: string | null;
  created_at: string;
  author_user_id: string;
  is_mine: boolean;
  attachments: DealAttachment[];
};

/** مسار الردود داخل المعاملة — لا يراه إلا طرفا المعاملة (RLS). */
export const listDealMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dealId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<DealMessage[]> => {
    const { data: rows, error } = await context.supabase
      .from("deal_messages")
      .select(
        "id, kind, body, created_at, author_user_id, deal_message_attachments(id, file_name, mime_type, size_bytes, storage_path)",
      )
      .eq("deal_id", data.dealId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error("DEAL_MESSAGES_FAILED");
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as (typeof DEAL_MESSAGE_KINDS)[number],
      body: (r.body as string | null) ?? null,
      created_at: r.created_at as string,
      author_user_id: r.author_user_id as string,
      is_mine: r.author_user_id === context.userId,
      attachments: ((r as { deal_message_attachments?: DealAttachment[] })
        .deal_message_attachments ?? []) as DealAttachment[],
    }));
  });

export const postDealMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dealId: uuid,
        kind: z.enum(DEAL_MESSAGE_KINDS),
        body: z.string().trim().max(4000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: id, error } = await context.supabase.rpc("post_deal_message", {
      _deal_id: data.dealId,
      _kind: data.kind,
      _body: data.body ?? "",
    });
    if (error) throw new Error("DEAL_MESSAGE_FAILED");
    return { id: id as string };
  });

/** أنواع الملفات المسموح بها فعليًا — مطابقة تمامًا لما تفرضه القاعدة. */
export const DEAL_ALLOWED_MIME: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};
export const DEAL_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const registerDealAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        messageId: uuid,
        storagePath: z.string().min(3).max(300),
        fileName: z.string().trim().min(1).max(240),
        mimeType: z.string().min(3).max(160),
        sizeBytes: z.number().int().positive().max(DEAL_MAX_FILE_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    if (!(data.mimeType in DEAL_ALLOWED_MIME)) throw new Error("MIME_NOT_ALLOWED");
    const { data: id, error } = await context.supabase.rpc("attach_deal_message_file", {
      _message_id: data.messageId,
      _storage_path: data.storagePath,
      _file_name: data.fileName,
      _mime_type: data.mimeType,
      _size_bytes: data.sizeBytes,
    });
    if (error) throw new Error("ATTACHMENT_FAILED");
    return { id: id as string };
  });
