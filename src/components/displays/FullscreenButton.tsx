"use client";

import { Maximize2, Minimize2 } from "lucide-react";

import { cn } from "app/lib/utils";

/** Shared toggle for the agenda page and the venue kiosk. */
export function FullscreenButton({
  isFullscreen,
  onToggle,
  className,
  hideLabel,
}: {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const label = isFullscreen ? "Salir de pantalla completa" : "Ver en pantalla completa";

  return (
    <button
      aria-label={label}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-white/25 hover:text-white",
        className
      )}
      title={isFullscreen ? "Salir de pantalla completa (Esc)" : label}
      type="button"
      onClick={onToggle}
    >
      {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      {hideLabel ? null : <span className="hidden sm:inline">{isFullscreen ? "Salir" : "Pantalla completa"}</span>}
    </button>
  );
}
