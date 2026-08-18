import type { PlatformMe } from "@/lib/platform-admin.functions";

/** The authenticated server response is the only authority for platform access. */
export function hasPlatformAccess(platform: PlatformMe | null | undefined): boolean {
  return platform?.is_admin === true || platform?.is_staff === true;
}

export const PLATFORM_HOME = "/platform/queue";