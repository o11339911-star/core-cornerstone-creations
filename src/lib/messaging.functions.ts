import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * المراسلات (بريد / واتساب / طلبات عروض أسعار) وقنوات الربط.
 *
 * قاعدة صارمة: لا تُخزَّن أي قيمة سر في القاعدة ولا تُعاد للواجهة أبدًا —
 * يُحفظ اسم متغير البيئة فقط، وحالة الاتصال تُشتق خادميًا من وجود القيمة.
 * لا يدّعي التطبيق اتصالًا غير حقيقي: بدون مفتاح صالح تبقى الحالة "بانتظار
 * بيانات الاعتماد" وتُسجَّل المراسلة يدويًا دون إرسال خارجي.
 */

const uuid = z.string().uuid();
const entityId = uuid.nullable().default(null);

export const MESSAGING_CHANNELS = ["email", "whatsapp"] as const;
export const CORRESPONDENCE_CHANNELS = ["email", "whatsapp", "rfq", "other"] as const;

export type MessagingChannel = {
  id: string;
  channel: string;
  status: string;
  provider: string | null;
  from_address: string | null;
  secret_env_name: string | null;
  note: string | null;
  updated_at: string;
  /** مشتق خادميًا: هل قيمة السر موجودة فعلًا في بيئة التشغيل؟ */
  secret_present: boolean;
};

export type CorrespondenceRow = {
  id: string;
  channel: string;
  direction: string;
  subject: string;
  body: string;
  counterparty_name: string | null;
  counterparty_address: string | null;
  project_id: string | null;
  request_id: string | null;
  status: string;
  archived_at: string | null;
  created_at: string;
};

export const listMessagingChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entityId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<MessagingChannel[]> => {
    const { data: rows, error } = await context.supabase
      .from("entity_messaging_channels")
      .select("id, channel, status, provider, from_address, secret_env_name, note, updated_at")
      .eq("entity_id", data.entityId);
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => {
      const envName = row.secret_env_name as string | null;
      const present = Boolean(envName && (process.env[envName] ?? "").trim().length > 0);
      return {
        ...(row as Omit<MessagingChannel, "secret_present">),
        secret_present: present,
        status: present ? "connected" : envName ? "awaiting_credentials" : "not_configured",
      };
    });
  });

export const saveMessagingChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid,
        channel: z.enum(MESSAGING_CHANNELS),
        provider: z.string().trim().max(60).nullable().default(null),
        fromAddress: z.string().trim().max(200).nullable().default(null),
        secretEnvName: z
          .string()
          .trim()
          .regex(/^[A-Z][A-Z0-9_]{2,60}$/)
          .nullable()
          .default(null),
        note: z.string().trim().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const present = Boolean(
      data.secretEnvName && (process.env[data.secretEnvName] ?? "").trim().length > 0,
    );
    const { error } = await context.supabase.from("entity_messaging_channels").upsert(
      {
        entity_id: data.entityId,
        channel: data.channel,
        provider: data.provider,
        from_address: data.fromAddress,
        secret_env_name: data.secretEnvName,
        note: data.note,
        status: present ? "connected" : data.secretEnvName ? "awaiting_credentials" : "not_configured",
        updated_by: context.userId,
      },
      { onConflict: "entity_id,channel" },
    );
    if (error) throw new Error(error.message);
    return { connected: present };
  });

export const listCorrespondence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        channel: z.enum(CORRESPONDENCE_CHANNELS).nullable().default(null),
        direction: z.enum(["incoming", "outgoing"]).nullable().default(null),
        includeArchived: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<CorrespondenceRow[]> => {
    let q = context.supabase
      .from("entity_correspondence")
      .select(
        "id, channel, direction, subject, body, counterparty_name, counterparty_address, project_id, request_id, status, archived_at, created_at",
      );
    q = data.entityId ? q.eq("entity_id", data.entityId) : q.is("entity_id", null);
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.direction) q = q.eq("direction", data.direction);
    if (!data.includeArchived) q = q.is("archived_at", null);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as CorrespondenceRow[];
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9]{9,15}$/;

export const createCorrespondence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId,
        channel: z.enum(CORRESPONDENCE_CHANNELS),
        // الاتجاه لا يُدخل يدويًا: يُشتق خادميًا من مكان الإنشاء (وارد/صادر).
        origin: z.enum(["inbox", "outbox"]).default("outbox"),
        subject: z.string().trim().min(1).max(200),
        body: z.string().max(20000).default(""),
        counterpartyName: z.string().trim().max(160).nullable().default(null),
        counterpartyAddress: z.string().trim().max(200).nullable().default(null),
        projectId: uuid.nullable().default(null),
        requestId: uuid.nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const direction = data.origin === "inbox" ? "incoming" : "outgoing";
    const address = (data.counterpartyAddress ?? "").trim();

    // المستلم إلزامي في الصادر، ويُتحقق منه بحسب القناة.
    if (direction === "outgoing") {
      if (!address) throw new Error("RECIPIENT_REQUIRED");
      if (data.channel === "email" && !EMAIL_RE.test(address)) throw new Error("RECIPIENT_INVALID");
      if (data.channel === "whatsapp" && !PHONE_RE.test(address.replace(/[\s-]/g, "")))
        throw new Error("RECIPIENT_INVALID");
    }

    const { data: row, error } = await context.supabase
      .from("entity_correspondence")
      .insert({
        entity_id: data.entityId,
        owner_user_id: context.userId,
        channel: data.channel,
        direction,
        subject: data.subject,
        body: data.body,
        counterparty_name: data.counterpartyName,
        counterparty_address: address || null,
        project_id: data.projectId,
        request_id: data.requestId,
        status: "logged",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });


export const setCorrespondenceArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("entity_correspondence")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return true;
  });
