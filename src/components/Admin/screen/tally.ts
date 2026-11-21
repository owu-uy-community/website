import { cn } from "app/lib/utils";

/**
 * The switcher's colours, one set for both desks (OBS and Escenas), as broadcast does it:
 * program = on air (live red), preview = up next (green), pending = sent and not confirmed yet
 * (warning). The rest of the switcher stays out of these: TAKE is the view's one yellow action
 * and CUT is a neutral button.
 */
export type Tally = "program" | "preview" | "pending" | "none";

export const TALLY = {
  program: {
    ring: "ring-live",
    border: "border-live",
    surface: "bg-live-surface",
    text: "text-live-foreground",
    dot: "bg-live",
    chip: "border border-live/40 bg-live-surface text-live-foreground",
  },
  preview: {
    ring: "ring-success",
    border: "border-success",
    surface: "bg-success-surface",
    text: "text-success-foreground",
    dot: "bg-success",
    chip: "border border-success/40 bg-success-surface text-success-foreground",
  },
  pending: {
    ring: "ring-warning",
    border: "border-warning",
    surface: "bg-warning-surface",
    text: "text-warning-foreground",
    dot: "bg-warning",
    chip: "border border-warning/40 bg-warning-surface text-warning-foreground",
  },
} as const;

export function tallyOf(
  name: string,
  { program, preview, pending }: { program: string; preview: string; pending: Record<string, number> }
): Tally {
  if (pending[`program:${name}`] !== undefined || pending[`preview:${name}`] !== undefined) return "pending";
  if (name === program) return "program";
  if (name === preview) return "preview";

  return "none";
}

/** A scene card on the bus: its tally as a 2px frame on a tinted surface. */
export function tallyClass(tally: Tally, extra?: string): string {
  return cn(
    "border-2 transition-colors",
    tally === "none"
      ? "border-border bg-card text-foreground hover:border-input hover:bg-raised"
      : [TALLY[tally].border, TALLY[tally].surface],
    tally === "pending" && "motion-safe:animate-pulse",
    extra
  );
}

/** A small uppercase tally label ("Al aire", "Preview"), tinted like the frame it sits on. */
export const tallyChip = (tally: Exclude<Tally, "none">, extra?: string) =>
  cn(
    "rounded-sm px-1.5 py-0.5 font-terminal text-3xs font-semibold tracking-[0.12em] uppercase",
    TALLY[tally].chip,
    extra
  );

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
