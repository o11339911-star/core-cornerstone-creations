import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * «شبكة التواصل» — دليل علاقات واتصال للأفراد والكيانات.
 *
 * قاعدتان أمنيتان لا تُخرقان:
 * 1) جهة الاتصال الخاصة دفتر شخصي بحت، لا تمنح أي وصول داخل المنصة.
 * 2) معرفة رقم الهوية/السجل لا تكشف بريدًا ولا جوالًا: الكشف يحدث فقط بعد
 *    قبول صريح من الطرف المستقبل وبحسب ما سمح بمشاركته.
 *
 * الجداول والدوال المطلوبة مطبَّقة على القاعدة (2026-08-18).
 */

const uuid = z.string().uuid();

/** العميل غير مُولَّد الأنواع لهذه الجداول بعد؛ الأنواع تُشتق من مخططات Zod أدناه. */
type Db = SupabaseClient;
const db = (client: unknown) => client as Db;

export type NetworkContact = {
  id: string;
  full_name: string;
  organization: string | null;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  activity: string | null;
  address: string | null;
  notes: string | null;
  suggested_entity_id: string | null;
  linked_entity_id: string | null;
  created_at: string;
};

export type NetworkLink = {
  id: string;
  reference: string | null;
  status: "pending" | "accepted" | "rejected" | "revoked";
  message: string | null;
  created_at: string;
  outgoing: boolean;
  counterpart_name: string | null;
  share_email: boolean;
  share_phone: boolean;
  share_internal_call: boolean;
  email: string | null;
  phone: string | null;
};

export type NetworkSearchHit = {
  kind: "entity" | "user";
  id: string;
  name: string | null;
  activity: string | null;
};

const CONTACT_COLS =
  "id, full_name, organization, role_title, email, phone, activity, address, notes, suggested_entity_id, linked_entity_id, created_at";

export const listNetworkContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ available: boolean; contacts: NetworkContact[] }> => {
    const { data, error } = await db(context.supabase)
      .from("network_contacts")
      .select(CONTACT_COLS)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      throw new Error(error.message);
    }
    return { available: true, contacts: (data ?? []) as NetworkContact[] };
  });

const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9]{9,15}$/;

export const saveNetworkContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.nullable().default(null),
        ownerEntityId: uuid.nullable().default(null),
        fullName: z.string().trim().min(2).max(160),
        organization: optionalText(160),
        roleTitle: optionalText(120),
        email: optionalText(200),
        phone: optionalText(30),
        activity: optionalText(160),
        address: optionalText(300),
        notes: optionalText(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ available: boolean; id?: string }> => {
    if (data.email && !EMAIL_RE.test(data.email)) throw new Error("EMAIL_INVALID");
    if (data.phone && !PHONE_RE.test(data.phone.replace(/[\s-]/g, "")))
      throw new Error("PHONE_INVALID");

    const row = {
      owner_user_id: context.userId,
      owner_entity_id: data.ownerEntityId,
      full_name: data.fullName,
      organization: data.organization,
      role_title: data.roleTitle,
      email: data.email,
      phone: data.phone,
      activity: data.activity,
      address: data.address,
      notes: data.notes,
    };

    const query = data.id
      ? db(context.supabase)
          .from("network_contacts")
          .update(row)
          .eq("id", data.id)
          .select("id")
          .single()
      : db(context.supabase).from("network_contacts").insert(row).select("id").single();

    const { data: saved, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    return { available: true, id: (saved as { id: string }).id };
  });

export const deleteNetworkContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ available: boolean }> => {
    const { error } = await db(context.supabase)
      .from("network_contacts")
      .delete()
      .eq("id", data.id);
    if (error) {
      throw new Error(error.message);
    }
    return { available: true };
  });

export const searchNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(3).max(120) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ available: boolean; hits: NetworkSearchHit[] }> => {
    const { data: rows, error } = await db(context.supabase).rpc("network_search", {
      _q: data.query,
    });
    if (error) {
      throw new Error(error.message);
    }
    return { available: true, hits: (rows ?? []) as NetworkSearchHit[] };
  });

export const listNetworkLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ available: boolean; links: NetworkLink[] }> => {
    const { data, error } = await db(context.supabase).rpc("network_list_links");
    if (error) {
      throw new Error(error.message);
    }
    return { available: true, links: (data ?? []) as NetworkLink[] };
  });

export const requestNetworkLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetKind: z.enum(["user", "entity"]),
        targetId: uuid,
        requesterEntityId: uuid.nullable().default(null),
        message: z.string().trim().max(500).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ available: boolean; id?: string }> => {
    const { data: id, error } = await db(context.supabase).rpc("network_request_link", {
      _target_kind: data.targetKind,
      _target_id: data.targetId,
      _requester_entity_id: data.requesterEntityId,
      _message: data.message,
    });
    if (error) {
      throw new Error(error.message);
    }
    return { available: true, id: id as string };
  });

export const respondNetworkLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        linkId: uuid,
        accept: z.boolean(),
        shareEmail: z.boolean().default(false),
        sharePhone: z.boolean().default(false),
        shareInternalCall: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ available: boolean }> => {
    const { error } = await db(context.supabase).rpc("network_respond_link", {
      _link_id: data.linkId,
      _accept: data.accept,
      _share_email: data.shareEmail,
      _share_phone: data.sharePhone,
      _share_internal_call: data.shareInternalCall,
    });
    if (error) {
      throw new Error(error.message);
    }
    return { available: true };
  });

export const revokeNetworkLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ linkId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<{ available: boolean }> => {
    const { error } = await db(context.supabase).rpc("network_revoke_link", {
      _link_id: data.linkId,
    });
    if (error) {
      throw new Error(error.message);
    }
    return { available: true };
  });
