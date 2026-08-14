import * as React from "react";
import {
  AlertTriangle,
  Inbox,
  Loader2,
  ShieldOff,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

type Tone = "neutral" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
};

export type StateViewProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  tone?: Tone;
  action?: React.ReactNode;
  className?: string;
};

/** Shared shell for every non-content state (empty / error / offline / unauthorized). */
export function StateView({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  action,
  className,
}: StateViewProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className={cn("flex size-12 items-center justify-center rounded-full", toneClasses[tone])}
        >
          <Icon className="size-6" />
        </span>
      ) : null}
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-card-foreground">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({
  title,
  description,
  rows = 3,
  className,
}: {
  title?: string;
  description?: string;
  rows?: number;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("space-y-4 rounded-xl border border-border bg-card p-6", className)}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-card-foreground">
            {title ?? t("states.loadingTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {description ?? t("states.loadingDescription")}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <StateView
      icon={Inbox}
      title={title ?? t("states.emptyTitle")}
      description={description ?? t("states.emptyDescription")}
      action={action}
      className={className}
    />
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <StateView
      icon={AlertTriangle}
      tone="danger"
      title={title ?? t("states.errorTitle")}
      description={description ?? t("states.errorDescription")}
      action={
        onRetry ? (
          <Button onClick={onRetry} className="min-h-11">
            {t("common.retry")}
          </Button>
        ) : null
      }
      className={className}
    />
  );
}

export function UnauthorizedState({
  title,
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <StateView
      icon={ShieldOff}
      tone="warning"
      title={title ?? t("states.unauthorizedTitle")}
      description={description ?? t("states.unauthorizedDescription")}
      action={action}
      className={className}
    />
  );
}

export function OfflineState({
  title,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <StateView
      icon={WifiOff}
      tone="warning"
      title={title ?? t("states.offlineTitle")}
      description={description ?? t("states.offlineDescription")}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry} className="min-h-11">
            {t("common.retry")}
          </Button>
        ) : null
      }
      className={className}
    />
  );
}

/** Tracks browser connectivity; always true during SSR. */
export function useOnlineStatus() {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/**
 * Declarative wrapper that renders the right state for an async resource.
 */
export function AsyncBoundary({
  isLoading,
  isError,
  isUnauthorized,
  isEmpty,
  onRetry,
  loadingFallback,
  children,
}: {
  isLoading?: boolean;
  isError?: boolean;
  isUnauthorized?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingFallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const online = useOnlineStatus();

  if (!online) return <OfflineState onRetry={onRetry} />;
  if (isUnauthorized) return <UnauthorizedState />;
  if (isLoading) return <>{loadingFallback ?? <LoadingState />}</>;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (isEmpty) return <EmptyState />;
  return <>{children}</>;
}
