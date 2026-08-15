import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n";
import { getUnreadCount } from "@/lib/notifications.functions";

export function NotificationsBell() {
  const t = useT();
  const fetchCount = useServerFn(getUnreadCount);

  const { data: count } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchCount(),
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <Link
      to="/notifications"
      aria-label={t("notifications.bell")}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {typeof count === "number" && count > 0 && (
        <span className="absolute -top-0.5 end-0.5 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-5 text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
