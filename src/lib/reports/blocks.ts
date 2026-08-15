import { z } from "zod";

/**
 * Phase 15-A — structured report content.
 * Reports are never stored as raw HTML: every block is validated against
 * this schema on the server before it is written to report_versions.content.
 */

const idSchema = z.string().min(1).max(64);
const alignSchema = z.enum(["start", "center", "end", "justify"]).optional();
const dirSchema = z.enum(["rtl", "ltr"]).optional();

const baseBlock = { id: idSchema, dir: dirSchema };

export const headingBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().max(500),
  align: alignSchema,
});

export const paragraphBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("paragraph"),
  text: z.string().max(8000),
  align: alignSchema,
});

export const listBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("list"),
  ordered: z.boolean().default(false),
  items: z.array(z.string().max(1000)).max(200),
});

export const tableBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("table"),
  caption: z.string().max(300).optional(),
  header: z.array(z.string().max(300)).max(12),
  rows: z.array(z.array(z.string().max(1000)).max(12)).max(300),
});

export const imageBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("image"),
  assetId: z.string().uuid().nullable().optional(),
  storagePath: z.string().max(400).optional(),
  caption: z.string().max(300).optional(),
  widthPercent: z.number().min(10).max(100).default(100),
});

export const beforeAfterBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("before_after"),
  beforeAssetId: z.string().uuid().nullable().optional(),
  afterAssetId: z.string().uuid().nullable().optional(),
  beforePath: z.string().max(400).optional(),
  afterPath: z.string().max(400).optional(),
  beforeCaption: z.string().max(200).optional(),
  afterCaption: z.string().max(200).optional(),
});

export const commentBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("comment"),
  text: z.string().max(2000),
  authorName: z.string().max(200).optional(),
  internal: z.boolean().default(true),
});

export const pageBreakBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("page_break"),
});

/** Auto-filled from the frozen snapshot — never typed by hand. */
export const FIELD_SOURCES = [
  "entity.name",
  "entity.cr_number",
  "entity.logo_path",
  "license.license_number",
  "license.expires_on",
  "project.name",
  "project.code",
  "project.city",
  "stage.name_ar",
  "stage.name_en",
  "visit.visit_start",
  "property.name",
  "property.plan_no",
  "property.parcel_no",
  "property.land_area",
  "deed.deed_number",
  "building_license.license_number",
  "contract.contract_number",
  "owners",
  "parties",
] as const;

export const fieldBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("field"),
  source: z.enum(FIELD_SOURCES),
  label: z.string().max(200).optional(),
});

export const COMPLIANCE_VALUES = ["compliant", "non_compliant", "not_applicable"] as const;
export const SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

export const engineeringItemBlockSchema = z.object({
  ...baseBlock,
  type: z.literal("engineering_item"),
  title: z.string().max(500),
  compliance: z.enum(COMPLIANCE_VALUES),
  severity: z.enum(SEVERITY_VALUES),
  responsible: z.string().max(200).optional().default(""),
  dueDate: z.string().max(40).nullable().optional(),
  note: z.string().max(2000).optional().default(""),
  undertaking: z.string().max(2000).optional(),
  approved: z.boolean().optional(),
});

export const reportBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  imageBlockSchema,
  beforeAfterBlockSchema,
  commentBlockSchema,
  pageBreakBlockSchema,
  fieldBlockSchema,
  engineeringItemBlockSchema,
]);

export const reportContentSchema = z.object({
  blocks: z.array(reportBlockSchema).max(1000),
  header: z.string().max(500).optional(),
  footer: z.string().max(500).optional(),
});

export const pageSetupSchema = z.object({
  size: z.literal("A4").default("A4"),
  marginMm: z
    .object({
      top: z.number().min(5).max(50).default(20),
      right: z.number().min(5).max(50).default(18),
      bottom: z.number().min(5).max(50).default(20),
      left: z.number().min(5).max(50).default(18),
    })
    .default({ top: 20, right: 18, bottom: 20, left: 18 }),
  header: z.boolean().default(true),
  footer: z.boolean().default(true),
  pageNumbers: z.boolean().default(true),
});

export type ReportBlock = z.infer<typeof reportBlockSchema>;
export type ReportContent = z.infer<typeof reportContentSchema>;
export type PageSetup = z.infer<typeof pageSetupSchema>;
export type BlockType = ReportBlock["type"];

export const BLOCK_TYPES: BlockType[] = [
  "heading",
  "paragraph",
  "list",
  "table",
  "image",
  "before_after",
  "comment",
  "page_break",
  "field",
  "engineering_item",
];

export function newBlockId() {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyBlock(type: BlockType): ReportBlock {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "" };
    case "paragraph":
      return { id, type, text: "" };
    case "list":
      return { id, type, ordered: false, items: [""] };
    case "table":
      return { id, type, header: ["", ""], rows: [["", ""]] };
    case "image":
      return { id, type, widthPercent: 100 };
    case "before_after":
      return { id, type };
    case "comment":
      return { id, type, text: "", internal: true };
    case "page_break":
      return { id, type };
    case "field":
      return { id, type, source: "project.name" };
    case "engineering_item":
    default:
      return {
        id,
        type: "engineering_item",
        title: "",
        compliance: "compliant",
        severity: "low",
        responsible: "",
        dueDate: null,
        note: "",
      };
  }
}

/** Resolve a `field` block against the frozen snapshot. */
export function resolveField(snapshot: unknown, source: string): string {
  if (!snapshot || typeof snapshot !== "object") return "—";
  if (source === "owners") {
    const owners = (snapshot as Record<string, unknown>)["owners"];
    if (!Array.isArray(owners) || owners.length === 0) return "—";
    return owners
      .map((o) => {
        const row = o as Record<string, unknown>;
        return `${String(row["owner_name"] ?? "")} (${String(row["share_percent"] ?? "")}%)`;
      })
      .join(" · ");
  }
  if (source === "parties") {
    const parties = (snapshot as Record<string, unknown>)["parties"];
    if (!Array.isArray(parties) || parties.length === 0) return "—";
    return parties
      .map((p) => {
        const row = p as Record<string, unknown>;
        return `${String(row["entity_name"] ?? "")} — ${String(row["role"] ?? "")}`;
      })
      .join(" · ");
  }
  const value = source
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      snapshot,
    );
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
