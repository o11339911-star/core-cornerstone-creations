import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * بطاقة الموعد ودعوات المشاركين — كل قرار وصول خادمي.
 * معرّف الموعد وحده لا يمنح شيئًا: الطرفان والمشاركون المقبولون فقط.
 * قبل تطبيق الهجرة 06 تعود الاستجابات بحالة «غير متاح» بدل ادعاء نجاح.
 */

const uuid = z.string().uuid();
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

const missing = (m: string) => /does not exist|PGRST202|42883|schema cache/i.test(m);

export type AppointmentCard = {
  id: string;
  reference: string | null;
  created_at: string;
  kind: string;
  title: string;
  starts_at: string;
  previous_starts_at: string | null;
  status: string;
  requester_label: string;
  provider_label: string;
  my_access: "requester" | "provider" | "participant";
  can_confirm: boolean;
  can_manage: boolean;
  verify_date: string;
};

export const getAppointmentCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ appointmentId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ available: boolean; card: AppointmentCard | null }> => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: card, error } = await rpc("appointment_card", { _appointment_id: data.appointmentId });
    if (error) {
      if (missing(error.message)) return { available: false, card: null };
      throw new Error(error.message);
    }
    return { available: true, card: card as AppointmentCard };
  });

export type AppointmentInvite = {
  id: string;
  invitee: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  linked_account: boolean;
  created_at: string;
  responded_at: string | null;
};

export const listAppointmentInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ appointmentId: uuid }).parse(input))
  .handler(
    async ({ data, context }): Promise<{ available: boolean; invites: AppointmentInvite[] }> => {
      const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
      const { data: rows, error } = await rpc("list_appointment_invites", {
        _appointment_id: data.appointmentId,
      });
      if (error) {
        if (missing(error.message)) return { available: false, invites: [] };
        throw new Error(error.message);
      }
      return { available: true, invites: (rows ?? []) as AppointmentInvite[] };
    },
  );

/**
 * دعوة مشارك لاجتماع: بحساب من شبكة التواصل أو ببريد صحيح.
 * البريد غير المسجّل يبقى دعوة محفوظة بحالتها؛ لا ندّعي إرسالًا لم يحدث.
 */
export const inviteAppointmentParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        appointmentId: uuid,
        email: z.string().trim().toLowerCase().email().nullable().default(null),
        userId: uuid.nullable().default(null),
      })
      .refine((v) => Boolean(v.email || v.userId), { message: "INVITE_TARGET_REQUIRED" })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ available: boolean; linkedAccount: boolean; emailSent: boolean }> => {
      const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
      const { data: res, error } = await rpc("invite_appointment_participant", {
        _appointment_id: data.appointmentId,
        _email: data.email,
        _user_id: data.userId,
      });
      if (error) {
        if (missing(error.message)) return { available: false, linkedAccount: false, emailSent: false };
        throw new Error(error.message);
      }
      const out = res as { linked_account: boolean };

      // البريد الخارجي يمر بطبقة البريد الرسمية وحدها — بلا مزوّد مكرر.
      let emailSent = false;
      if (!out.linked_account && data.email) {
        const apiKey = (process.env['RESEND_API_KEY'] ?? "").trim();
        const from = (process.env['PLATFORM_EMAIL_FROM'] ?? "").trim();
        if (apiKey && from) {
          try {
            const { getRequest } = await import("@tanstack/react-start/server");
            const origin = new URL(getRequest().url).origin;
            const res2 = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
              body: JSON.stringify({
                from,
                to: data.email,
                subject: "دعوة اجتماع في ركيز",
                text:
                  `لديك دعوة اجتماع في منصة ركيز.\n` +
                  `سجّل الدخول أو أنشئ حسابًا بالبريد نفسه ثم اقبل الدعوة من صفحة المواعيد:\n${origin}/appointments\n` +
                  `لا تُعرض تفاصيل الاجتماع قبل تسجيل الدخول وقبول الدعوة.`,
              }),
            });
            emailSent = res2.ok;
          } catch {
            emailSent = false;
          }
        }
      }
      return { available: true, linkedAccount: out.linked_account, emailSent };
    },
  );

export const respondAppointmentInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ inviteId: uuid, accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ available: boolean }> => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { error } = await rpc("respond_appointment_invite", {
      _invite_id: data.inviteId,
      _accept: data.accept,
    });
    if (error) {
      if (missing(error.message)) return { available: false };
      throw new Error(error.message);
    }
    return { available: true };
  });

export type MyInvite = {
  id: string;
  appointment_id: string;
  title: string;
  starts_at: string;
  status: string;
};

export const listMyAppointmentInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyInvite[]> => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data, error } = await rpc("list_my_appointment_invites");
    if (error) {
      if (missing(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as MyInvite[];
  });

export const getMeetingAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ appointmentId: uuid }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ available: boolean; isMeeting: boolean; canJoin: boolean }> => {
      const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
      const { data: res, error } = await rpc("appointment_meeting_access", {
        _appointment_id: data.appointmentId,
      });
      if (error) {
        if (missing(error.message)) return { available: false, isMeeting: false, canJoin: false };
        throw new Error(error.message);
      }
      const out = res as { is_meeting: boolean; can_join: boolean };
      return { available: true, isMeeting: out.is_meeting, canJoin: out.can_join };
    },
  );

/** تحقق عام بالمرجع والتاريخ — بلا أي بيانات أطراف. */
export const verifyAppointmentReference = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        reference: z.string().trim().regex(/^[0-9]{6,}$/),
        date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ available: boolean; found: boolean; status?: string; kind?: string; date?: string }> => {
      const { createClient } = await import("@supabase/supabase-js");
      const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
      const client = createClient(process.env['SUPABASE_URL']!, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
              h.delete("Authorization");
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
      });
      const { data: res, error } = await (client as unknown as { rpc: Rpc }).rpc(
        "verify_appointment_reference",
        { _reference: data.reference, _date: data.date },
      );
      if (error) {
        if (missing(error.message)) return { available: false, found: false };
        throw new Error(error.message);
      }
      const out = res as { found: boolean; status?: string; kind?: string; date?: string };
      return { available: true, ...out };
    },
  );
