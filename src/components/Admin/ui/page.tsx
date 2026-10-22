import type * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";

const WIDTHS = {
  small: "max-w-3xl",
  default: "max-w-[1200px]",
  large: "max-w-[1600px]",
  full: "max-w-none",
} as const;

/** Every admin page sits in one of four widths, with the same gutters. */
export function PageContainer({
  size = "default",
  className,
  children,
}: {
  size?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto w-full px-4 pt-5 pb-10 md:px-6", WIDTHS[size], className)}>{children}</div>;
}

/**
 * Title row of a page: the title with its status chips, an optional line under it, and the
 * page's actions on the right (one of them primary).
 */
export function PageHeader({
  title,
  meta,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Chips and mono facts next to the title. */
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="font-display text-[22px] leading-7 font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h1>
          {meta}
        </div>
        {description ? <p className="mt-1 max-w-2xl text-ui text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Uppercase mono micro label: section names, column groups, KPI captions. */
export function MicroLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "font-terminal text-[10.5px] leading-3 tracking-[0.14em] text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </span>
  );
}

/** The bar on top of a card: icon, title, a mono fact, and actions pushed right. */
export function PanelHead({
  icon: Icon,
  title,
  meta,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b border-border px-3.5", className)}>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
      {/* Titles are short and name the card: the meta gives way first. */}
      <h2 className="shrink-0 text-ui font-semibold text-foreground">{title}</h2>
      {meta ? (
        <span className="truncate font-terminal text-meta text-muted-foreground tabular-nums">{meta}</span>
      ) : null}
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/** A card with the admin's surface; `PanelHead` on top, rows or content inside. */
export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section
      className={cn("min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-edge", className)}
      {...props}
    >
      {children}
    </section>
  );
}

/** A thin progress bar (4px), for coverage, acks, time left. */
export function Meter({
  value,
  max = 100,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "live" | "info";
  className?: string;
  /** Accessible name; the bar is a progressbar when given one. */
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    live: "bg-live",
    info: "bg-info-foreground",
  }[tone];

  return (
    <div
      aria-label={label}
      aria-valuemax={label ? max : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuenow={label ? value : undefined}
      className={cn("h-1 overflow-hidden rounded-full bg-white/[0.06]", className)}
      role={label ? "progressbar" : undefined}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
