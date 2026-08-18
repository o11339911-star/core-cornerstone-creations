import type { PlatformMe } from "@/lib/platform-admin.functions";

/**
 * Phase 20A — طبقة واحدة لصلاحيات إدارة المنصة في الواجهة.
 *
 * مصدر الحقيقة هو `public.platform_me()` (SECURITY DEFINER) الذي يُرجع
 * `is_admin` من `platform_admins` و`is_staff` من `platform_staff` النشط.
 * الخريطة أدناه مطابقة حرفيًا لـ `private.platform_can` في قاعدة البيانات،
 * وتُستخدم لإخفاء الأزرار فقط — الحد الأمني يبقى في RPC/RLS.
 */

/** الأفعال المعرّفة في `private.platform_can`. */
export type PlatformAction =
  | "queue.view"
  | "queue.claim"
  | "queue.assign"
  | "queue.reassign"
  | "queue.resolve"
  | "staff.manage"
  | "case.grant"
  | "breakglass.request"
  | "breakglass.approve"
  | "directory.view"
  | "audit.view";

/** The authenticated server response is the only authority for platform access. */
export function hasPlatformAccess(platform: PlatformMe | null | undefined): boolean {
  return platform?.is_admin === true || platform?.is_staff === true;
}

/** مدير المنصة الكامل: عضو `platform_admins` أو موظف نشط بدور superadmin. */
export function isPlatformSuperadmin(platform: PlatformMe | null | undefined): boolean {
  if (!platform) return false;
  if (platform.is_admin === true) return true;
  return platform.is_staff === true && platform.role === "superadmin";
}

/**
 * Fail-closed: أي حالة غير معروفة أو غياب النتيجة يعني «ممنوع».
 * مطابقة لـ `private.platform_can(_user_id, _action)`.
 */
export function platformCan(
  platform: PlatformMe | null | undefined,
  action: PlatformAction,
): boolean {
  if (!hasPlatformAccess(platform)) return false;
  if (isPlatformSuperadmin(platform)) return true;

  const role = platform?.role ?? null;
  if (!role) return false;

  switch (action) {
    case "queue.view":
    case "queue.resolve":
    case "breakglass.request":
      return true;
    case "queue.claim":
      return ["reviewer", "support", "compliance"].includes(role);
    case "queue.assign":
    case "case.grant":
      return ["reviewer", "compliance"].includes(role);
    case "queue.reassign":
    case "staff.manage":
    case "breakglass.approve":
    case "directory.view":
    case "audit.view":
      return false;
    default:
      return false;
  }
}

export const PLATFORM_HOME = "/platform/queue";
