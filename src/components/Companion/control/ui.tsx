import type * as React from "react";

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
