import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BellRing,
  Briefcase,
  CalendarClock,
  FileText,
  FolderKanban,
  Handshake,
  Mail,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardsSkeleton,
  ErrorState,
  HeroBadge,
  PageHero,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { useT } from "@/i18n";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationWithSource,
} from "@/lib/notifications.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الإشعارات | ركيز" },
      {
        name: "description",
        content:
          "إشعارات ركيز: تنبيهات مرتبطة بأحداث فعلية، بتوقيت الرياض، وروابط تُفحص صلاحيتها لحظة النقر.",
      },
      { property: "og:title", content: "الإشعارات | ركيز" },
      {
        property: "og:description",
        content: "متابعة الطلبات والمراحل والأحداث المالية دون ضجيج، مع حماية الروابط.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TYPE_LABEL_AR: Record<string, string> = {
  "request.submitted": "طلب جديد بانتظارك",
  "request.info_needed": "طلب استكمال معلومات",
  "request.decided": "صدر قرار على طلبك",
  "stage.submitted": "مرحلة سُلّمت للمراجعة",
  "stage.rework": "مرحلة أُعيدت للتعديل",
  "stage.approved": "اعتماد مرحلة",
  "finance.disbursement_status": "تحديث على طلب صرف",
  "finance.document_status": "تحديث على مستند مالي",
  "security.membership_suspended": "تعليق عضويتك",
  "document.shared": "مستند تمت مشاركته",
  "contract.updated": "تحديث على عقد",
  "appointment.proposed": "طلب موعد جديد",
  "appointment.confirmed": "تم تأكيد موعد",
  "appointment.rescheduled": "إعادة جدولة موعد",
  "appointment.cancelled": "إلغاء موعد",
  "appointment.reminder": "تذكير بموعد",
  "correspondence.received": "مراسلة واردة",
  "network.request": "طلب تواصل جديد",
  "deal.message": "رسالة على معاملة تعاقد",
  "deal.updated": "تحديث على معاملة تعاقد",
  "report.issued": "صدور تقرير هندسي",
  "report.requested": "طلب تقرير هندسي",
};

/** لا نعرض مفاتيح تقنية إنجليزية أبدًا: أي نوع غير معروف يظهر بعبارة عربية عامة. */
function typeLabel(typeCode: string): string {
  return TYPE_LABEL_AR[typeCode] ?? "تنبيه من ركيز";
}

/** أيقونة النوع تُشتق من بادئة الكود، لا من نص خام يظهر للمستخدم. */
function typeIcon(typeCode: string): LucideIcon {
  const family = typeCode.split(".")[0] ?? "";
  const map: Record<string, LucideIcon> = {
    request: FileText,
    stage: FolderKanban,
    finance: Wallet,
    security: ShieldCheck,
    document: FileText,
    contract: Handshake,
    appointment: CalendarClock,
    correspondence: Mail,
    network: Users,
    deal: Briefcase,
    report: FileText,
  };
  return map[family] ?? BellRing;
}

