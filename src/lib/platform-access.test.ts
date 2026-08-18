import { describe, expect, it } from "vitest";

import { hasPlatformAccess } from "./platform-access";

describe("hasPlatformAccess", () => {
  it("accepts a platform administrator without an active staff row", () => {
    expect(hasPlatformAccess({ is_admin: true, is_staff: false })).toBe(true);
  });

  it("accepts active platform staff", () => {
    expect(hasPlatformAccess({ is_admin: false, is_staff: true, role: "superadmin" })).toBe(true);
  });

  it("fails closed for ordinary, missing, and malformed states", () => {
    expect(hasPlatformAccess({ is_admin: false, is_staff: false })).toBe(false);
    expect(hasPlatformAccess(undefined)).toBe(false);
    expect(hasPlatformAccess(null)).toBe(false);
  });
});