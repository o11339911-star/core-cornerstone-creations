import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * تحقق عام من ملف صادر من أرشيف ركيز.
 * لا يتطلب تسجيل دخول، ويُرجع الحد الأدنى فقط: الحالة واسم الملف والجهة
 * المصدرة والمرجع وتاريخ الإصدار والبصمة المختصرة. لا محتوى ولا هوية ولا
 * سجلات ولا بيانات مشروع ولا معرّف كيان.
 */

export type ArchiveVerifyResult =
  | { found: false }
  | {
      found: true;
      status: "valid" | "revoked";
      file_name: string;
      issuer: string;
      reference: string;
      issued_at: string;
      fingerprint: string;
    };

const REFERENCE = /^RKZ-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const DATE = /^\d{4}\/\d{2}\/\d{2}$/;

export const verifyArchiveFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        reference: z
          .string()
          .trim()
          .max(24)
          .transform((v) => v.toUpperCase().replace(/\s+/g, "")),
        date: z.string().trim().max(10),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ArchiveVerifyResult> => {
    if (!REFERENCE.test(data.reference) || !DATE.test(data.date)) return { found: false };

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const { data: res, error } = await supabase.rpc("verify_archive_file", {
      p_reference: data.reference,
      p_issued_on: data.date.replace(/\//g, "-"),
    });
    if (error) return { found: false };
    return (res ?? { found: false }) as ArchiveVerifyResult;
  });
