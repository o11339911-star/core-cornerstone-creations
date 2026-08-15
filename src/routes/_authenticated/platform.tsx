import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, PlugZap, ShieldAlert, Users } from "lucide-react";

import { ErrorState, UnauthorizedState } from "@/components/rakeez";
import { getPlatformMe } from "@/lib/platform-admin.functions";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/platform")({
  component: PlatformLayout,
  errorComponent: ErrorState,
});

const LINKS = [
  { to: "/platform/queue", label: "طابور المراجعة", icon: Inbox },
  { to: "/platform/staff", label: "فريق المنصة", icon: Users },
  { to: "/platform/breakglass", label: "الوصول الطارئ", icon: ShieldAlert },
  { to: "/platform/integrations", label: "التكاملات", icon: PlugZap },
] as const;

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

  if (me.isError || !me.data?.is_staff) {
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
      <nav aria-label="أقسام إدارة المنصة" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl border border-border bg-card p-1.5 shadow-card sm:w-full">
          {LINKS.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                activeProps={{
                  className:
                    "border-primary bg-secondary text-primary inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border-b-2 px-3 text-sm font-semibold",
                }}
              >
                <link.icon className="size-4" aria-hidden="true" />
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
