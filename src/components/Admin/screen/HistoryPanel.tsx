"use client";

import { useQuery } from "@tanstack/react-query";

import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import { orpc } from "lib/orpc/client";
import type { SerializedCommand } from "lib/orpc/obs-control/services";

const STATUS: Record<SerializedCommand["status"], string> = {
  pending: "border-amber-400/50 bg-amber-400/15 text-amber-100",
  done: "border-green-500/40 bg-green-500/15 text-green-200",
  failed: "border-red-500/50 bg-red-500/20 text-red-100",
  skipped: "border-border bg-muted text-muted-foreground",
};

function describe(command: SerializedCommand): string {
  const p = command.payload as Record<string, unknown>;
  switch (command.type) {
    case "scene":
      return `${p.cue ? `Cue ${p.cue}: ` : ""}${String(p.sceneName)} al aire`;
    case "preview":
      return `${String(p.sceneName)} a preview`;
    case "take":
      return "TAKE";
    case "cut":
      return "CUT";
    case "studio":
      return `Estudio ${p.enabled ? "on" : "off"}`;
    case "transition":
      return `Transición ${String(p.name ?? "")} ${p.durationMs != null ? `${String(p.durationMs)} ms` : ""}`.trim();
    case "mute":
      return `${p.muted === undefined ? "Toggle mute" : p.muted ? "Mute" : "Unmute"} ${String(p.inputName)}`;
    case "volume":
      return `${String(p.inputName)} → ${String(p.db)} dB`;
    case "stream":
    case "record":
      return `${command.type} ${String(p.action)}`;
    default:
      return command.type;
  }
}

/** The last commands on the bus: who asked, what, and whether OBS did it. */
export function HistoryPanel({ instanceId }: { instanceId: number }) {
  const { data } = useQuery(
    orpc.obsControl.history.queryOptions({ input: { instanceId, limit: 50 }, refetchInterval: 5_000 })
  );

  if (!data?.length) return <p className="text-muted-foreground text-xs">Todavía no hay comandos.</p>;

  return (
    <ul className="divide-border divide-y text-sm">
      {data.map((command) => (
        <li key={command.id} className="flex items-center gap-3 py-1.5">
          <span className="font-terminal text-muted-foreground w-16 shrink-0 text-xs">
            {new Date(command.createdAt).toLocaleTimeString("es-UY", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </span>
          <span className="min-w-0 flex-1 truncate" title={command.error ?? undefined}>
            {describe(command)}
            {command.error && <span className="ml-2 text-xs text-red-300">{command.error}</span>}
          </span>
          <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">{command.source}</span>
          <Badge className={cn("shrink-0", STATUS[command.status])} variant="outline">
            {command.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
