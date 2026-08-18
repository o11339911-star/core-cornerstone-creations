/**
 * حل هوية «كيان مقدّم الخدمة» من رقم مكوّن من 10 أرقام لاتينية (سجل تجاري أو
 * رقم وطني موحّد) دون كشف معرّف الكيان للعميل.
 *
 * الواجهة لا تستلم UUID إطلاقًا: تستلم الاسم المعروض فقط، بينما يبقى المعرّف
 * داخل الخادم ويُمرَّر مباشرة إلى دالة قاعدة البيانات التي تفرض العضوية وRLS.
 */

import { allowAttempt } from "@/lib/auth-identity.server";
import { subjectHmac } from "@/lib/subject-hash.server";

export type ProviderResolution =
  | { status: "invalid" }
  | { status: "throttled" }
  | { status: "unregistered" }
  | { status: "found"; entityId: string; displayName: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function resolveProviderEntity(input: {
  digits: string;
  actorUserId: string;
}): Promise<ProviderResolution> {
  const digits = input.digits.trim();
  if (!/^[0-9]{10}$/.test(digits)) return { status: "invalid" };

  let actorKey: string;
  try {
    actorKey = subjectHmac(`actor|${input.actorUserId}`).slice(0, 24);
  } catch {
    return { status: "invalid" };
  }
  // نفس ميزانية المحاولات لكل فاعل: تمنع التعداد الجماعي للأرقام.
  const allowed = await allowAttempt(`appointment-provider:${actorKey}`, 30, 600);
  if (!allowed) return { status: "throttled" };

  const client = await admin();
  const { data: rows } = await client
    .from("entity_profiles")
    .select("entity_id, legal_name_ar, legal_name_en")
    .or(`cr_number.eq.${digits},unified_national_number.eq.${digits}`)
    .limit(2);

  const matches = rows ?? [];
  if (matches.length === 0) return { status: "unregistered" };
  const ids = new Set(matches.map((r) => r.entity_id as string));
  // تطابق متعدد غير محسوم: لا نختار عشوائيًا ولا نكشف أي كيان.
  if (ids.size !== 1) return { status: "invalid" };

  const row = matches[0]!;
  let name = (row.legal_name_ar as string | null) ?? (row.legal_name_en as string | null) ?? null;
  if (!name) {
    const { data: entity } = await client
      .from("entities")
      .select("name")
      .eq("id", row.entity_id as string)
      .maybeSingle();
    name = (entity?.name as string | null) ?? null;
  }
  if (!name) return { status: "unregistered" };

  return { status: "found", entityId: row.entity_id as string, displayName: name };
}
