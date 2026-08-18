import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ErrorState, UnauthorizedState } from "@/components/rakeez";
import { getPlatformMe } from "@/lib/platform-admin.functions";
import { hasPlatformAccess } from "@/lib/platform-access";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/platform")({
  component: PlatformLayout,
  errorComponent: ErrorState,
});


function PlatformLayout() {
  const fetchMe = useServerFn(getPlatformMe);
  const me = useQuery({ queryKey: ["platform-me"], queryFn: () => fetchMe() });

  if (me.isPending) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (me.isError || !hasPlatformAccess(me.data)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <UnauthorizedState
          title="إدارة ركيز الداخلية"
          description="هذه المنطقة مخصصة لفريق تشغيل المنصة فقط."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Outlet />
    </div>
  );
}
