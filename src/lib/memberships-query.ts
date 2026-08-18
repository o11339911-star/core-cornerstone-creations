import { getMyMemberships, type MembershipRow } from "@/lib/auth.functions";

/**
 * غلاف آمن حول `getMyMemberships()`.
 *
 * وسيط المصادقة يرمي `Response` خامًا عند انتهاء الجلسة (401)، وهو ما يصل إلى
 * حدود الخطأ في React كـ `[object Response]` فيظهر للمستخدم شاشة بيضاء.
 * هنا نترجمه: 401 → إعادة توجيه إلى صفحة الدخول، وأي خطأ آخر → رسالة عربية.
 */
export async function fetchMyMemberships(): Promise<MembershipRow[]> {
  try {
    return await getMyMemberships();
  } catch (error) {
    if (error instanceof Response) {
      if (error.status === 401 || error.status === 403) {
        if (typeof window !== "undefined") {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.replace(`/auth?next=${next}`);
        }
        return [];
      }
      throw new Error("تعذّر تحميل حساباتك. حاول مرة أخرى.");
    }
    throw error instanceof Error ? error : new Error("تعذّر تحميل حساباتك. حاول مرة أخرى.");
  }
}