/** سطر عربي مختصر: المشروع، المرحلة، الفاعل — دون أي بيانات حساسة. */
function notificationDetails(
  payload: Record<string, string | number | boolean | null> | null,
): string | null {
  if (!payload) return null;
  const parts: string[] = [];
  const project = payload["project_name"];
  const stage = payload["stage_name"];
  const actor = payload["actor_name"];
  if (typeof project === "string" && project) parts.push(`المشروع: ${project}`);
  if (typeof stage === "string" && stage) parts.push(`المرحلة: ${stage}`);
  if (typeof actor === "string" && actor) parts.push(`بواسطة: ${actor}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

type Tab = "new" | "previous" | "all";

function NotificationsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("new");

  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const fetchUnread = useServerFn(getUnreadCount);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => fetchList({ data: { unreadOnly: false } }),
    retry: false,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchUnread(),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  /** القراءة تنقل الإشعار للسابقة فورًا (تفاؤليًا) ولا تحذفه من السجل أبدًا. */
  const readOne = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onMutate: (id: string) => {
      const now = new Date().toISOString();
      queryClient.setQueryData<NotificationWithSource[]>(["notifications", "list"], (prev) =>
        (prev ?? []).map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)),
      );
      queryClient.setQueryData<number>(["notifications", "unread-count"], (c) =>
        Math.max(0, (c ?? 1) - 1),
      );
    },
    onSettled: invalidate,
  });

  const readAll = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => {
      invalidate();
      toast.success(t("notifications.saved"));
    },
    onError: () => toast.error(t("notifications.saveFailed")),
  });

  const unread = useMemo(() => rows.filter((n) => !n.read_at), [rows]);
  const previous = useMemo(() => rows.filter((n) => n.read_at), [rows]);
  const visible = tab === "new" ? unread : tab === "previous" ? previous : rows;

  const openNotification = (n: NotificationWithSource) => {
    if (!n.read_at) readOne.mutate(n.id);
    void navigate({ to: "/n/$notificationId", params: { notificationId: n.id } });
  };

  const emptyMessage =
    tab === "new"
      ? t("notifications.noNew")
      : tab === "previous"
        ? t("notifications.noPrevious")
        : t("notifications.empty");

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        badge={
          <HeroBadge tone={unreadCount > 0 ? "warning" : "neutral"}>
            {`${t("notifications.unreadCount")} ${unreadCount}`}
          </HeroBadge>
        }
        aside={
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={readAll.isPending || unreadCount === 0}
            onClick={() => readAll.mutate()}
          >
            {readAll.isPending ? t("common.loading") : t("notifications.markAll")}
          </Button>
        }
      />

      <SectionCard
        icon={BellRing}
        title={
          tab === "new"
            ? t("notifications.newSection")
            : tab === "previous"
              ? t("notifications.previousSection")
              : t("notifications.all")
        }
        count={visible.length}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={tab === "new" ? "default" : "outline"}
              size="sm"
              className="min-h-9"
              onClick={() => setTab("new")}
            >
              {`${t("notifications.newSection")} (${unread.length})`}
            </Button>
            <Button
              variant={tab === "previous" ? "default" : "outline"}
              size="sm"
              className="min-h-9"
              onClick={() => setTab("previous")}
            >
              {t("notifications.previousSection")}
            </Button>
            <Button
              variant={tab === "all" ? "default" : "outline"}
              size="sm"
              className="min-h-9"
              onClick={() => setTab("all")}
            >
              {t("notifications.all")}
            </Button>
            <Link
              to="/settings/notifications"
              className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium"
            >
              {t("notifications.preferences")}
            </Link>
          </div>
        }
      >
        {isLoading ? (
          <CardsSkeleton cards={2} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : visible.length === 0 ? (
          <SoftEmpty icon={BellRing} message={emptyMessage} />
        ) : (
          <ul className="space-y-3">
            {visible.map((n) => {
              const Icon = typeIcon(n.type_code);
              const details = notificationDetails(n.payload);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`w-full rounded-xl border p-4 text-start shadow-card transition-colors duration-200 hover:border-primary/50 ${
                      n.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          n.read_at ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" aria-hidden />
                      </span>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {typeLabel(n.type_code)}
                          </span>
                          {!n.read_at && (
                            <Badge variant="destructive">{t("notifications.unread")}</Badge>
                          )}
                          {n.severity === "critical" && (
                            <Badge variant="destructive">{t("notifications.security")}</Badge>
                          )}
                          <span
                            className="ms-auto text-xs text-muted-foreground"
                            dir="ltr"
                          >
                            {formatDateTime(n.created_at)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{t("notifications.from")}:</span>
                          <span className="font-medium text-foreground">{n.source.name}</span>
                          {n.source.kind === "platform" ? (
                            <Badge className="gap-1">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                              {t("notifications.officialSource")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              {n.source.kind === "entity" ? "كيان" : "فرد"}
                            </Badge>
                          )}
                        </div>

                        {details ? (
                          <p className="text-sm text-muted-foreground">{details}</p>
                        ) : null}

                        {n.read_at ? (
                          <p className="text-xs text-muted-foreground">
                            {t("notifications.readAt")}{" "}
                            <span dir="ltr">{formatDateTime(n.read_at)}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
