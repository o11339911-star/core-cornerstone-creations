import { describe, expect, it } from "vitest";

import {
  hasPlatformAccess,
  isPlatformSuperadmin,
  platformCan,
  type PlatformAction,
} from "./platform-access";
import type { PlatformMe } from "./platform-admin.functions";

function me(partial: Partial<PlatformMe>): PlatformMe {
  return {
    is_admin: false,
    is_staff: false,
    role: null,
    availability: null,
    max_concurrent: null,
    ...partial,
  } as PlatformMe;
}

describe("platform access — fail closed", () => {
  it("denies everything without a platform result", () => {
    const actions: PlatformAction[] = [
      "queue.view",
      "staff.manage",
      "audit.view",
      "breakglass.approve",
    ];
    for (const a of actions) {
      expect(platformCan(null, a)).toBe(false);
      expect(platformCan(undefined, a)).toBe(false);
    }
    expect(hasPlatformAccess(null)).toBe(false);
  });

  it("denies a personal account even when a role string leaks in", () => {
    expect(platformCan(me({ role: "superadmin" }), "queue.view")).toBe(false);
    expect(isPlatformSuperadmin(me({ role: "superadmin" }))).toBe(false);
  });

  it("grants everything to a platform admin", () => {
    const admin = me({ is_admin: true });
    expect(isPlatformSuperadmin(admin)).toBe(true);
    expect(platformCan(admin, "staff.manage")).toBe(true);
    expect(platformCan(admin, "audit.view")).toBe(true);
  });

  it("scopes staff roles exactly like private.platform_can", () => {
    const reviewer = me({ is_staff: true, role: "reviewer" });
    expect(platformCan(reviewer, "queue.claim")).toBe(true);
    expect(platformCan(reviewer, "queue.assign")).toBe(true);
    expect(platformCan(reviewer, "queue.reassign")).toBe(false);
    expect(platformCan(reviewer, "staff.manage")).toBe(false);
    expect(platformCan(reviewer, "breakglass.approve")).toBe(false);

    const support = me({ is_staff: true, role: "support" });
    expect(platformCan(support, "queue.claim")).toBe(true);
    expect(platformCan(support, "case.grant")).toBe(false);
    expect(platformCan(support, "directory.view")).toBe(false);

    const inactiveish = me({ is_staff: true, role: null });
    expect(platformCan(inactiveish, "queue.view")).toBe(false);
  });

  it("rejects unknown actions", () => {
    const staff = me({ is_staff: true, role: "reviewer" });
    expect(platformCan(staff, "not.an.action" as PlatformAction)).toBe(false);
  });
});
