import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessagesSquare, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SoftEmpty } from "@/components/rakeez";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import {
  DEAL_ALLOWED_MIME,
  DEAL_MAX_FILE_BYTES,
  DEAL_MESSAGE_KINDS,
  listDealMessages,
  postDealMessage,
  registerDealAttachment,
  type DealAttachment,
} from "@/lib/deals.functions";

const KIND_AR: Record<(typeof DEAL_MESSAGE_KINDS)[number], string> = {
  reply: "رد نصي",
  info_request: "طلب معلومات إضافية",
  document_request: "طلب مستندات",
};

const ACCEPT = Object.values(DEAL_ALLOWED_MIME).flat().join(",");

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** التحقق من النوع والامتداد والحجم قبل الرفع؛ القاعدة تعيد فرضه خادميًا. */
function fileError(file: File): string | null {
  const allowed = DEAL_ALLOWED_MIME[file.type];
  if (!allowed) return `نوع الملف غير مسموح: ${file.name}`;
  if (!allowed.includes(extensionOf(file.name))) return `امتداد الملف لا يطابق نوعه: ${file.name}`;
  if (file.size <= 0 || file.size > DEAL_MAX_FILE_BYTES) return `حجم الملف يتجاوز المسموح: ${file.name}`;
  return null;
}

function AttachmentLink({ item }: { item: DealAttachment }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { data, error } = await supabase.storage
            .from("deal-attachments")
            .createSignedUrl(item.storage_path, 60);
          if (error || !data?.signedUrl) throw new Error("failed");
          window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        } catch {
          toast.error("تعذّر فتح المرفق الآن — حاول مرة أخرى");
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-xs font-medium text-foreground"
    >
      <Paperclip className="size-3" aria-hidden="true" />
      <span className="max-w-40 truncate">{item.file_name}</span>
    </button>
  );
}

export function DealThread({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const fetchMessages = useServerFn(listDealMessages);
  const post = useServerFn(postDealMessage);
  const register = useServerFn(registerDealAttachment);

  const [kind, setKind] = React.useState<(typeof DEAL_MESSAGE_KINDS)[number]>("reply");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const thread = useQuery({
    queryKey: ["deal-thread", dealId],
    queryFn: () => fetchMessages({ data: { dealId } }),
    retry: false,
  });

  const send = useMutation({
    mutationFn: async () => {
      const { id: messageId } = await post({
        data: { dealId, kind, body: body.trim() || null },
      });
      for (const file of files) {
        const path = `${dealId}/${crypto.randomUUID()}${extensionOf(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("deal-attachments")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error("UPLOAD_FAILED");
        await register({
          data: {
            messageId,
            storagePath: path,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("تم إرسال الرد");
      setBody("");
      setFiles([]);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["deal-thread", dealId] });
    },
    onError: () => {
      setError("تعذّر إرسال الرد أو رفع المرفقات — حاول مرة أخرى");
      toast.error("تعذّر إرسال الرد");
    },
  });

  return (
    <section className="space-y-3 rounded-xl border border-border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessagesSquare className="size-4" aria-hidden="true" /> الردود والمرفقات
      </h3>

      {thread.isPending ? (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : thread.isError ? (
        <div className="text-sm">
          <p className="text-destructive">تعذّر تحميل الردود.</p>
          <button type="button" className="underline" onClick={() => void thread.refetch()}>
            إعادة المحاولة
          </button>
        </div>
      ) : !thread.data?.length ? (
        <SoftEmpty icon={MessagesSquare} message="لا توجد ردود بعد — اكتب أول رد أو اطلب مستندًا." />
      ) : (
        <ul className="space-y-2">
          {thread.data.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${
                m.is_mine ? "border-primary/40 bg-secondary/40" : "border-border bg-card"
              }`}
            >
              <p className="mb-1 text-xs text-muted-foreground">
                {KIND_AR[m.kind]}
                {" · "}
                <bdi dir="ltr">{formatDateTime(m.created_at)}</bdi>
                {m.is_mine ? " · أنت" : ""}
              </p>
              {m.body ? (
                <p className="whitespace-pre-wrap break-words text-foreground">{m.body}</p>
              ) : null}
              {m.attachments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <AttachmentLink key={a.id} item={a} />
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {DEAL_MESSAGE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-11 rounded-xl border px-3 text-xs font-medium ${
                kind === k
                  ? "border-primary bg-secondary text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {KIND_AR[k]}
            </button>
          ))}
        </div>
        <Label htmlFor={`thread-body-${dealId}`}>نص الرد</Label>
        <Textarea
          id={`thread-body-${dealId}`}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="space-y-2">
          <Label htmlFor={`thread-files-${dealId}`}>مرفقات (اختياري)</Label>
          <input
            id={`thread-files-${dealId}`}
            type="file"
            multiple
            accept={ACCEPT}
            className="block w-full text-xs"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              const bad = picked.map(fileError).find(Boolean);
              if (bad) {
                setError(bad);
                setFiles([]);
                e.target.value = "";
                return;
              }
              setError(null);
              setFiles(picked);
            }}
          />
          <p className="text-xs text-muted-foreground">
            المسموح: PDF وصور JPG/PNG/WEBP وWord وExcel وCSV وTXT — حتى 25 ميغابايت للملف.
          </p>
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs"
                >
                  <span className="max-w-40 truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`إزالة ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="min-h-11 w-full"
          disabled={send.isPending || (!body.trim() && files.length === 0)}
          onClick={() => send.mutate()}
        >
          {send.isPending ? "جارٍ الإرسال…" : "إرسال"}
        </Button>
      </div>
    </section>
  );
}
