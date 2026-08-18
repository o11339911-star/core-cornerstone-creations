import { describe, expect, it } from "vitest";

import {
  ISO_DATETIME_LOCAL_RE,
  ISO_DATE_RE,
  formatLatinDate,
  hasNonLatinDigits,
  pad2,
} from "./latin-date-picker";

const NON_LATIN = /[\u0660-\u0669\u06F0-\u06F9]/;

describe("latin date helpers", () => {
  it("يرفض الأرقام العربية-الهندية والفارسية ويقبل اللاتينية", () => {
    expect(hasNonLatinDigits("١٤٤٧")).toBe(true);
    expect(hasNonLatinDigits("۱۴۴۷")).toBe(true);
    expect(hasNonLatinDigits("2026-08-18")).toBe(false);
  });

  it("لا ينتج تنسيق العرض أي رقم غير لاتيني", () => {
    const out = formatLatinDate("2026-08-18");
    expect(out).toContain("18");
    expect(out).toContain("2026");
    expect(out).toContain("أغسطس");
    expect(NON_LATIN.test(out)).toBe(false);
  });

  it("يبني خانتين بأرقام ASCII", () => {
    expect(pad2(7)).toBe("07");
    expect(pad2(23)).toBe("23");
    expect(NON_LATIN.test(pad2(9))).toBe(false);
  });

  it("تقبل التعابير القياسية صيغة ISO الميلادية فقط", () => {
    expect(ISO_DATE_RE.test("2026-08-18")).toBe(true);
    expect(ISO_DATE_RE.test("٢٠٢٦-٠٨-١٨")).toBe(false);
    expect(ISO_DATETIME_LOCAL_RE.test("2026-08-18T09:30")).toBe(true);
    expect(ISO_DATETIME_LOCAL_RE.test("2026-08-18 09:30")).toBe(false);
  });

  it("لا يحدث انزياح يوم عند بناء القيمة المحلية", () => {
    const value = `2026-01-01T00:15`;
    expect(value.slice(0, 10)).toBe("2026-01-01");
    expect(value.slice(11)).toBe("00:15");
  });
});
