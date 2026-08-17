import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/rakeez";
import { getArchiveFileUrl, issueArchiveStamp } from "@/lib/archive.functions";
import {
  DOCX_MIME,
  XLSX_MIME,
  buildDocxBlob,
  buildXlsxBlob,
  officeKindOf,
  parseDocx,
  parseXlsx,
  sha256Hex,
  type ArchiveFooter,
} from "@/lib/office-files";

export type DownloadTarget = {
  id: string;
  title: string;
  storagePath: string;
  reference: string;
  archivedAt: string;
  mimeType: string | null;
};

/** تاريخ الملف بالصيغة YYYY/MM/DD بأرقام غربية. */
function fileDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function DownloadDialog({
  target,
  onClose,
}: {
  target: DownloadTarget | null;
  onClose: () => void;
}) {
  const signUrl = useServerFn(getArchiveFileUrl);
  const stamp = useServerFn(issueArchiveStamp);
  const [mode, setMode] = React.useState<"plain" | "stamped" | null>(null);

  const kind = target ? officeKindOf(target.title, target.mimeType) : null;

  const run = useMutation({
    mutationFn: async (choice: "plain" | "stamped") => {
      if (!target) return;
      setMode(choice);
      const url = await signUrl({ data: { path: target.storagePath } });

      if (!kind) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error("تعذّر تنزيل الملف من المخزن.");
      const bytes = new Uint8Array(await res.arrayBuffer());

      const footer: ArchiveFooter = {
        reference: target.reference,
        fileDate: fileDate(target.archivedAt),
      };

      const blob =
        kind === "word"
          ? await buildDocxBlob(parseDocx(bytes).blocks, footer)
          : buildXlsxBlob(parseXlsx(bytes).sheets, footer);

      if (choice === "stamped") {
        const checksum = await sha256Hex(blob);
        await stamp({ data: { itemId: target.id, checksum } });
      }

      const ext = kind === "word" ? ".docx" : ".xlsx";
      const base = target.title.replace(/\.(docx|xlsx)$/i, "");
      saveBlob(
        new Blob([blob], { type: kind === "word" ? DOCX_MIME : XLSX_MIME }),
        `${base}${ext}`,
      );
    },
    onSuccess: () => {
      toast.success(mode === "stamped" ? "تم التنزيل الموثق ببصمة ركيز" : "تم التنزيل");
      onClose();
    },
    onError: (e: unknown) =>
      toast.error("تعذّر تنزيل الملف", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  return (
    <ResponsiveModal
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title="تنزيل الملف"
      description="اختر نوع التنزيل قبل حفظ الملف على جهازك."
    >
      <div className="grid gap-3 pb-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-14 justify-start gap-3 text-start"
          disabled={run.isPending}
          onClick={() => run.mutate("plain")}
        >
          {run.isPending && mode === "plain" ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-5" aria-hidden="true" />
          )}
          <span className="flex flex-col">
            <span className="font-semibold">تنزيل عام</span>
            <span className="text-xs text-muted-foreground">نسخة عادية من الملف.</span>
          </span>
        </Button>

        <Button
          type="button"
          className="min-h-14 justify-start gap-3 text-start"
          disabled={run.isPending || !kind}
          onClick={() => run.mutate("stamped")}
        >
          {run.isPending && mode === "stamped" ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="size-5" aria-hidden="true" />
          )}
          <span className="flex flex-col">
            <span className="font-semibold">تنزيل موثق ببصمة ركيز</span>
            <span className="text-xs opacity-90">
              سجل سلامة للمنصة يثبت المصدر وعدم التغيير، وليس توقيعًا حكوميًا.
            </span>
          </span>
        </Button>

        {!kind ? (
          <p className="text-xs text-muted-foreground">
            التوثيق ببصمة ركيز متاح حاليًا لملفات Word وExcel الصادرة من الأرشيف.
          </p>
        ) : null}
      </div>
    </ResponsiveModal>
  );
}
