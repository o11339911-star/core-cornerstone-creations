import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ENTITY_TYPES } from "@/lib/entities.functions";

/**
 * Mandatory registration completion gate.
 *
 * The state is derived server-side from the source of truth
 * (`private.personal_identity_links` + `entity_memberships`/`entity_profiles`);
 * there is no manipulable flag on `profiles`. Platform admins and active
 * platform staff bypass the gate so operational accounts can never lock
 * themselves out.
 */

export const registrationStateSchema = z.object({
  bypass: z.boolean(),
  identity_complete: z.boolean(),
  entity_complete: z.boolean(),
  complete: z.boolean(),
  current_step: z.enum(["identity", "entity", "complete"]),
});
export type RegistrationState = z.infer<typeof registrationStateSchema>;

/** Commercial legal forms accepted during registration. */
export const REGISTRATION_LEGAL_FORMS = ["company", "establishment", "partnership"] as const;

function mapError(message: string): string {
  if (message.includes("IDENTITY_REQUIRED")) return "IDENTITY_REQUIRED";
  if (message.includes("OFFICIAL_ID_ALREADY_REGISTERED")) return "OFFICIAL_ID_ALREADY_REGISTERED";
  if (message.includes("INVALID_UNIFIED_NUMBER")) return "INVALID_UNIFIED_NUMBER";
  if (message.includes("INVALID_LEGAL_FORM")) return "INVALID_INPUT";
  if (message.includes("INVALID_TYPE")) return "INVALID_INPUT";
  if (message.includes("ENTITY_LIMIT_REACHED")) return "ENTITY_LIMIT_REACHED";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  if (message.includes("duplicate key")) return "OFFICIAL_ID_ALREADY_REGISTERED";
  return "UNKNOWN";
}

export const getRegistrationState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RegistrationState> => {
    const { data, error } = await context.supabase.rpc("get_registration_completion_state");
    if (error) throw new Error(mapError(error.message));
    return registrationStateSchema.parse(data);
  });

export const completeRegistrationEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(160),
        type: z.enum(ENTITY_TYPES),
        legalForm: z.enum(REGISTRATION_LEGAL_FORMS),
        unifiedNationalNumber: z.string().trim().regex(/^7[0-9]{9}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ entityId: string }> => {
    const { data: entityId, error } = await context.supabase.rpc("complete_registration_entity", {
      _name: data.name,
      _type: data.type,
      _legal_form: data.legalForm,
      _unified_national_number: data.unifiedNationalNumber,
    });
    if (error) throw new Error(mapError(error.message));
    return { entityId: entityId as string };
  });
