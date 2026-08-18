/**
 * موصلات صناديق البريد عبر HTTP APIs (Gmail API / Microsoft Graph) — لا SMTP/IMAP.
 * سبب المنع: بيئة التشغيل بلا منافذ SMTP، فبناء موصل عليها يكون هشًا ويوهم بدعم غير موجود.
 *
 * كل موصل يلتزم الواجهة نفسها، فإضافة مزود جديد لاحقًا لا تمس بقية الطبقات.
 */
import { GMAIL_SCOPES, MICROSOFT_SCOPES, type MailProvider } from "./providers";

export type MailHeader = {
  source_id: string;
  thread_id: string | null;
  subject: string | null;
  from_address: string | null;
  to_addresses: string[];
  snippet: string | null;
  sent_at: string | null;
  is_read: boolean;
};

export type MailTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  email: string | null;
  externalAccountId: string | null;
  scopes: string[];
};

export type MailAdapter = {
  provider: MailProvider;
  /** هل أعدّ مدير النظام هذا المزوّد فعلًا؟ لا نعرض «ربط» بلا إعداد حقيقي. */
  configured(): boolean;
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<MailTokens>;
  refresh(refreshToken: string): Promise<MailTokens>;
  listHeaders(accessToken: string, folder: "inbox" | "sent", limit: number): Promise<MailHeader[]>;
  getBody(accessToken: string, sourceId: string): Promise<{ body: string; html: boolean }>;
  send(
    accessToken: string,
    msg: { to: string; subject: string; body: string; threadId?: string | null },
  ): Promise<{ sourceId: string | null }>;
};

const env = (n: string) => (process.env[n] ?? "").trim();

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`MAIL_PROVIDER_ERROR:${res.status}`);
  return (await res.json()) as T;
}

