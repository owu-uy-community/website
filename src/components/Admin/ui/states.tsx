import type * as React from "react";
import Image from "next/image";
import { RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";

/**
 * Nothing to show. With `owy`, the carpincho takes the place of the icon: for the calm,
 * "all good" empties (no incidents, no pending acks), not for "something is missing".
 */
export function EmptyState({
  icon: Icon,
  owy = false,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  owy?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1 px-4 py-6" : "gap-1.5 rounded-lg border border-dashed border-input px-6 py-10",
        className
      )}
    >
      {owy ? (
        <Image
          alt=""
          className={cn(
            "mb-1 object-contain drop-shadow-[0_8px_20px_rgba(245,187,3,0.18)]",
            compact ? "size-12" : "size-20"
          )}
          height={160}
          src="/images/logos/carpincho.png"
          width={160}
        />
      ) : Icon ? (
        <span className="mb-1.5 flex size-9 items-center justify-center rounded-lg border border-input bg-raised shadow-edge">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
        </span>
      ) : null}
      <p className={cn("font-medium text-foreground", owy && !compact ? "font-display text-[15px]" : "text-ui")}>
        {title}
      </p>
      {description ? <p className="max-w-sm text-ui text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** A load that failed. Never render a failure as "no data". */
export function ErrorState({
  title = "No se pudo cargar",
  description = "Revisá la conexión y probá de nuevo.",
  onRetry,
  retrying = false,
  compact = false,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-live/25 bg-live-surface/60 text-left",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
        className
      )}
      role="alert"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0 text-live-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-foreground">{title}</p>
        {description ? <p className="text-meta text-muted-foreground">{description}</p> : null}
      </div>
      {onRetry ? (
        <Button disabled={retrying} size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className={cn(retrying && "animate-spin")} />
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
