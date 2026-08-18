import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * العنوان الوطني للفرد.
 *
 * الحفظ يمر عبر دالة قاعدة البيانات `set_person_address` التي تكتب على صف
 * المستخدم الحالي فقط (auth.uid)، فلا يستطيع أي طرف تعديل عنوان غيره.
 * الأرقام لاتينية 0-9 حصرًا، والحفظ ذرّي ثم تُقرأ القيم المحفوظة فعلًا.
 */

export type PersonAddress = {
  building_no: string | null;
  street: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  additional_no: string | null;
  unit_no: string | null;
};

const digits = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[0-9]*$/, "DIGITS_ONLY")
    .default("");

export const getMyAddress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersonAddress> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("building_no, street, district, city, postal_code, additional_no, unit_no")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    return data as PersonAddress;
  });

export const setMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        buildingNo: digits(4),
        street: z.string().trim().max(120).default(""),
        district: z.string().trim().max(120).default(""),
        city: z.string().trim().max(80).default(""),
        postalCode: digits(5),
        additionalNo: digits(4),
        unitNo: z.string().trim().max(10).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PersonAddress> => {
    const { error } = await context.supabase.rpc("set_person_address", {
      _building_no: data.buildingNo || undefined,
      _street: data.street || undefined,
      _district: data.district || undefined,
      _city: data.city || undefined,
      _postal_code: data.postalCode || undefined,
      _additional_no: data.additionalNo || undefined,
      _unit_no: data.unitNo || undefined,
    });
    if (error) throw new Error(error.message);

    // نعيد القيم المحفوظة فعليًا من القاعدة، لا القيم المرسلة.
    const { data: row, error: readError } = await context.supabase
      .from("profiles")
      .select("building_no, street, district, city, postal_code, additional_no, unit_no")
      .eq("id", context.userId)
      .single();
    if (readError) throw new Error(readError.message);
    return row as PersonAddress;
  });
