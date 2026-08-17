import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { CounterpartyLookup } from "@/lib/deal-lookup.server";

/**
 * بحث تلقائي عن الطرف الثاني عند اكتمال رقم صحيح. لا يُرجع بريدًا ولا معرّف
 * مستخدم/كيان، والربط الفعلي يُعاد التحقق منه داخل create_contracting_deal.
 */
export const lookupDealCounterpartyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partyKind: z.enum(["person", "entity"]),
        identifier: z.string().trim().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { normalizeNationalId } = await import("@/lib/identity-format");
    const { lookupDealCounterparty } = await import("@/lib/deal-lookup.server");
    return lookupDealCounterparty({
      partyKind: data.partyKind,
      digits: normalizeNationalId(data.identifier),
      actorUserId: context.userId,
    });
  });
