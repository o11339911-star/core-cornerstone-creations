import * as React from "react";
import { Check, Circle, CircleDot, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type TimelineStatus = "done" | "current" | "upcoming" | "failed";

export type TimelineItem = {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode | undefined;
  meta?: React.ReactNode | undefined;
  status?: TimelineStatus | undefined;
};

const statusStyles: Record<TimelineStatus, { dot: string; icon: React.ElementType }> = {
  done: { dot: "bg-success text-success-foreground border-success", icon: Check },
  current: { dot: "bg-accent text-accent-foreground border-accent", icon: CircleDot },
  upcoming: { dot: "bg-muted text-muted-foreground border-border", icon: Circle },
  failed: { dot: "bg-destructive text-destructive-foreground border-destructive", icon: X },
};

/**
 * Vertical timeline for project phases / correspondence history.
 * Uses logical properties so the rail flips automatically in RTL.
 */
export function Timeline({
  items,
  className,
}: {
  items: TimelineItem[];
  className?: string | undefined;
}) {
  return (
    <ol className={cn("relative space-y-6", className)}>
      {items.map((item, index) => {
        const status = item.status ?? "upcoming";
        const { dot, icon: Icon } = statusStyles[status];
        const isLast = index === items.length - 1;

        return (
          <li key={item.id} className="relative flex gap-4 ps-0">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border",
                  dot,
                )}
              >
                <Icon className="size-4" />
              </span>
              {!isLast ? <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" /> : null}
            </div>
            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-2")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                {item.meta ? (
                  <span className="text-xs text-muted-foreground">{item.meta}</span>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
