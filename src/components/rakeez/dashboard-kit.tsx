import * as React from "react";
import { RefreshCw, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Phase 20 visual kit — the shared presentation language for the unified
 * project page, the dashboard and every platform-admin screen.
 *
 * Every colour here comes from a design token; no raw hex values.
 */

/* ------------------------------------------------------------------ hero */

/**
 * Page header. White surface, charcoal title, a single thin identity-green
 * rule — no large colour fields, no gradients (Phase 29 visual brief).
 * `aside` carries the one primary action of the screen.
 */
export function PageHero({
  title,
  subtitle,
  badge,
  aside,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border pb-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-primary" />
            <h1 className="min-w-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
          {children}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </header>
  );
}

/** Small status pill sitting next to the page title on a white surface. */
export function HeroBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "bg-secondary text-muted-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------- progress ring */

export function ProgressRing({
  value,
  size = 128,
  label,
  onDark = false,
}: {
  value: number;
  size?: number;
  label?: string;
  onDark?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = Math.max(8, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "نسبة الاكتمال"}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={onDark ? "stroke-primary-foreground/20" : "stroke-muted"}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            onDark ? "stroke-primary-foreground" : "stroke-primary",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "text-2xl font-bold tabular-nums",
            onDark ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {pct}%
        </span>
        {label ? (
          <span
            className={cn(
              "mt-0.5 text-[11px]",
              onDark ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- stat cards */

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "info";
}) {
  const tones = {
    primary: "bg-secondary text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-elevated">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", tones[tone])}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
      {hint ? <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
  );
}

/* -------------------------------------------------------- section cards */

export function SectionCard({
  icon: Icon,
  title,
  count,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  count?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-card transition-all duration-200 hover:border-primary/30 hover:shadow-elevated",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-primary"
          >
            <Icon className="size-4.5" />
          </span>
          <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
          {count !== undefined && count !== null ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Two-column key/value grid used inside section cards. */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** Designed empty state used inside section cards. */
export function SoftEmpty({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/50 px-4 py-8 text-center">
      <Icon className="size-8 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ skeletons */

export function CardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" role="status">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- hero actions */

/**
 * Unified secondary hero action: re-fetch the screen's data.
 * Presentational only — the caller owns the query.
 */
export function RefreshAction({
  onRefresh,
  busy = false,
  label = "تحديث",
}: {
  onRefresh: () => void;
  busy?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary disabled:opacity-60"
    >
      <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden="true" />
      {busy ? "جارٍ التحديث…" : label}
    </button>
  );
}
