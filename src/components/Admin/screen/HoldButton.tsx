"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";

/**
 * Press and hold to fire — for the two things you never want to hit by
 * accident on a tablet on show day (stop stream, stop recording). A ring fills
 * while held; letting go early cancels.
 */
export function HoldButton({
  holdMs = 1200,
  onHold,
  className,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { holdMs?: number; onHold: () => void }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const fired = useRef(false);

  const stop = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    startedAt.current = null;
    setProgress(0);
  };

  const start = () => {
    if (disabled) return;
    fired.current = false;
    startedAt.current = performance.now();
    const tick = (now: number) => {
      if (startedAt.current === null) return;
      const value = Math.min(1, (now - startedAt.current) / holdMs);
      setProgress(value);
      if (value >= 1) {
        if (!fired.current) {
          fired.current = true;
          onHold();
        }
        stop();

        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => stop, []);

  return (
    <Button
      className={cn("relative touch-none overflow-hidden select-none", className)}
      disabled={disabled}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={stop}
      onPointerDown={start}
      onPointerLeave={stop}
      onPointerUp={stop}
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 bg-white/25"
        style={{ width: `${progress * 100}%`, transition: progress === 0 ? "width 120ms" : undefined }}
      />
      <span className="relative">{children}</span>
    </Button>
  );
}
