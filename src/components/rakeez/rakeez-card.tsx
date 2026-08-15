import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RakeezCardProps = {
  title?: React.ReactNode | undefined;
  description?: React.ReactNode | undefined;
  /** Rendered at the inline-end of the header (icon button, badge, menu…). */
  actions?: React.ReactNode | undefined;
  footer?: React.ReactNode | undefined;
  /** Adds the gold accent bar at the block-start edge. */
  accent?: boolean | undefined;
  interactive?: boolean | undefined;
  className?: string | undefined;
  contentClassName?: string | undefined;
  children?: React.ReactNode | undefined;
};

/** Unified Rakeez surface built on top of the shadcn Card primitive. */
export function RakeezCard({
  title,
  description,
  actions,
  footer,
  accent = false,
  interactive = false,
import {
  className,
  contentClassName,
  children,
}: RakeezCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-xl border-border shadow-sm",
        accent && "before:absolute before:inset-inline-0 before:top-0 before:h-1 before:bg-accent",
        interactive &&
          "transition-all hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        className,
      )}
    >
      {title || description || actions ? (
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            {title ? <CardTitle className="text-lg">{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </CardHeader>
      ) : null}
      {children ? <CardContent className={cn(contentClassName)}>{children}</CardContent> : null}
      {footer ? <CardFooter className="border-t border-border pt-4">{footer}</CardFooter> : null}
    </Card>
  );
}
