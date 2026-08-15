import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing } from "lucide-react";

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
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";
import { formatRiyadh } from "@/lib/riyadh-time";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الإشعارات | ركيز" },
      {
        name: "description",
        content:
          "صندوق إشعارات ركيز: تنبيهات مرتبطة بأحداث فعلية، بتوقيت الرياض، وروابط تُفحص صلاحيتها لحظة النقر.",
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
};

function NotificationsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications", "list", unreadOnly],
    queryFn: () => fetchList({ data: { unreadOnly } }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const readOne = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: invalidate,
  });

  const readAll = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => {
      invalidate();
      toast.success(t("notifications.saved"));
    },
  });

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        badge={<HeroBadge tone="neutral">{rows.length}</HeroBadge>}
        aside={
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={readAll.isPending}
            onClick={() => readAll.mutate()}
          >
            {readAll.isPending ? t("common.loading") : t("notifications.markAll")}
          </Button>
        }
      />

      <SectionCard
        icon={BellRing}
        title={t("notifications.title")}
        count={rows.length}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={unreadOnly ? "outline" : "default"}
              size="sm"
              className="min-h-9"
              onClick={() => setUnreadOnly(false)}
            >
              {t("notifications.all")}
            </Button>
            <Button
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              className="min-h-9"
              onClick={() => setUnreadOnly(true)}
            >
              {t("notifications.unreadOnly")}
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
        ) : rows.length === 0 ? (
          <SoftEmpty icon={BellRing} message={t("notifications.empty")} />
        ) : (
          <ul className="space-y-3">
            {rows.map((n) => (
              <li key={n.id} className="rounded-lg border border-border bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {TYPE_LABEL_AR[n.type_code] ?? n.type_code}
                  </span>
                  {!n.read_at && <Badge variant="destructive">{t("notifications.unread")}</Badge>}
                  {n.severity === "critical" && <Badge variant="destructive">{t("notifications.security")}</Badge>}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {formatRiyadh(n.created_at)} · {t("notifications.riyadhTime")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/n/$notificationId"
                    params={{ notificationId: n.id }}
                    className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
                  >
                    {t("notifications.open")}
                  </Link>
                  {!n.read_at && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      onClick={() => readOne.mutate(n.id)}
                    >
                      {t("notifications.markRead")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
