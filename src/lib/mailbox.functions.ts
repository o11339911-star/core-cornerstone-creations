import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAIL_PROVIDERS, type MailProvider } from "@/lib/mail/providers";

/**
 * صندوق البريد داخل ركيز: ربط Gmail / Microsoft عبر HTTP APIs فقط.
 * لا تصل أي توكنات أو أسرار إلى المتصفح، والقراءة معزولة بمالك الاتصال.
 */

const uuid = z.string().uuid();
type Db = SupabaseClient;
const db = (c: unknown) => c as Db;

export type MailboxProviderState = {
  provider: MailProvider;
  configured: boolean;
};

export type MailboxConnection = {
  id: string;
  provider: string;
  email_address: string;
  status: string;
  last_sync_at: string | null;
};

export type MailboxMessage = {
  id: string;
  source_id: string;
  thread_id: string | null;
  folder: string;
  subject: string | null;
  from_address: string | null;
  to_addresses: string[];
  snippet: string | null;
  sent_at: string | null;
  is_read: boolean;
};

/** حالة الإعداد للمزودين + الاتصالات القائمة. لا مصطلحات تقنية في الخرج. */
export const getMailboxOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entityId: uuid.nullable().default(null) }).parse(input ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      available: boolean;
      providers: MailboxProviderState[];
      connections: MailboxConnection[];
    }> => {
      const { providerConfigured } = await import("@/lib/mail/adapters.server");
      const providers = MAIL_PROVIDERS.map((p) => ({ provider: p, configured: providerConfigured(p) }));

      let q = db(context.supabase)
        .from("mailbox_connections")
        .select("id, provider, email_address, status, last_sync_at")
        .neq("status", "disconnected");
      q = data.entityId
        ? q.eq("owner_entity_id", data.entityId)
        : q.eq("owner_user_id", context.userId);
      const { data: rows, error } = await q.order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return { available: true, providers, connections: (rows ?? []) as MailboxConnection[] };
    },
  );

/** يبدأ الربط ويُعيد رابط موافقة المزوّد. لا يُعرض للمستخدم أي مصطلح تقني. */
export const startMailboxConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid.nullable().default(null),
        provider: z.enum(["gmail", "microsoft"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { adapterFor } = await import("@/lib/mail/adapters.server");
    const { signState } = await import("@/lib/mail/state.server");
    const adapter = adapterFor(data.provider);
    if (!adapter.configured()) throw new Error("PROVIDER_NOT_CONFIGURED");

    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const redirectUri = `${origin}/api/public/mail/callback`;
    const state = signState({
      userId: context.userId,
      entityId: data.entityId,
      provider: data.provider,
      exp: Date.now() + 10 * 60 * 1000,
    });
    return { url: adapter.authUrl(state, redirectUri) };
  });

export const syncMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ connectionId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ inbox: number; sent: number }> => {
    const conn = await requireConnection(context, data.connectionId);
    const { adapterFor } = await import("@/lib/mail/adapters.server");
    const { accessTokenFor, cacheHeaders } = await import("@/lib/mail/store.server");
    const token = await accessTokenFor(conn);
    const adapter = adapterFor(conn.provider);
    const inbox = await adapter.listHeaders(token, "inbox", 25);
    const sent = await adapter.listHeaders(token, "sent", 25);
    await cacheHeaders(conn, "inbox", inbox);
    await cacheHeaders(conn, "sent", sent);
    return { inbox: inbox.length, sent: sent.length };
  });

export const listMailboxMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        connectionId: uuid,
        folder: z.enum(["inbox", "sent"]).default("inbox"),
        search: z.string().trim().max(120).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<MailboxMessage[]> => {
    await requireConnection(context, data.connectionId);
    let q = db(context.supabase)
      .from("mailbox_messages")
      .select(
        "id, source_id, thread_id, folder, subject, from_address, to_addresses, snippet, sent_at, is_read",
      )
      .eq("connection_id", data.connectionId)
      .eq("folder", data.folder);
    if (data.search) q = q.or(`subject.ilike.%${data.search}%,snippet.ilike.%${data.search}%`);
    const { data: rows, error } = await q.order("sent_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MailboxMessage[];
  });

/** المحتوى يُحمَّل عند الطلب فقط، ولا يُخزَّن في القاعدة. */
export const getMailboxMessageBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ connectionId: uuid, sourceId: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ body: string; html: boolean }> => {
    const conn = await requireConnection(context, data.connectionId);
    const { adapterFor } = await import("@/lib/mail/adapters.server");
    const { accessTokenFor } = await import("@/lib/mail/store.server");
    const token = await accessTokenFor(conn);
    return adapterFor(conn.provider).getBody(token, data.sourceId);
  });

export const sendMailboxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        connectionId: uuid,
        to: z.string().trim().email(),
        subject: z.string().trim().min(1).max(200),
        body: z.string().max(20000).default(""),
        threadId: z.string().max(200).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ sent: boolean }> => {
    const conn = await requireConnection(context, data.connectionId);
    const { adapterFor } = await import("@/lib/mail/adapters.server");
    const { accessTokenFor, cacheHeaders } = await import("@/lib/mail/store.server");
    const token = await accessTokenFor(conn);
    const adapter = adapterFor(conn.provider);
    await adapter.send(token, {
      to: data.to,
      subject: data.subject,
      body: data.body,
      threadId: data.threadId,
    });
    // تحديث «المرسل» مباشرة ليظهر أثر الإرسال بلا انتظار مزامنة كاملة.
    const sent = await adapter.listHeaders(token, "sent", 10);
    await cacheHeaders(conn, "sent", sent);
    return { sent: true };
  });

export const disconnectMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ connectionId: uuid, keepArchive: z.boolean().default(true) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ disconnected: boolean }> => {
    await requireConnection(context, data.connectionId);
    const { revokeConnection } = await import("@/lib/mail/store.server");
    await revokeConnection(data.connectionId, data.keepArchive);
    return { disconnected: true };
  });

/** العزل: القراءة تمر بـRLS، فلا يصل أي طرف ثالث إلى اتصال غيره. */
async function requireConnection(
  context: { supabase: unknown; userId: string },
  connectionId: string,
) {
  const { data, error } = await db(context.supabase)
    .from("mailbox_connections")
    .select("id, provider, email_address, status, last_sync_at, owner_user_id, owner_entity_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("FORBIDDEN");
  return data as {
    id: string;
    provider: string;
    email_address: string;
    status: string;
    last_sync_at: string | null;
    owner_user_id: string;
    owner_entity_id: string | null;
  };
}
