import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Link2, QrCode as QrIcon, Send, UserPlus, Video, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toLatinDigits } from "@/lib/format";
import { QrCode } from "./qr-code";
import {
  cancelAppointmentInvite,
  getAppointmentCard,
  getMeetingAccess,
  inviteAppointmentParticipant,
  listAppointmentInvites,
  listAppointmentShareTargets,
  shareAppointmentInternal,
} from "@/lib/appointment-card.functions";

const RIYADH = "Asia/Riyadh";

const fmt = (iso: string) =>
  toLatinDigits(
    new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", {
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      timeZone: RIYADH,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso)),
  );

const STATUS_LABEL: Record<string, string> = {
  proposed: "بانتظار الموافقة",
  confirmed: "موعد مؤكد",
  cancelled: "موعد ملغي",
  postponed: "بانتظار الموافقة على موعد جديد",
  completed: "موعد منتهٍ",
};

const INVITE_STATUS: Record<string, string> = {
  pending: "بانتظار القبول",
  accepted: "مقبول",
  declined: "مرفوض",
  cancelled: "ملغي",
};

const KIND_LABEL: Record<string, string> = {
  visit: "زيارة موقع",
  consultation: "استشارة",
  meeting: "اجتماع",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/** بطاقة موعد دائمة: مرجع «Rakiz»، رمز تحقق، مشاركة، مشاركون، ودخول الاجتماع. */
export function AppointmentCard({ appointmentId }: { appointmentId: string }) {
  const qc = useQueryClient();
  const fetchCard = useServerFn(getAppointmentCard);
  const fetchInvites = useServerFn(listAppointmentInvites);
  const fetchMeeting = useServerFn(getMeetingAccess);
  const invite = useServerFn(inviteAppointmentParticipant);
  const cancelInvite = useServerFn(cancelAppointmentInvite);
  const fetchTargets = useServerFn(listAppointmentShareTargets);
  const shareInternal = useServerFn(shareAppointmentInternal);

  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState("");

  const card = useQuery({
    queryKey: ["appointment-card", appointmentId],
    queryFn: () => fetchCard({ data: { appointmentId } }),
  });
  const invites = useQuery({
    queryKey: ["appointment-invites", appointmentId],
    queryFn: () => fetchInvites({ data: { appointmentId } }),
  });
  const meeting = useQuery({
    queryKey: ["appointment-meeting", appointmentId],
    queryFn: () => fetchMeeting({ data: { appointmentId } }),
  });
  const targets = useQuery({
    queryKey: ["appointment-share-targets"],
    queryFn: () => fetchTargets(),
  });

  const cancelOne = useMutation({
    mutationFn: (inviteId: string) => cancelInvite({ data: { inviteId } }),
    onSuccess: (res) => {
      if (!res.available) {
        toast.error("إلغاء الدعوة غير مفعّل بعد على هذا الحساب.");
        return;
      }
      toast.success("أُلغيت الدعوة.");
      void qc.invalidateQueries({ queryKey: ["appointment-invites", appointmentId] });
    },
    onError: () => toast.error("تعذّر إلغاء الدعوة. حاول مرة أخرى."),
  });

  const sendInternalShare = useMutation({
    mutationFn: (userId: string) => shareInternal({ data: { appointmentId, userId } }),
    onSuccess: (res) => {
      if (!res.available) {
        toast.error("المشاركة الداخلية غير مفعّلة بعد على هذا الحساب.");
        return;
      }
      setShareTarget("");
      toast.success("شُوركت بطاقة الموعد داخل المنصة بالرقم المرجعي فقط.");
    },
    onError: (e: unknown) => {
      const m = e instanceof Error ? e.message : "";
      toast.error(
        /NOT_LINKED/.test(m)
          ? "المشاركة متاحة مع جهات مرتبطة بك في شبكة التواصل فقط."
          : "تعذّرت المشاركة الداخلية. حاول مرة أخرى.",
      );
    },
  });

  const sendInvite = useMutation({
    mutationFn: () => invite({ data: { appointmentId, email: email.trim().toLowerCase(), userId: null } }),
    onSuccess: (res) => {
      if (!res.available) {
        toast.error("دعوة المشاركين غير مفعّلة بعد على هذا الحساب.");
        return;
      }
      setEmail("");
      if (res.linkedAccount) {
        toast.success("أُرسلت الدعوة، وستظهر للمدعو داخل المنصة.");
      } else if (res.emailSent) {
        toast.success("أُرسلت الدعوة إلى البريد المحدد.");
      } else if (!res.mailConfigured) {
        toast.warning("حُفظت الدعوة، وإرسال البريد يتطلب إعداد البريد من مدير النظام.");
      } else {
        toast.success("حُفظت الدعوة. لن تُفعّل إلا بعد دخول صاحب البريد نفسه وقبولها.");
      }
      void qc.invalidateQueries({ queryKey: ["appointment-invites", appointmentId] });
    },
    onError: (e: unknown) => {
      const m = e instanceof Error ? e.message : "";
      toast.error(
        /ALREADY_EXISTS/.test(m)
          ? "هذه الجهة مدعوّة بالفعل لهذا الاجتماع."
          : /ONLY_FOR_MEETING/.test(m)
            ? "إضافة المشاركين متاحة لمواعيد الاجتماعات فقط."
            : /FORBIDDEN/.test(m)
              ? "لا تملك صلاحية دعوة مشاركين لهذا الموعد."
              : "تعذّرت إضافة المشارك. حاول مرة أخرى.",
      );
    },
  });

  if (card.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />;
  }
  if (card.isError) {
    return (
      <div className="space-y-2 rounded-xl border border-border/60 p-4">
        <p className="text-sm text-muted-foreground">تعذّر عرض بطاقة الموعد.</p>
        <Button size="sm" variant="outline" onClick={() => void card.refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }
  if (!card.data?.available || !card.data.card) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
        بطاقة الموعد ورمز التحقق غير مفعّلين بعد لأن تحديث قاعدة البيانات المطلوب لم يُطبّق.
      </p>
    );
  }

  const c = card.data.card;
  const reference = c.reference ? `Rakiz ${toLatinDigits(c.reference)}` : null;
  const verifyUrl =
    typeof window !== "undefined" && c.reference
      ? `${window.location.origin}/verify-appointment?n=${encodeURIComponent(c.reference)}&d=${c.verify_date}`
      : null;

  const shareText = [
    `موعد في منصة ركيز`,
    `العنوان: ${c.title}`,
    `النوع: ${KIND_LABEL[c.kind] ?? c.kind}`,
    `التاريخ والوقت (الرياض): ${fmt(c.starts_at)}`,
    reference ? `الرقم المرجعي: ${reference}` : null,
    verifyUrl ? `التحقق: ${verifyUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("تعذّر النسخ من المتصفح.");
    }
  };

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "موعد في ركيز", text: shareText });
        return;
      } catch {
        /* المستخدم ألغى المشاركة */
      }
    }
    await copy(shareText, "نُسخت تفاصيل الموعد للمشاركة.");
  };

  const inviteRows = invites.data?.invites ?? [];
  const canInvite = c.can_manage && c.kind === "meeting" && !["cancelled", "completed"].includes(c.status);

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold">{c.title}</h4>
            <Badge variant="secondary">{STATUS_LABEL[c.status] ?? "بانتظار الموافقة"}</Badge>
            <Badge variant="outline">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
          </div>
          <dl className="grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">الرقم المرجعي:</dt>
              <dd dir="ltr" className="font-medium">
                {reference ?? "—"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">التاريخ والوقت (الرياض):</dt>
              <dd dir="ltr">{fmt(c.starts_at)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">طالب الموعد:</dt>
              <dd>{c.requester_label}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">مستقبل الطلب:</dt>
              <dd>{c.provider_label}</dd>
            </div>
          </dl>
        </div>

        {verifyUrl ? (
          <div className="flex flex-col items-center gap-2">
            <QrCode value={verifyUrl} size={132} alt="رمز التحقق من الموعد" />
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <QrIcon className="size-3" aria-hidden="true" /> يفتح صفحة تحقق عامة بلا بيانات الأطراف
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void share()}>
          <Link2 className="size-4" aria-hidden="true" /> مشاركة
        </Button>
        {reference ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copy(reference, "نُسخ الرقم المرجعي.")}
          >
            <Copy className="size-4" aria-hidden="true" /> نسخ الرقم المرجعي
          </Button>
        ) : null}
        {meeting.data?.isMeeting ? (
          meeting.data.canJoin ? (
            <Button size="sm" asChild>
              <a href={`/calls?appointment=${appointmentId}`}>
                <Video className="size-4" aria-hidden="true" /> الانضمام للاجتماع
              </a>
            </Button>
          ) : (
            <span className="inline-flex items-center rounded-lg bg-secondary px-3 py-2 text-xs text-primary">
              يفتح الانضمام قبل الموعد بربع ساعة وبعد تأكيده.
            </span>
          )
        ) : null}
      </div>

      {c.kind === "meeting" ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/30 p-3">
          <span className="text-sm font-medium">المشاركون في الاجتماع</span>

          {invites.isLoading ? (
            <div className="h-10 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
          ) : inviteRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا مشاركين مدعوّين بعد.</p>
          ) : (
            <ul className="space-y-2">
              {inviteRows.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm"
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block truncate" dir="auto">
                      {i.invitee ?? "مشارك"}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      دعاه: {i.invited_by_label ?? "عضو في الموعد"} — {fmt(i.created_at)}
                      {i.accepted_at ? ` — قُبلت: ${fmt(i.accepted_at)}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{INVITE_STATUS[i.status] ?? i.status}</Badge>
                    {i.can_cancel ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancelOne.isPending}
                        onClick={() => cancelOne.mutate(i.id)}
                      >
                        <X className="size-4" aria-hidden="true" /> إلغاء
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canInvite ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium" htmlFor={`invite-${appointmentId}`}>
                إضافة مشارك ببريده
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={`invite-${appointmentId}`}
                  dir="ltr"
                  className="min-w-52 flex-1 text-start"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setInviteError(null);
                  }}
                  placeholder="name@example.com"
                />
                <Button
                  size="sm"
                  disabled={sendInvite.isPending}
                  onClick={() => {
                    if (!EMAIL_RE.test(email.trim())) {
                      setInviteError("أدخل بريدًا إلكترونيًا صحيحًا");
                      return;
                    }
                    sendInvite.mutate();
                  }}
                >
                  <UserPlus className="size-4" aria-hidden="true" />
                  {sendInvite.isPending ? "جارٍ الإرسال…" : "دعوة"}
                </Button>
              </div>
              {inviteError ? <span className="text-xs text-destructive">{inviteError}</span> : null}
              <p className="text-[11px] text-muted-foreground">
                لا تظهر تفاصيل الاجتماع للمدعو إلا بعد دخوله بالبريد نفسه وقبول الدعوة.
              </p>

              {(targets.data?.targets ?? []).length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <label className="block text-xs font-medium" htmlFor={`net-${appointmentId}`}>
                    إضافة مشارك من شبكة التواصل
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      id={`net-${appointmentId}`}
                      className="min-h-11 min-w-52 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
                      value={shareTarget}
                      onChange={(e) => setShareTarget(e.target.value)}
                    >
                      <option value="">اختر جهة متصلة…</option>
                      {(targets.data?.targets ?? []).map((t) => (
                        <option key={t.user_id} value={t.user_id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!shareTarget || sendInvite.isPending}
                      onClick={() =>
                        invite({ data: { appointmentId, email: null, userId: shareTarget } })
                          .then((res) => {
                            if (!res.available) {
                              toast.error("دعوة المشاركين غير مفعّلة بعد على هذا الحساب.");
                              return;
                            }
                            setShareTarget("");
                            toast.success("أُرسلت الدعوة، وستظهر للمدعو داخل المنصة.");
                            void qc.invalidateQueries({
                              queryKey: ["appointment-invites", appointmentId],
                            });
                          })
                          .catch(() => toast.error("تعذّرت دعوة هذه الجهة."))
                      }
                    >
                      <UserPlus className="size-4" aria-hidden="true" /> دعوة من الشبكة
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!shareTarget || sendInternalShare.isPending}
                      onClick={() => sendInternalShare.mutate(shareTarget)}
                    >
                      <Send className="size-4" aria-hidden="true" /> مشاركة داخل ركيز
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
