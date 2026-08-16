import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** إطار موحّد لكل العارضين: خلفية بيضاء، حدود خفيفة، شريط أدوات علوي. */
export function ViewerFrame({
  toolbar,
  side,
  children,
  className,
}: {
  toolbar?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="space-y-3">
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div
          className={cn(
            "relative h-[360px] w-full overflow-hidden rounded-xl border border-border bg-white sm:h-[440px]",
            className,
          )}
        >
          {children}
        </div>
        {side ? <div className="min-w-0 lg:w-56">{side}</div> : null}
      </div>
    </div>
  );
}

export function ViewerMessage({
  tone = "muted",
  title,
  body,
  action,
}: {
  tone?: "muted" | "error";
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
      <p
        className={cn(
          "text-sm font-medium",
          tone === "error" ? "text-destructive" : "text-foreground",
        )}
      >
        {title}
      </p>
      {body ? <p className="max-w-sm text-xs text-muted-foreground">{body}</p> : null}
      {action ? (
        <Button variant="outline" className="mt-1 min-h-11" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
