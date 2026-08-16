import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Personal identity linking.
 *
 * The national/iqama number is NEVER stored in a readable column and never
 * echoed back: `link_personal_identity` hashes it with bcrypt inside a
 * SECURITY DEFINER function and keeps only the last four digits.
 * A successful link means "format + checksum validated", NOT government
 * verification — Nafath integration is still a disabled mock.
 */

export const identityStatusSchema = z.object({
  linked: z.boolean(),
  status: z.enum(["pending", "verified", "rejected"]).nullable(),
  last4: z.string().nullable(),
  format_checked_at: z.string().nullable(),
  verified_at: z.string().nullable(),
  provider: z.string().nullable(),
});
export type IdentityStatus = z.infer<typeof identityStatusSchema>;

/** Arabic-Indic / extended Arabic digits are normalised to ASCII server-side. */
function toAsciiDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += char;
  }
  return out.trim();
}

/** Saudi national ID / iqama checksum (Luhn variant over the first 9 digits). */
export function isValidSaudiId(value: string): boolean {
  if (!/^[12][0-9]{9}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const digit = Number(value[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

function mapError(message: string): string {
  if (message.includes("IDENTITY_ALREADY_LINKED")) return "IDENTITY_ALREADY_LINKED";
  if (message.includes("INVALID_NATIONAL_ID")) return "INVALID_NATIONAL_ID";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  return "UNKNOWN";
}

export const getMyIdentityStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IdentityStatus> => {
    const { data, error } = await context.supabase.rpc("get_my_identity_status");
    if (error) throw new Error(mapError(error.message));
    return identityStatusSchema.parse(data);
  });

export const linkPersonalIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ nationalId: z.string().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<IdentityStatus> => {
    const normalized = toAsciiDigits(data.nationalId).replace(/[^0-9]/g, "");
    // Fail fast locally so an obviously invalid value never reaches the database.
    if (!isValidSaudiId(normalized)) throw new Error("INVALID_NATIONAL_ID");

    const { data: row, error } = await context.supabase.rpc("link_personal_identity", {
      _national_id: normalized,
    });
    if (error) throw new Error(mapError(error.message));
    return identityStatusSchema.parse(row);
  });
