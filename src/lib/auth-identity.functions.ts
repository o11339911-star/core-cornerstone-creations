import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const signInWithIdentifierFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(160),
        password: z.string().min(8).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { signInWithIdentifier } = await import("@/lib/auth-identity.server");
    return signInWithIdentifier(data.identifier, data.password);
  });

export const signUpWithIdentityFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(160),
        password: z.string().min(8).max(72),
        fullName: z.string().trim().min(2).max(160),
        phone: z.string().trim().max(20).nullable().default(null),
        nationalId: z.string().trim().min(1).max(40),
        redirectTo: z.string().url().max(300),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { signUpWithIdentity } = await import("@/lib/auth-identity.server");
    const { PRODUCTION_ORIGIN } = await import("@/lib/auth-origin");
    // Only same-app origins may be used as the confirmation destination.
    const allowed = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[a-z0-9-]+\.lovable\.app)(\/|$)/i;
    const redirectTo = allowed.test(data.redirectTo)
      ? data.redirectTo
      : `${PRODUCTION_ORIGIN}/auth/callback`;
    return signUpWithIdentity({ ...data, redirectTo });
  });