// ── Gmail ────────────────────────────────────────────────────────────
const gmail: MailAdapter = {
  provider: "gmail",
  configured: () => Boolean(env("GOOGLE_OAUTH_CLIENT_ID") && env("GOOGLE_OAUTH_CLIENT_SECRET")),
  authUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: GMAIL_SCOPES.join(" "),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
        client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const t = await json<{ access_token: string; refresh_token?: string; expires_in?: number }>(res);
    const me = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { authorization: `Bearer ${t.access_token}` },
    });
    const profile = me.ok ? ((await me.json()) as { emailAddress?: string }) : {};
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
      email: profile.emailAddress ?? null,
      externalAccountId: profile.emailAddress ?? null,
      scopes: GMAIL_SCOPES,
    };
  },
  async refresh(refreshToken) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
        client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
        grant_type: "refresh_token",
      }),
    });
    const t = await json<{ access_token: string; expires_in?: number }>(res);
    return {
      accessToken: t.access_token,
      refreshToken,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
      email: null,
      externalAccountId: null,
      scopes: GMAIL_SCOPES,
    };
  },
  async listHeaders(accessToken, folder, limit) {
    const label = folder === "sent" ? "SENT" : "INBOX";
    const list = await json<{ messages?: Array<{ id: string; threadId: string }> }>(
      await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${label}&maxResults=${limit}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      ),
    );
    const ids = (list.messages ?? []).slice(0, limit);
    // الرؤوس فقط: المحتوى والمرفقات تُحمَّل عند الطلب لتقليل الحمل.
    return Promise.all(
      ids.map(async (m) => {
        const d = await json<{
          id: string;
          threadId: string;
          snippet?: string;
          internalDate?: string;
          labelIds?: string[];
          payload?: { headers?: Array<{ name: string; value: string }> };
        }>(
          await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
            { headers: { authorization: `Bearer ${accessToken}` } },
          ),
        );
        const h = (n: string) =>
          d.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? null;
        return {
          source_id: d.id,
          thread_id: d.threadId ?? null,
          subject: h("subject"),
          from_address: h("from"),
          to_addresses: (h("to") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          snippet: d.snippet ?? null,
          sent_at: d.internalDate ? new Date(Number(d.internalDate)).toISOString() : null,
          is_read: !(d.labelIds ?? []).includes("UNREAD"),
        } satisfies MailHeader;
      }),
    );
  },
  async getBody(accessToken, sourceId) {
    const d = await json<{ payload?: unknown; snippet?: string }>(
      await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${sourceId}?format=full`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      ),
    );
    const text = extractGmailBody(d.payload);
    return { body: text ?? d.snippet ?? "", html: false };
  },
  async send(accessToken, msg) {
    const raw = Buffer.from(
      [
        `To: ${msg.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(msg.subject, "utf8").toString("base64")}?=`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        msg.body,
      ].join("\r\n"),
      "utf8",
    ).toString("base64url");
    const d = await json<{ id?: string }>(
      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(msg.threadId ? { raw, threadId: msg.threadId } : { raw }),
      }),
    );
    return { sourceId: d.id ?? null };
  },
};

function extractGmailBody(payload: unknown): string | null {
  const node = payload as
    | { mimeType?: string; body?: { data?: string }; parts?: unknown[] }
    | undefined;
  if (!node) return null;
  if (node.mimeType === "text/plain" && node.body?.data)
    return Buffer.from(node.body.data, "base64url").toString("utf8");
  for (const p of node.parts ?? []) {
    const found = extractGmailBody(p);
    if (found) return found;
  }
  return null;
}

// ── Microsoft Graph ──────────────────────────────────────────────────
const tenant = () => env("MICROSOFT_OAUTH_TENANT") || "common";

const microsoft: MailAdapter = {
  provider: "microsoft",
  configured: () =>
    Boolean(env("MICROSOFT_OAUTH_CLIENT_ID") && env("MICROSOFT_OAUTH_CLIENT_SECRET")),
  authUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: env("MICROSOFT_OAUTH_CLIENT_ID"),
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: MICROSOFT_SCOPES.join(" "),
      state,
    });
    return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${p.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const t = await json<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env("MICROSOFT_OAUTH_CLIENT_ID"),
          client_secret: env("MICROSOFT_OAUTH_CLIENT_SECRET"),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope: MICROSOFT_SCOPES.join(" "),
        }),
      }),
    );
    const me = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { authorization: `Bearer ${t.access_token}` },
    });
    const p = me.ok
      ? ((await me.json()) as { id?: string; mail?: string; userPrincipalName?: string })
      : {};
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
      email: p.mail ?? p.userPrincipalName ?? null,
      externalAccountId: p.id ?? null,
      scopes: MICROSOFT_SCOPES,
    };
  },
  async refresh(refreshToken) {
    const t = await json<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: env("MICROSOFT_OAUTH_CLIENT_ID"),
          client_secret: env("MICROSOFT_OAUTH_CLIENT_SECRET"),
          grant_type: "refresh_token",
          scope: MICROSOFT_SCOPES.join(" "),
        }),
      }),
    );
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? refreshToken,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
      email: null,
      externalAccountId: null,
      scopes: MICROSOFT_SCOPES,
    };
  },
  async listHeaders(accessToken, folder, limit) {
    const f = folder === "sent" ? "sentitems" : "inbox";
    const d = await json<{
      value?: Array<{
        id: string;
        conversationId?: string;
        subject?: string;
        bodyPreview?: string;
        isRead?: boolean;
        sentDateTime?: string;
        from?: { emailAddress?: { address?: string } };
        toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      }>;
    }>(
      await fetch(
        `https://graph.microsoft.com/v1.0/me/mailFolders/${f}/messages?$top=${limit}&$select=id,conversationId,subject,bodyPreview,isRead,sentDateTime,from,toRecipients`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      ),
    );
    return (d.value ?? []).map((m) => ({
      source_id: m.id,
      thread_id: m.conversationId ?? null,
      subject: m.subject ?? null,
      from_address: m.from?.emailAddress?.address ?? null,
      to_addresses: (m.toRecipients ?? [])
        .map((r) => r.emailAddress?.address ?? "")
        .filter(Boolean),
      snippet: m.bodyPreview ?? null,
      sent_at: m.sentDateTime ?? null,
      is_read: Boolean(m.isRead),
    }));
  },
  async getBody(accessToken, sourceId) {
    const d = await json<{ body?: { content?: string; contentType?: string } }>(
      await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${sourceId}?$select=body`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      ),
    );
    return { body: d.body?.content ?? "", html: d.body?.contentType === "html" };
  },
  async send(accessToken, msg) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: msg.subject,
          body: { contentType: "Text", content: msg.body },
          toRecipients: [{ emailAddress: { address: msg.to } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) throw new Error(`MAIL_PROVIDER_ERROR:${res.status}`);
    return { sourceId: null };
  },
};

const ADAPTERS: Record<"gmail" | "microsoft", MailAdapter> = { gmail, microsoft };

export function adapterFor(provider: string): MailAdapter {
  const a = ADAPTERS[provider as "gmail" | "microsoft"];
  if (!a) throw new Error("PROVIDER_NOT_SUPPORTED");
  return a;
}

export function providerConfigured(provider: MailProvider): boolean {
  if (provider === "other") return false;
  return adapterFor(provider).configured();
}
