/**
 * تخزين اتصالات صناديق البريد والتوكنات — خادمي بحت عبر عميل الخدمة.
 * التوكنات تعيش في مخطط private ولا تصل Data API ولا المتصفح إطلاقًا.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { adapterFor, type MailHeader } from "./adapters.server";
import { decryptToken, encryptToken } from "./crypto.server";

type Db = SupabaseClient;

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export function isMissingObject(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    /does not exist|schema cache/i.test(message)
  );
}

export type ConnectionRow = {
  id: string;
  provider: string;
  email_address: string;
  status: string;
  last_sync_at: string | null;
  owner_user_id: string;
  owner_entity_id: string | null;
};

export const CONNECTION_COLS =
  "id, provider, email_address, status, last_sync_at, owner_user_id, owner_entity_id";

/** يحفظ الاتصال ويشفّر التوكنات. يُستدعى فقط بعد تحقق حالة OAuth الموقّعة. */
export async function upsertConnection(input: {
  userId: string;
  entityId: string | null;
  provider: string;
  email: string;
  externalAccountId: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}): Promise<string> {
  const db = await admin();
  const { data, error } = await db
    .from("mailbox_connections")
    .upsert(
      {
        owner_user_id: input.userId,
        owner_entity_id: input.entityId,
        provider: input.provider,
        email_address: input.email,
        external_account_id: input.externalAccountId,
        scopes: input.scopes,
        status: "connected",
        last_error_code: null,
      },
      { onConflict: "owner_user_id,provider,email_address" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;

  const { error: tokErr } = await db.schema("private").from("mailbox_tokens").upsert(
    {
      connection_id: id,
      access_cipher: encryptToken(input.accessToken),
      refresh_cipher: input.refreshToken ? encryptToken(input.refreshToken) : null,
      expires_at: input.expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (tokErr) throw new Error(tokErr.message);
  return id;
}

/** توكن وصول صالح: يُجدَّد تلقائيًا عند الحاجة، ولا يخرج من الخادم. */
export async function accessTokenFor(connection: ConnectionRow): Promise<string> {
  const db = await admin();
  const { data, error } = await db
    .schema("private")
    .from("mailbox_tokens")
    .select("access_cipher, refresh_cipher, expires_at")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as
    | { access_cipher: string | null; refresh_cipher: string | null; expires_at: string | null }
    | null;
  if (!row?.access_cipher) throw new Error("MAILBOX_NEEDS_REAUTH");

  const fresh = !row.expires_at || Date.parse(row.expires_at) - 60_000 > Date.now();
  if (fresh) return decryptToken(row.access_cipher);
  if (!row.refresh_cipher) {
    await db
      .from("mailbox_connections")
      .update({ status: "needs_reauth" })
      .eq("id", connection.id);
    throw new Error("MAILBOX_NEEDS_REAUTH");
  }

  const t = await adapterFor(connection.provider).refresh(decryptToken(row.refresh_cipher));
  await db.schema("private").from("mailbox_tokens").update({
    access_cipher: encryptToken(t.accessToken),
    expires_at: t.expiresAt,
    updated_at: new Date().toISOString(),
  }).eq("connection_id", connection.id);
  return t.accessToken;
}

/** يخزّن رؤوس الرسائل فقط (بلا محتوى) مع عزل المالك. */
export async function cacheHeaders(
  connection: ConnectionRow,
  folder: "inbox" | "sent",
  headers: MailHeader[],
): Promise<void> {
  if (headers.length === 0) return;
  const db = await admin();
  const { error } = await db.from("mailbox_messages").upsert(
    headers.map((h) => ({
      connection_id: connection.id,
      owner_user_id: connection.owner_user_id,
      owner_entity_id: connection.owner_entity_id,
      source_id: h.source_id,
      thread_id: h.thread_id,
      folder,
      subject: h.subject,
      from_address: h.from_address,
      to_addresses: h.to_addresses,
      snippet: h.snippet,
      sent_at: h.sent_at,
      is_read: h.is_read,
    })),
    { onConflict: "connection_id,source_id" },
  );
  if (error) throw new Error(error.message);
  await db
    .from("mailbox_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", connection.id);
}

/** إبطال آمن عند الفصل: تُحذف التوكنات فورًا، ويُحفظ الأرشيف إن طُلب. */
export async function revokeConnection(connectionId: string, keepArchive: boolean): Promise<void> {
  const db = await admin();
  await db.schema("private").from("mailbox_tokens").delete().eq("connection_id", connectionId);
  if (!keepArchive) await db.from("mailbox_messages").delete().eq("connection_id", connectionId);
  await db
    .from("mailbox_connections")
    .update({ status: "disconnected", last_sync_at: null })
    .eq("id", connectionId);
}
