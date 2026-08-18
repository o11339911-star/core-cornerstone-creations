import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * «البريد الرسمي» للفرد والكيان.
 *
 * قواعد ثابتة:
 *  * البريد لا يمنح أي صلاحية بذاته — بيانات تعريف قابلة للتحقق فقط.
 *  * لا يُعتبر موثقًا إلا خادميًا: إما مطابقة بريد الحساب المؤكد فعلًا،
 *    أو إتمام تحقق ملكية برمز لمرة واحدة له صلاحية زمنية.
 *  * أي تغيير للبريد يُسقط التوثيق ويستأنف التحقق من الصفر.
 *  * مصدر واحد لكل مالك (فهرس فريد)، فلا نسخ متضاربة.
 */

const uuid = z.string().uuid();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Db = SupabaseClient;
const db = (c: unknown) => c as Db;

export type OfficialEmailState = {
  available: boolean;
  email: string | null;
  status: "not_linked" | "pending" | "verified";
  verifiedAt: string | null;
};

const ownerInput = z.object({ entityId: uuid.nullable().default(null) });

async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export const getOfficialEmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ownerInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<OfficialEmailState> => {
    let q = db(context.supabase)
      .from("official_emails")
      .select("email, status, verified_at");
    q = data.entityId
      ? q.eq("owner_entity_id", data.entityId)
      : q.eq("owner_user_id", context.userId);
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    const r = row as { email: string; status: string; verified_at: string | null } | null;
    return {
      available: true,
      email: r?.email ?? null,
      status: r ? (r.status === "verified" ? "verified" : "pending") : "not_linked",
      verifiedAt: r?.verified_at ?? null,
    };
  });

/** رمز تحقق من ستة أرقام لاتينية، صالح ساعة واحدة. */
function makeCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

async function hash(code: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(code).digest("hex");
}

export const setOfficialEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid.nullable().default(null),
        email: z.string().trim().toLowerCase().max(200).refine((v) => EMAIL_RE.test(v), {
          message: "EMAIL_INVALID",
        }),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ available: boolean; status: "pending" | "verified"; delivered: boolean }> => {
      const service = await adminDb();

      // صلاحية الكيان تُتحقق عبر عميل المستخدم (RLS) قبل أي كتابة بصلاحية الخدمة.
      if (data.entityId) {
        const { data: ent, error } = await db(context.supabase)
          .from("entities")
          .select("id")
          .eq("id", data.entityId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!ent) throw new Error("FORBIDDEN");
      }

      // مطابقة بريد الحساب المؤكد فعليًا = توثيق خادمي مباشر (للفرد فقط).
      let verified = false;
      if (!data.entityId) {
        const claims = context.claims as { email?: string; email_verified?: boolean } | undefined;
        const authEmail = (claims?.email ?? "").toLowerCase();
        if (authEmail && authEmail === data.email) {
          const { data: userRes } = await service.auth.admin.getUserById(context.userId);
          verified = Boolean(userRes?.user?.email_confirmed_at) &&
            (userRes?.user?.email ?? "").toLowerCase() === data.email;
        }
      }

      const payload = {
        owner_user_id: data.entityId ? null : context.userId,
        owner_entity_id: data.entityId,
        email: data.email,
        status: verified ? "verified" : "pending",
        verified_at: verified ? new Date().toISOString() : null,
        verification_sent_at: verified ? null : new Date().toISOString(),
      };

      const { data: row, error } = await service
        .from("official_emails")
        .upsert(payload, {
          onConflict: data.entityId ? "owner_entity_id" : "owner_user_id",
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }

      if (verified) return { available: true, status: "verified", delivered: false };

      const code = makeCode();
      const { error: tokErr } = await service.schema("private").from("official_email_tokens").upsert(
        {
          official_email_id: (row as { id: string }).id,
          token_hash: await hash(code),
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "official_email_id" },
      );
      if (tokErr) throw new Error(tokErr.message);

      // الإرسال يتم عبر بريد المنصة التشغيلي إن كان مُعدًّا؛ وإلا نبقى صادقين: لم يُرسل.
      const delivered = await deliverCode(data.email, code);
      return { available: true, status: "pending", delivered };
    },
  );

/** إرسال الرمز عبر طبقة بريد المنصة وحدها (لا علاقة له بصندوق بريد المستخدم). */
async function deliverCode(to: string, code: string): Promise<boolean> {
  const { sendPlatformEmail } = await import("@/lib/mail/platform.server");
  const res = await sendPlatformEmail({
    to,
    subject: "رمز تأكيد البريد الرسمي في ركيز",
    text: `رمز التأكيد: ${code}\nالرمز صالح لمدة ساعة واحدة، ولا تشاركه مع أحد.`,
  });
  return res.sent;
}

export const verifyOfficialEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: uuid.nullable().default(null),
        code: z.string().trim().regex(/^[0-9]{6}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ verified: boolean }> => {
    let q = db(context.supabase).from("official_emails").select("id, status");
    q = data.entityId
      ? q.eq("owner_entity_id", data.entityId)
      : q.eq("owner_user_id", context.userId);
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    const rec = row as { id: string; status: string } | null;
    if (!rec) throw new Error("OFFICIAL_EMAIL_NOT_FOUND");
    if (rec.status === "verified") return { verified: true };

    const service = await adminDb();
    const { data: tok } = await service
      .schema("private")
      .from("official_email_tokens")
      .select("token_hash, expires_at")
      .eq("official_email_id", rec.id)
      .maybeSingle();
    const t = tok as { token_hash: string; expires_at: string } | null;
    if (!t || Date.parse(t.expires_at) < Date.now()) throw new Error("CODE_EXPIRED");
    if (t.token_hash !== (await hash(data.code))) {
      await service
        .from("official_emails")
        .update({ attempts: 0 })
        .eq("id", rec.id)
        .select("id");
      throw new Error("CODE_INVALID");
    }

    await service
      .from("official_emails")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", rec.id);
    await service
      .schema("private")
      .from("official_email_tokens")
      .delete()
      .eq("official_email_id", rec.id);
    return { verified: true };
  });
