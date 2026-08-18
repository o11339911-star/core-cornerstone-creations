import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Mail, RefreshCw, Send, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, HeroBadge, ResponsiveModal, SectionCard, SoftEmpty } from "@/components/rakeez";
import { formatDateTime } from "@/lib/format";
import {
  disconnectMailbox,
  getMailboxMessageBody,
  getMailboxOverview,
  listMailboxMessages,
  sendMailboxMessage,
  syncMailbox,
} from "@/lib/mailbox.functions";

/**
 * صندوق البريد المربوط داخل المراسلات: وارد/صادر، فتح الرسالة، رد وإرسال.
 * الملخصات تُحمّل أولًا، والمحتوى عند الطلب فقط — فلا نخزّن نص الرسائل لدينا.
 */
export function MailboxPanel({ entityId }: { entityId: string | null }) {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getMailboxOverview);
  const fetchMessages = useServerFn(listMailboxMessages);
  const fetchBody = useServerFn(getMailboxMessageBody);
  const sync = useServerFn(syncMailbox);
  const send = useServerFn(sendMailboxMessage);
  const disconnect = useServerFn(disconnectMailbox);

  const [folder, setFolder] = React.useState<"inbox" | "sent">("inbox");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [compose, setCompose] = React.useState<{
    to: string;
    subject: string;
    body: string;
    threadId: string | null;
  } | null>(null);

  const overview = useQuery({
    queryKey: ["mailbox-overview", entityId],
    queryFn: () => fetchOverview({ data: { entityId } }),
  });

  const connection = (overview.data?.connections ?? []).find((c) => c.status !== "disconnected");
  const connectionId = connection?.id ?? null;

  const messages = useQuery({
    queryKey: ["mailbox-messages", connectionId, folder],
    queryFn: () => fetchMessages({ data: { connectionId: connectionId as string, folder, search: null } }),
    enabled: Boolean(connectionId),
  });

  const opened = (messages.data ?? []).find((m) => m.id === openId) ?? null;
  const body = useQuery({
    queryKey: ["mailbox-body", connectionId, opened?.source_id],
    queryFn: () =>
      fetchBody({ data: { connectionId: connectionId as string, sourceId: opened!.source_id } }),
    enabled: Boolean(connectionId && opened),
  });

  const syncMutation = useMutation({
    mutationFn: () => sync({ data: { connectionId: connectionId as string } }),
    onSuccess: () => {
      toast.success("تمت المزامنة");
      void qc.invalidateQueries({ queryKey: ["mailbox-messages"] });
      void qc.invalidateQueries({ queryKey: ["mailbox-overview"] });
    },
    onError: () => toast.error("تعذّرت المزامنة — قد يحتاج الصندوق إعادة ربط"),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          connectionId: connectionId as string,
          to: compose!.to.trim(),
          subject: compose!.subject.trim(),
          body: compose!.body,
          threadId: compose!.threadId,
        },
      }),
    onSuccess: () => {
      toast.success("تم إرسال الرسالة");
      setCompose(null);
      void qc.invalidateQueries({ queryKey: ["mailbox-messages"] });
    },
    onError: () => toast.error("تعذّر إرسال الرسالة"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      disconnect({ data: { connectionId: connectionId as string, keepArchive: true } }),
    onSuccess: () => {
      toast.success("تم فصل صندوق البريد");
      void qc.invalidateQueries({ queryKey: ["mailbox-overview"] });
    },
    onError: () => toast.error("تعذّر الفصل"),
  });

  if (overview.isPending) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (overview.isError)
    return <ErrorState description="تعذّر تحميل صندوق البريد" onRetry={() => void overview.refetch()} />;

  if (!connection) {
    return (
      <SectionCard icon={Mail} title="صندوق البريد">
        <SoftEmpty
          icon={Inbox}
          message="لا يوجد صندوق بريد مربوط — اربط بريدك لقراءة رسائلك وإرسالها من داخل ركيز."
        />
        <div className="mt-3 flex justify-center">
          <Link
            to="/settings/messaging"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            ربط بريد
          </Link>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={Mail}
      title="صندوق البريد"
      action={
        <HeroBadge tone={connection.status === "connected" ? "success" : "warning"}>
          {connection.status === "connected" ? "متصل" : "يحتاج إعادة ربط"}
        </HeroBadge>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" dir="ltr">
              {connection.email_address}
            </p>
            <p className="text-xs text-muted-foreground">
              آخر مزامنة:{" "}
              <span dir="ltr">
                {connection.last_sync_at ? formatDateTime(connection.last_sync_at) : "لم تتم بعد"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 gap-2"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw className="size-4" aria-hidden="true" /> مزامنة الآن
            </Button>
            <Button
              type="button"
              className="min-h-11 gap-2"
              onClick={() => setCompose({ to: "", subject: "", body: "", threadId: null })}
            >
              <Send className="size-4" aria-hidden="true" /> رسالة جديدة
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 gap-2 text-destructive"
              disabled={disconnectMutation.isPending}
              onClick={() => disconnectMutation.mutate()}
            >
              <Unlink className="size-4" aria-hidden="true" /> فصل
            </Button>
          </div>
        </div>

        <div role="tablist" aria-label="مجلدات البريد" className="flex gap-2 rounded-xl border border-border bg-card p-1">
          {([
            { value: "inbox", label: "وارد" },
            { value: "sent", label: "صادر" },
          ] as const).map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={folder === t.value}
              onClick={() => setFolder(t.value)}
              className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-medium ${
                folder === t.value ? "bg-secondary text-primary" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {messages.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : messages.isError ? (
          <ErrorState description="تعذّر تحميل الرسائل" onRetry={() => void messages.refetch()} />
        ) : (messages.data ?? []).length === 0 ? (
          <SoftEmpty icon={Inbox} message="لا توجد رسائل بعد — جرّب «مزامنة الآن»." />
        ) : (
          <ul className="space-y-2">
            {(messages.data ?? []).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(m.id)}
                  className="w-full rounded-xl border border-border/60 p-3 text-start"
                >
                  <p className="truncate text-sm font-medium">{m.subject ?? "بلا موضوع"}</p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    {folder === "inbox" ? m.from_address : m.to_addresses.join(", ")}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{m.snippet ?? ""}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {m.sent_at ? formatDateTime(m.sent_at) : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ResponsiveModal
        open={Boolean(opened)}
        onOpenChange={(v) => !v && setOpenId(null)}
        title={opened?.subject ?? "رسالة"}
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground" dir="ltr">
            {opened?.from_address}
          </p>
          {body.isPending ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : body.isError ? (
            <ErrorState description="تعذّر تحميل نص الرسالة" onRetry={() => void body.refetch()} />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{body.data?.body}</p>
          )}
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              if (!opened) return;
              setCompose({
                to: opened.from_address ?? "",
                subject: opened.subject?.startsWith("رد:") ? opened.subject : `رد: ${opened.subject ?? ""}`,
                body: "",
                threadId: opened.thread_id,
              });
              setOpenId(null);
            }}
          >
            رد
          </Button>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={Boolean(compose)}
        onOpenChange={(v) => !v && setCompose(null)}
        title="رسالة بريد"
      >
        {compose ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(compose.to.trim())) {
                toast.error("أدخل عنوان بريد صحيح للمستلم");
                return;
              }
              if (!compose.subject.trim()) {
                toast.error("اكتب موضوع الرسالة");
                return;
              }
              sendMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mail-to">المستلم</Label>
              <Input
                id="mail-to"
                dir="ltr"
                className="min-h-11 text-start"
                value={compose.to}
                onChange={(e) => setCompose({ ...compose, to: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mail-subject">الموضوع</Label>
              <Input
                id="mail-subject"
                className="min-h-11"
                value={compose.subject}
                onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mail-body">النص</Label>
              <Textarea
                id="mail-body"
                rows={6}
                value={compose.body}
                onChange={(e) => setCompose({ ...compose, body: e.target.value })}
              />
            </div>
            <Button type="submit" className="min-h-11 w-full" disabled={sendMutation.isPending}>
              {sendMutation.isPending ? "جارٍ الإرسال…" : "إرسال"}
            </Button>
          </form>
        ) : null}
      </ResponsiveModal>
    </SectionCard>
  );
}
