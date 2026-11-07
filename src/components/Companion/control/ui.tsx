import type * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";

export type Options<T extends string> = readonly (readonly [T, string])[];

/** A few choices side by side; the current one outlined. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: Options<T>;
  value: T | undefined;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map(([option, text]) => (
        <Button
          key={option}
          aria-pressed={value === option}
          className={value === option ? "ring-1 ring-primary/40" : undefined}
          disabled={disabled}
          size="sm"
          variant={value === option ? "outline" : "ghost"}
          onClick={() => value !== option && onChange(option)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}

/** A mono label on the left, its controls next to it. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 font-terminal text-2xs tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** The Mac's input or output as the bridge reports it (HostMicSchema / HostSpeakerSchema health). */
const HEALTH: Record<string, [NonNullable<BadgeProps["variant"]>, string]> = {
  open: ["success", "abierto"],
  starting: ["secondary", "abriendo…"],
  off: ["outline", "apagado"],
  "no-signal": ["warning", "sin señal"],
  gone: ["destructive", "no está"],
  unavailable: ["outline", "no disponible"],
};

export function Health({
  icon: Icon,
  label,
  health,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  health?: string;
  detail?: string;
}) {
  const [variant, text] = (health && HEALTH[health]) || ["outline", health ?? "sin datos"];

  return (
    <div className="flex flex-wrap items-center gap-2 text-meta">
      <Icon aria-hidden className="size-3.5 text-muted-foreground" />
      <span className="text-foreground">{label}</span>
      <Badge variant={variant}>{text}</Badge>
      {detail ? <span className="text-muted-foreground">{detail}</span> : null}
    </div>
  );
}
