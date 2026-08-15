import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ErrorState } from "@/components/rakeez";
import { useT } from "@/i18n";
import {
  markNotificationRead,
  resolveNotificationTarget,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/n/$notificationId")({
  component: NotificationTargetPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "فتح إشعار | ركيز" },
      {
        name: "description",
        content: "فحص صلاحية الوصول لحظة النقر قبل تحويلك إلى المورد المرتبط بالإشعار.",
      },
      { property: "og:title", content: "فتح إشعار | ركيز" },
      { property: "og:description", content: "روابط الإشعارات تحمل معرّفات فقط ولا تمنح أي صلاحية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function NotificationTargetPage() {
  const t = useT();
  const navigate = useNavigate();
  const { notificationId } = Route.useParams();

  const resolve = useServerFn(resolveNotificationTarget);
  const markRead = useServerFn(markNotificationRead);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "resolve", notificationId],
    queryFn: () => resolve({ data: { id: notificationId } }),
    retry: false,
  });

  useEffect(() => {
    if (!data?.ok || !data.target) return;
    void markRead({ data: { id: notificationId } }).catch(() => undefined);

    const { target_kind: kind, target_id: targetId, project_id: projectId } = data.target;

    if (kind === "request" && targetId) {
      void navigate({ to: "/requests/$requestId", params: { requestId: targetId }, replace: true });
    } else if (kind === "stage" && projectId) {
      void navigate({ to: "/projects/$projectId/stages", params: { projectId }, replace: true });
    } else if (kind === "contract" && projectId) {
      void navigate({ to: "/projects/$projectId/contracts", params: { projectId }, replace: true });
    } else if (kind === "document") {
      void navigate({ to: "/documents", replace: true });
    } else if (projectId) {
      void navigate({ to: "/projects/$projectId/finance", params: { projectId }, replace: true });
    } else {
      void navigate({ to: "/settings/security", replace: true });
    }
  }, [data, markRead, navigate, notificationId]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t("notifications.linkChecking")}</p>
      </main>
    );
  }

  if (!data?.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-foreground">{t("notifications.linkDenied")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("notifications.linkDeniedHint")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
    </main>
  );
}
