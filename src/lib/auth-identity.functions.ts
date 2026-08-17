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
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { signUpWithIdentity } = await import("@/lib/auth-identity.server");
    const { PRODUCTION_ORIGIN } = await import("@/lib/auth-origin");
    // الوجهة تُشتق خادميًا فقط؛ لا يقبل الخادم أي origin من المتصفح.
    return signUpWithIdentity({
      ...data,
      redirectTo: `${PRODUCTION_ORIGIN}/auth/callback`,
    });
  });

/**
 * استعادة كلمة المرور بالبريد أو رقم الهوية. الاستجابة موحّدة دائمًا ولا تكشف
 * وجود الحساب ولا البريد المرتبط؛ التحديد والإرسال يتمّان داخل الخادم فقط.
 */
export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(160),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requestPasswordReset } = await import("@/lib/password-reset.server");
    const { subjectHmac } = await import("@/lib/subject-hash.server");
    const { getRequestIP, getRequestHeader } = await import("@tanstack/react-start/server");

    // بصمة عميل خشنة بـHMAC خادمي فقط — لا يُخزَّن IP ولا user-agent ولا SHA خام.
    let clientKey = "";
    try {
      const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
      const ua = getRequestHeader("user-agent") ?? "";
      clientKey = subjectHmac(`client|${ip}|${ua}`);
    } catch {
      /* بيئات بلا سياق طلب أو بلا مفتاح خادمي */
    }

    // الوجهة تُشتق داخل الخادم من PRODUCTION_ORIGIN فقط.
    return requestPasswordReset(data.identifier, clientKey);
  });
