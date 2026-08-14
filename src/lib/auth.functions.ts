import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Thin server wrappers around authenticated Supabase reads.
 * All writes that grant or alter roles/entity membership are intentionally
 * server-only and will be added in the invitation-management phase.
 */

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

const profileColumns = "id, full_name, avatar_url, locale, phone, created_at, updated_at";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(profileColumns)
      .eq("id", context.userId)
      .single();

    if (error) throw error;
    return data as Profile;
  });

export const membershipRowSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["owner", "admin", "manager", "member", "viewer"]),
  status: z.enum(["active", "suspended", "revoked"]),
  expires_at: z.string().datetime().nullable(),
  entity: z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.string(),
    status: z.enum(["active", "suspended", "closed"]),
  }),
});

export type MembershipRow = z.infer<typeof membershipRowSchema>;

export const getMyMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date().toISOString();

    const { data, error } = await context.supabase
      .from("entity_memberships")
      .select(
        `
        id,
        role,
        status,
        expires_at,
        entity:entities!inner(id, name, type, status)
      `,
      )
      .eq("user_id", context.userId)
      .eq("status", "active")
      .eq("entities.status", "active")
      .is("entities.deleted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (error) throw error;
    return membershipRowSchema.array().parse(data ?? []);
  });
