"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { cn } from "app/lib/utils";
import { getRealtimeClient, type RealtimeStatus } from "lib/realtime/client";

export type Tone = "ok" | "warn" | "live" | "info" | "brand" | "idle";

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  live: "bg-live",
  info: "bg-info-foreground",
  brand: "bg-primary",
  idle: "bg-faint",
};

const RING: Record<Tone, string> = {
  ok: "shadow-[0_0_0_3px_hsl(var(--success)/0.16)]",
  warn: "shadow-[0_0_0_3px_hsl(var(--warning)/0.16)]",
  live: "shadow-[0_0_0_3px_hsl(var(--live)/0.18)]",
  info: "shadow-[0_0_0_3px_hsl(var(--info-foreground)/0.16)]",
  brand: "shadow-[0_0_0_3px_hsl(var(--primary)/0.16)]",
  idle: "",
};

/**
 * A 6px status dot. `pulse` is only for "this needs you" (on air, an unacknowledged urgent
 * announcement): a stepped blink, never a continuous animation, and off for reduced motion.
 */
export function StatusDot({
  tone,
  pulse = false,
  ring = false,
  className,
}: {
  tone: Tone;
  pulse?: boolean;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        DOT[tone],
        ring && RING[tone],
        pulse && "motion-safe:animate-blink-step",
        className
      )}
    />
  );
}

/** "● EN VIVO" in the mono label style. */
export function LiveLabel({ children = "En vivo", className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-terminal text-2xs tracking-[0.14em] text-live-foreground uppercase",
        className
      )}
    >
      <StatusDot pulse ring tone="live" />
      {children}
    </span>
  );
}

function subscribeStatus(listener: () => void) {
  return getRealtimeClient().onStatusChange(listener);
}
const statusSnapshot = () => getRealtimeClient().getStatus();
const serverStatus = (): RealtimeStatus => "connecting";

/** The page's realtime socket, as one value shared by every reader. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeStatus, statusSnapshot, serverStatus);
}

/**
 * The one connection indicator. A blip shorter than 4 s (Vercel recycles sockets every few
 * minutes) shows as "Reconectando…", never as an outage.
 */
export function ConnectionPill({ className }: { className?: string }) {
  const status = useRealtimeStatus();
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (status === "open") {
      setDown(false);
      return;
    }
    const timer = setTimeout(() => setDown(true), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  const view =
    status === "open"
      ? { tone: "ok" as const, label: "Tiempo real", hint: "Los cambios llegan al instante" }
      : down
        ? { tone: "live" as const, label: "Sin conexión", hint: "Lo que ves puede estar desactualizado" }
        : { tone: "warn" as const, label: "Reconectando…", hint: "Reconectando con el servidor" };

  return (
    <span
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5 text-meta whitespace-nowrap text-muted-foreground", className)}
      title={view.hint}
    >
      <StatusDot ring tone={view.tone} />
      {/* Phones show only the dot while all is well; a problem says so in words (color alone is easy to miss). */}
      <span className={cn(view.tone === "ok" && "max-md:sr-only")}>{view.label}</span>
    </span>
  );
}
