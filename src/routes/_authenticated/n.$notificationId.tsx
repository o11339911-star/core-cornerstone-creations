import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BellRing } from "lucide-react";

import { ErrorState, SoftEmpty } from "@/components/rakeez";
import { Skeleton } from "@/components/ui/skeleton";
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

    if (kind === "deal" && targetId) {
      // يفتح تبويب التعاقد على نفس المعاملة مباشرة.
      void navigate({ to: "/deals", search: { deal: targetId }, replace: true });
    } else if (kind === "request" && targetId) {
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
      <main className="mx-auto max-w-lg space-y-3 px-4 py-16" role="status" aria-busy="true">
        <Skeleton className="mx-auto h-6 w-48 rounded-md" />
        <Skeleton className="mx-auto h-4 w-64 rounded-md" />
      </main>
    );
  }

  if (!data?.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <SoftEmpty icon={BellRing} message={t("notifications.linkDenied")} />
        <p className="mt-3 text-center text-sm text-muted-foreground">
          {t("notifications.linkDeniedHint")}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-3 px-4 py-16" role="status" aria-busy="true">
      <Skeleton className="mx-auto h-6 w-48 rounded-md" />
    </main>
  );
}
