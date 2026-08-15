import * as React from "react";

import {
  BLOCK_TYPES,
  COMPLIANCE_VALUES,
  FIELD_SOURCES,
  SEVERITY_VALUES,
  emptyBlock,
  resolveField,
  type BlockType,
  type ReportBlock,
  type ReportContent,
} from "@/lib/reports/blocks";
import { TextAreaField, TextField } from "@/components/rakeez/form-field";

const BLOCK_LABEL: Record<BlockType, string> = {
  heading: "عنوان",
  paragraph: "فقرة",
  list: "قائمة",
  table: "جدول",
  image: "صورة",
  before_after: "قبل / بعد",
  comment: "تعليق",
  page_break: "فاصل صفحة",
  field: "حقل تلقائي",
  engineering_item: "بند هندسي",
};

const COMPLIANCE_LABEL: Record<string, string> = {
  compliant: "مطابق",
  non_compliant: "غير مطابق",
  not_applicable: "غير منطبق",
};
const SEVERITY_LABEL: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};

export type ReportEditorProps = {
  content: ReportContent;
  snapshot: unknown;
  readOnly?: boolean;
  onChange: (content: ReportContent) => void;
};

export function ReportEditor({ content, snapshot, readOnly = false, onChange }: ReportEditorProps) {
  const blocks = content.blocks;

  const update = (index: number, next: ReportBlock) => {
    const copy = blocks.slice();
    copy[index] = next;
    onChange({ ...content, blocks: copy });
  };
  const remove = (index: number) => {
    onChange({ ...content, blocks: blocks.filter((_, i) => i !== index) });
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const copy = blocks.slice();
    const [item] = copy.splice(index, 1);
    if (item) copy.splice(target, 0, item);
    onChange({ ...content, blocks: copy });
  };
  const add = (type: BlockType) => {
    onChange({ ...content, blocks: [...blocks, emptyBlock(type)] });
  };

  return (
    <div className="space-y-4">
      {!readOnly ? (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/40 p-3">
          {BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add(type)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              + {BLOCK_LABEL[type]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[794px] space-y-3 rounded-lg border border-border bg-card p-8 shadow-sm">
        {content.header ? (
          <p className="border-b border-dashed border-border pb-2 text-xs text-muted-foreground">
            {content.header}
          </p>
        ) : null}

        {blocks.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            لا توجد كتل بعد — أضف عنوانًا أو فقرة للبدء.
          </p>
        ) : null}

        {blocks.map((block, index) => (
          <div key={block.id} className="group rounded-md border border-transparent p-2 hover:border-border">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">{BLOCK_LABEL[block.type]}</span>
              {!readOnly ? (
                <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" className="px-1 text-xs text-muted-foreground" onClick={() => move(index, -1)}>
                    ▲
                  </button>
                  <button type="button" className="px-1 text-xs text-muted-foreground" onClick={() => move(index, 1)}>
                    ▼
                  </button>
                  <button type="button" className="px-1 text-xs text-destructive" onClick={() => remove(index)}>
                    ✕
                  </button>
                </span>
              ) : null}
            </div>
            <BlockEditor
              block={block}
              snapshot={snapshot}
              readOnly={readOnly}
              onChange={(next) => update(index, next)}
            />
          </div>
        ))}

        {content.footer ? (
          <p className="border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
            {content.footer}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  snapshot,
  readOnly,
  onChange,
}: {
  block: ReportBlock;
  snapshot: unknown;
  readOnly: boolean;
  onChange: (next: ReportBlock) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex items-center gap-2">
          {!readOnly ? (
            <select
              value={block.level}
              onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          ) : null}
          {readOnly ? (
            <p className={block.level === 1 ? "text-2xl font-bold" : block.level === 2 ? "text-xl font-semibold" : "text-lg font-semibold"}>
              {block.text}
            </p>
          ) : (
            <input
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              placeholder="نص العنوان"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-base font-semibold"
            />
          )}
        </div>
      );
    case "paragraph":
      return readOnly ? (
        <p className="whitespace-pre-wrap text-sm leading-7">{block.text}</p>
      ) : (
        <TextAreaField
          label=""
          value={block.text}
          rows={4}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      );
    case "list":
      return (
        <div className="space-y-2">
          {!readOnly ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={block.ordered}
                onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
              />
              قائمة مرقّمة
            </label>
          ) : null}
          {block.items.map((item, i) => (
            <div key={`${block.id}-${i}`} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{block.ordered ? `${i + 1}.` : "•"}</span>
              {readOnly ? (
                <span className="text-sm">{item}</span>
              ) : (
                <input
                  value={item}
                  onChange={(e) => {
                    const items = block.items.slice();
                    items[i] = e.target.value;
                    onChange({ ...block, items });
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              )}
            </div>
          ))}
          {!readOnly ? (
            <button
              type="button"
              className="text-xs text-primary"
              onClick={() => onChange({ ...block, items: [...block.items, ""] })}
            >
              + عنصر
            </button>
          ) : null}
        </div>
      );
    case "table":
      return (
        <div className="space-y-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.header.map((cell, c) => (
                  <th key={`h-${c}`} className="border border-border bg-muted/50 p-1 text-start">
                    {readOnly ? (
                      cell
                    ) : (
                      <input
                        value={cell}
                        onChange={(e) => {
                          const header = block.header.slice();
                          header[c] = e.target.value;
                          onChange({ ...block, header });
                        }}
                        className="w-full bg-transparent px-1 text-sm font-semibold outline-none"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={`r-${r}`}>
                  {block.header.map((_, c) => (
                    <td key={`c-${r}-${c}`} className="border border-border p-1">
                      {readOnly ? (
                        (row[c] ?? "")
                      ) : (
                        <input
                          value={row[c] ?? ""}
                          onChange={(e) => {
                            const rows = block.rows.map((x) => x.slice());
                            const target = rows[r] ?? [];
                            target[c] = e.target.value;
                            rows[r] = target;
                            onChange({ ...block, rows });
                          }}
                          className="w-full bg-transparent px-1 text-sm outline-none"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly ? (
            <div className="flex gap-3 text-xs text-primary">
              <button
                type="button"
                onClick={() =>
                  onChange({ ...block, rows: [...block.rows, block.header.map(() => "")] })
                }
              >
                + صف
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...block,
                    header: [...block.header, ""],
                    rows: block.rows.map((r) => [...r, ""]),
                  })
                }
              >
                + عمود
              </button>
            </div>
          ) : null}
        </div>
      );
    case "image":
      return (
        <div className="space-y-2">
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
            {block.storagePath ? `صورة: ${block.storagePath}` : "لم تُرفق صورة بعد"}
          </div>
          {!readOnly ? (
            <TextField
              label="وصف الصورة"
              value={block.caption ?? ""}
              onChange={(e) => onChange({ ...block, caption: e.target.value })}
            />
          ) : block.caption ? (
            <p className="text-xs text-muted-foreground">{block.caption}</p>
          ) : null}
        </div>
      );
    case "before_after":
      return (
        <div className="grid grid-cols-2 gap-3">
          {(["before", "after"] as const).map((side) => (
            <div key={side} className="space-y-1">
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-5 text-center text-xs text-muted-foreground">
                {side === "before" ? "قبل" : "بعد"}
              </div>
              {!readOnly ? (
                <TextField
                  label=""
                  value={(side === "before" ? block.beforeCaption : block.afterCaption) ?? ""}
                  onChange={(e) =>
                    onChange(
                      side === "before"
                        ? { ...block, beforeCaption: e.target.value }
                        : { ...block, afterCaption: e.target.value },
                    )
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      );
    case "comment":
      return (
        <div className="rounded-md border-s-4 border-s-primary bg-muted/30 p-3">
          {readOnly ? (
            <p className="text-sm">{block.text}</p>
          ) : (
            <TextAreaField
              label="تعليق"
              rows={3}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          )}
        </div>
      );
    case "page_break":
      return <div className="my-2 border-t-2 border-dashed border-border text-center text-[11px] text-muted-foreground">— فاصل صفحة —</div>;
    case "field":
      return (
        <div className="flex items-center gap-3">
          {!readOnly ? (
            <select
              value={block.source}
              onChange={(e) => onChange({ ...block, source: e.target.value as typeof block.source })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {FIELD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-sm">
            <span className="font-semibold">{block.label ?? block.source}: </span>
            {resolveField(snapshot, block.source)}
          </span>
        </div>
      );
    case "engineering_item":
    default: {
      const item = block;
      return (
        <div className="space-y-2 rounded-md border border-border p-3">
          {readOnly ? (
            <p className="font-semibold">{item.title}</p>
          ) : (
            <TextField
              label="البند"
              value={item.title}
              onChange={(e) => onChange({ ...item, title: e.target.value })}
            />
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              المطابقة
              {readOnly ? (
                <p className="text-sm text-foreground">{COMPLIANCE_LABEL[item.compliance]}</p>
              ) : (
                <select
                  value={item.compliance}
                  onChange={(e) =>
                    onChange({ ...item, compliance: e.target.value as (typeof COMPLIANCE_VALUES)[number] })
                  }
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  {COMPLIANCE_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {COMPLIANCE_LABEL[v]}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="text-xs text-muted-foreground">
              الخطورة
              {readOnly ? (
                <p className="text-sm text-foreground">{SEVERITY_LABEL[item.severity]}</p>
              ) : (
                <select
                  value={item.severity}
                  onChange={(e) =>
                    onChange({ ...item, severity: e.target.value as (typeof SEVERITY_VALUES)[number] })
                  }
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  {SEVERITY_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {SEVERITY_LABEL[v]}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {!readOnly ? (
              <>
                <TextField
                  label="المسؤول"
                  value={item.responsible ?? ""}
                  onChange={(e) => onChange({ ...item, responsible: e.target.value })}
                />
                <TextField
                  label="تاريخ الاستحقاق"
                  type="date"
                  value={item.dueDate ?? ""}
                  onChange={(e) => onChange({ ...item, dueDate: e.target.value || null })}
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {item.responsible || "—"} · {item.dueDate || "—"}
              </p>
            )}
          </div>
          {readOnly ? (
            item.note ? (
              <p className="text-sm text-muted-foreground">{item.note}</p>
            ) : null
          ) : (
            <TextAreaField
              label="ملاحظة"
              rows={2}
              value={item.note ?? ""}
              onChange={(e) => onChange({ ...item, note: e.target.value })}
            />
          )}
        </div>
      );
    }
  }
}
