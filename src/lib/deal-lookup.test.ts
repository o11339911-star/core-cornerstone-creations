import { describe, expect, it } from "vitest";

import { pickUniqueEntityMatch, type EntityMatchRow } from "@/lib/deal-lookup.server";

const row = (id: string): EntityMatchRow => ({
  entity_id: id,
  legal_name_ar: "منشأة",
  legal_name_en: null,
});

describe("pickUniqueEntityMatch", () => {
  it("returns the single match", () => {
    expect(pickUniqueEntityMatch([row("a")])?.entity_id).toBe("a");
  });

  it("returns null for no match", () => {
    expect(pickUniqueEntityMatch([])).toBeNull();
  });

  it("returns null when two different entities match the same number", () => {
    expect(pickUniqueEntityMatch([row("a"), row("b")])).toBeNull();
  });

  it("accepts duplicate rows of the same entity", () => {
    expect(pickUniqueEntityMatch([row("a"), row("a")])?.entity_id).toBe("a");
  });
});
