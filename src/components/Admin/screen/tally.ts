import { cn } from "app/lib/utils";

/**
 * The only place red and green mean something: red = on air (program),
 * green = next (preview), amber pulse = sent to OBS, not confirmed yet.
 */
export type Tally = "program" | "preview" | "pending" | "none";

export function tallyOf(
  name: string,
  { program, preview, pending }: { program: string; preview: string; pending: Record<string, number> }
): Tally {
  if (pending[`program:${name}`] !== undefined || pending[`preview:${name}`] !== undefined) return "pending";
  if (name === program) return "program";
  if (name === preview) return "preview";

  return "none";
}

export function tallyClass(tally: Tally, extra?: string): string {
  return cn(
    "border-2 transition-colors",
    tally === "program" && "border-red-500 bg-red-500/15 text-red-50 shadow-[0_0_0_1px_rgba(239,68,68,.4)]",
    tally === "preview" && "border-green-500 bg-green-500/10 text-green-50",
    tally === "pending" && "animate-pulse border-amber-400 bg-amber-400/10 text-amber-50",
    tally === "none" && "border-border bg-card text-foreground hover:border-muted-foreground/50 hover:bg-accent",
    extra
  );
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
