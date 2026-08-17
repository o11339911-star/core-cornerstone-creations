import { describe, expect, it } from "vitest";

import {
  buildDocxBlob,
  buildXlsxBlob,
  footerLines,
  parseDocx,
  parseXlsx,
  sha256Hex,
} from "./office-files";

const footer = { reference: "RKZ-7M4Q-X9PK-2H6D", fileDate: "2026/08/17" };

async function zipBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("ملفات Office الحقيقية", () => {
  it("ينتج DOCX حقيقيًا (ZIP) قابلًا لإعادة القراءة مع التذييل", async () => {
    const blob = await buildDocxBlob(
      [{ type: "paragraph", text: "عنوان المستند", heading: true }],
      footer,
    );
    const bytes = await zipBytes(blob);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const parsed = parseDocx(bytes);
    expect(parsed.blocks.some((b) => b.type === "paragraph" && b.text.includes("عنوان"))).toBe(
      true,
    );
  });

  it("ينتج XLSX حقيقيًا مع أسطر التذييل في أول ورقة", async () => {
    const blob = buildXlsxBlob(
      [{ name: "Sheet1", cells: [[{ v: "البند", f: null }]] }],
      footer,
    );
    const bytes = await zipBytes(blob);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const parsed = parseXlsx(bytes);
    const flat = parsed.sheets[0]!.cells.flat().map((c) => c.v);
    expect(flat).toContain("ملف صادر من أرشيف ركيز");
    expect(flat.some((v) => v.includes("RKZ-7M4Q-X9PK-2H6D"))).toBe(true);
  });

  it("يبني تذييلًا بأرقام غربية ورابط تحقق", () => {
    const lines = footerLines(footer);
    expect(lines[0]).toBe("ملف صادر من أرشيف ركيز");
    expect(lines.join(" ")).toContain("/verify-file");
    expect(lines.join(" ")).not.toMatch(/[٠-٩]/);
  });

  it("يحسب بصمة SHA-256 بصيغة hex", async () => {
    const hash = await sha256Hex(new Blob(["ركيز"]));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
