/**
 * تخزين جلسة Supabase على هذا الجهاز.
 *
 * - "حفظ الجلسة" مفعّل (الافتراضي): الجلسة في localStorage فتبقى بعد إعادة
 *   التحميل وبعد إغلاق المتصفح وفتحه، ويتولى Supabase تجديد الرمز تلقائيًا.
 * - عند إلغائه: الجلسة في sessionStorage فقط، فتنتهي بإغلاق التبويب.
 *
 * لا تُخزَّن كلمة المرور ولا يُسجَّل أي رمز في سجلات أو روابط.
 */

export const SESSION_PERSIST_KEY = "rakeez.session-persist";

export function isSessionPersistEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SESSION_PERSIST_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSessionPersist(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_PERSIST_KEY, enabled ? "1" : "0");
  } catch {
    /* التخزين محجوب: تبقى الجلسة في الذاكرة فقط */
  }
}

/** محوّل تخزين واحد يتنقّل بين localStorage وsessionStorage دون فقد الجلسة. */
export const rakeezAuthStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
      if (isSessionPersistEnabled()) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      }
    } catch {
      /* تجاهل: لا نُخرج المستخدم بسبب تخزين محجوب */
    }
  },
  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      /* تجاهل */
    }
  },
};
