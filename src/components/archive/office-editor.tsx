import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveModal } from "@/components/rakeez";
import { supabase } from "@/integrations/supabase/client";
import { addToArchive, getArchiveFileUrl, getArchiveUploadPrefix } from "@/lib/archive.functions";
import {
  DOCX_MIME,
  OfficeUnsupportedError,
  XLSX_MAX_COLS,
  XLSX_MAX_ROWS,
  XLSX_MIME,
  buildDocxBlob,
  buildXlsxBlob,
  colName,
  isSafeFormula,
  parseDocx,
  parseXlsx,
  sanitizeSheetName,
  toAsciiDigits,
  versionedName,
  type DocxBlock,
  type XlsxSheet,
} from "@/lib/office-files";

export type OfficeTarget = {
  id: string;
  title: string;
  storagePath: string;
  kind: "word" | "excel";
  folderId: string | null;
};

// مفاتيح Supabase Storage تقبل ASCII فقط
function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^A-Za-z0-9]+/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

export function OfficeEditor({
  target,
  entityId,
  onClose,
  onSaved,
}: {
  target: OfficeTarget | null;
  entityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const signUrl = useServerFn(getArchiveFileUrl);
  const uploadPrefix = useServerFn(getArchiveUploadPrefix);
  const addItem = useServerFn(addToArchive);

  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [blocks, setBlocks] = React.useState<DocxBlock[]>([]);
  const [sheets, setSheets] = React.useState<XlsxSheet[]>([]);
  const [activeSheet, setActiveSheet] = React.useState(0);
  const [saveName, setSaveName] = React.useState("");

  const load = React.useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setLoadError(null);
    setWarnings([]);
    try {
      const url = await signUrl({ data: { path: target.storagePath } });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`تعذّر تنزيل الملف (${res.status}).`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (target.kind === "word") {
        const model = parseDocx(bytes);
        setBlocks(model.blocks);
        setWarnings(model.warnings);
      } else {
        const model = parseXlsx(bytes);
        setSheets(model.sheets);
        setActiveSheet(0);
        setWarnings(model.warnings);
      }
      setSaveName(versionedName(target.title));
    } catch (e) {
      setLoadError(
        e instanceof OfficeUnsupportedError || e instanceof Error
          ? e.message
          : "تعذّر فتح الملف للتحرير.",
      );
    } finally {
      setLoading(false);
    }
  }, [signUrl, target]);

  React.useEffect(() => {
    if (target) void load();
  }, [target, load]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const blob = target.kind === "word" ? await buildDocxBlob(blocks) : buildXlsxBlob(sheets);
      const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("الملف الناتج غير صالح.");
      const mime = target.kind === "word" ? DOCX_MIME : XLSX_MIME;
      const ext = target.kind === "word" ? ".docx" : ".xlsx";
      const title = saveName.trim().endsWith(ext) ? saveName.trim() : `${saveName.trim()}${ext}`;

      const prefix = await uploadPrefix({ data: { entityId } });
      const path = `${prefix}/${crypto.randomUUID()}-${safeName(title)}`;
      const { error } = await supabase.storage
        .from("archive")
        .upload(path, blob, { contentType: mime, upsert: false });
      if (error) throw new Error(error.message);
      try {
        await addItem({
          data: {
            entityId,
            folderId: target.folderId,
            newFolderName: null,
            title,
            kind: "file",
            sourceTable: null,
            sourceId: null,
            storagePath: path,
            mimeType: mime,
            sizeBytes: blob.size,
            note: `نسخة جديدة من: ${target.title}`,
          },
        });
      } catch (e) {
        await supabase.storage.from("archive").remove([path]);
        throw e;
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ نسخة جديدة في نفس المجلد");
      onSaved();
      onClose();
    },
    onError: (e: unknown) =>
      toast.error("تعذّر حفظ النسخة", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const sheet = sheets[activeSheet];

  const setCell = (r: number, c: number, value: string) => {
    const v = toAsciiDigits(value);
    setSheets((prev) =>
      prev.map((s, si) =>
        si !== activeSheet
          ? s
          : {
              ...s,
              cells: s.cells.map((row, ri) =>
                ri !== r
                  ? row
                  : row.map((cell, ci) =>
                      ci !== c ? cell : { v, f: isSafeFormula(v) ? v : null },
                    ),
              ),
            },
      ),
    );
  };

  return (
    <ResponsiveModal
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title={target?.kind === "excel" ? "فتح وتعديل مصنّف Excel" : "فتح وتعديل مستند Word"}
      description="التعديل داخل المنصة يحفظ نسخة جديدة، ولا يغيّر الملف الأصلي."
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="space-y-2">
            <Label htmlFor="office-save-name">اسم النسخة الجديدة</Label>
            <Input
              id="office-save-name"
              value={saveName}
              onChange={(e) => setSaveName(toAsciiDigits(e.target.value))}
              className="min-h-11"
            />
          </div>
          <Button
            type="button"
            className="min-h-11 w-full gap-2"
            disabled={loading || !!loadError || saveMutation.isPending || !saveName.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {saveMutation.isPending ? "جارٍ الحفظ…" : "حفظ كنسخة جديدة"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {warnings.length ? (
          <div
            role="status"
            className="flex gap-2 rounded-xl border border-border bg-secondary p-3 text-xs text-muted-foreground"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <ul className="space-y-1">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : loadError ? (
          <div className="space-y-3 rounded-xl border border-border p-4 text-sm text-muted-foreground">
            <p>{loadError}</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void load()}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : target?.kind === "word" ? (
          <div className="space-y-3">
            {blocks.map((block, i) =>
              block.type === "paragraph" ? (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {block.heading ? "عنوان" : "فقرة"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="حذف الفقرة"
                      onClick={() => setBlocks((p) => p.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <Textarea
                    dir="rtl"
                    value={block.text}
                    aria-label={block.heading ? "نص العنوان" : "نص الفقرة"}
                    onChange={(e) =>
                      setBlocks((p) =>
                        p.map((b, j) =>
                          j === i && b.type === "paragraph"
                            ? { ...b, text: toAsciiDigits(e.target.value) }
                            : b,
                        ),
                      )
                    }
                    className="min-h-20 rounded-xl"
                  />
                </div>
              ) : (
                <div key={i} className="space-y-1">
                  <span className="text-xs text-muted-foreground">جدول</span>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {block.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="border border-border p-1">
                                <Input
                                  dir="rtl"
                                  value={cell}
                                  aria-label={`خلية جدول ${ri + 1}-${ci + 1}`}
                                  onChange={(e) =>
                                    setBlocks((p) =>
                                      p.map((b, j) =>
                                        j === i && b.type === "table"
                                          ? {
                                              ...b,
                                              rows: b.rows.map((r2, rj) =>
                                                rj !== ri
                                                  ? r2
                                                  : r2.map((c2, cj) =>
                                                      cj === ci
                                                        ? toAsciiDigits(e.target.value)
                                                        : c2,
                                                    ),
                                              ),
                                            }
                                          : b,
                                      ),
                                    )
                                  }
                                  className="min-h-10 min-w-32 rounded-lg"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            )}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full gap-2"
              onClick={() =>
                setBlocks((p) => [...p, { type: "paragraph", text: "", heading: false }])
              }
            >
              <Plus className="size-4" aria-hidden="true" /> إضافة فقرة
            </Button>
          </div>
        ) : sheet ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {sheets.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveSheet(i)}
                  className={`min-h-10 rounded-xl border px-3 text-sm font-medium ${
                    i === activeSheet
                      ? "border-primary bg-secondary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {s.name}
                </button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="min-h-10 gap-2"
                onClick={() => {
                  setSheets((p) => [
                    ...p,
                    {
                      name: sanitizeSheetName(`Sheet${p.length + 1}`),
                      cells: Array.from({ length: 20 }, () =>
                        Array.from({ length: 8 }, () => ({ v: "", f: null })),
                      ),
                    },
                  ]);
                  setActiveSheet(sheets.length);
                }}
              >
                <Plus className="size-4" aria-hidden="true" /> ورقة جديدة
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sheet-name">اسم الورقة</Label>
              <Input
                id="sheet-name"
                value={sheet.name}
                onChange={(e) =>
                  setSheets((p) =>
                    p.map((s, i) =>
                      i === activeSheet ? { ...s, name: toAsciiDigits(e.target.value) } : s,
                    ),
                  )
                }
                className="min-h-11"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              الصيغ المدعومة تبدأ بـ = وتستخدم SUM وAVERAGE وMIN وMAX وCOUNT وROUND وABS وIF فقط؛ أي
              نص آخر يُحفظ نصًا ولا يُنفَّذ.
            </p>

            <div className="max-h-96 overflow-auto rounded-xl border border-border">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 bg-secondary p-1 text-xs text-muted-foreground">
                      #
                    </th>
                    {sheet.cells[0]?.map((_, c) => (
                      <th
                        key={c}
                        className="sticky top-0 bg-secondary p-1 text-xs text-muted-foreground"
                      >
                        <bdi dir="ltr">{colName(c)}</bdi>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.cells.slice(0, XLSX_MAX_ROWS).map((row, r) => (
                    <tr key={r}>
                      <td className="bg-secondary p-1 text-center text-xs text-muted-foreground">
                        <bdi dir="ltr">{r + 1}</bdi>
                      </td>
                      {row.slice(0, XLSX_MAX_COLS).map((cell, c) => (
                        <td key={c} className="border border-border p-0.5">
                          <Input
                            value={cell.f ?? cell.v}
                            aria-label={`خلية ${colName(c)}${r + 1}`}
                            onChange={(e) => setCell(r, c, e.target.value)}
                            className="h-9 w-28 rounded-lg text-sm"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full gap-2"
              onClick={() =>
                setSheets((p) =>
                  p.map((s, i) =>
                    i !== activeSheet
                      ? s
                      : {
                          ...s,
                          cells: [
                            ...s.cells,
                            Array.from({ length: s.cells[0]?.length ?? 8 }, () => ({
                              v: "",
                              f: null,
                            })),
                          ],
                        },
                  ),
                )
              }
            >
              <Plus className="size-4" aria-hidden="true" /> إضافة صف
            </Button>
          </div>
        ) : null}
      </div>
    </ResponsiveModal>
  );
}
