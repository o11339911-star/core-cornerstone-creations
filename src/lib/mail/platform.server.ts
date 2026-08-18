/**
 * طبقة بريد المنصة التشغيلية — نقطة الإرسال الوحيدة لرسائل النظام.
 * لا تُستدعى من العميل، ولا تُظهر أي أسماء متغيرات بيئة للمستخدم.
 * إن لم يكن الموفّر معدًّا فلا ندّعي إرسالًا: نُعيد not_configured.
 */

export type PlatformMailResult = { sent: boolean; reason: "sent" | "not_configured" | "failed" };

function config(): { key: string; from: string } | null {
  const key = (process.env['RESEND_API_KEY'] ?? "").trim();
  const from = (process.env['PLATFORM_EMAIL_FROM'] ?? "").trim();
  return key && from ? { key, from } : null;
}

export function platformMailConfigured(): boolean {
  return config() !== null;
}

export async function sendPlatformEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<PlatformMailResult> {
  const cfg = config();
  if (!cfg) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });
    return res.ok ? { sent: true, reason: "sent" } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}
