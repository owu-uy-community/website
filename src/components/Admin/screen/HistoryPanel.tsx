"use client";

import { useQuery } from "@tanstack/react-query";

import { formatClock } from "components/Admin/ui/time";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { orpc } from "lib/orpc/client";
import type { SerializedCommand } from "lib/orpc/obs-control/schemas";

const STATUS: Record<SerializedCommand["status"], { label: string; variant: BadgeProps["variant"] }> = {
  pending: { label: "en cola", variant: "warning" },
  done: { label: "hecho", variant: "success" },
  failed: { label: "falló", variant: "destructive" },
  skipped: { label: "salteado", variant: "secondary" },
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
      return `Estudio ${p.enabled ? "activado" : "desactivado"}`;
    case "transition":
      return `Transición ${String(p.name ?? "")} ${p.durationMs != null ? `${String(p.durationMs)} ms` : ""}`.trim();
    case "mute":
      return `${p.muted === undefined ? "Silenciar o activar" : p.muted ? "Silenciar" : "Activar"} ${String(p.inputName)}`;
    case "volume":
      return `${String(p.inputName)} → ${String(p.db)} dB`;
    case "stream":
    case "record":
      return `${command.type === "stream" ? "Stream" : "Grabación"}: ${ACTION[String(p.action)] ?? String(p.action)}`;
    default:
      return command.type;
  }
}

const ACTION: Record<string, string> = { start: "empezar", stop: "detener", toggle: "alternar" };

/** The last commands on the bus: who asked, what, and whether OBS did it. */
export function HistoryPanel({ instanceId }: { instanceId: number }) {
  const { data } = useQuery(
    orpc.obsControl.history.queryOptions({ input: { instanceId, limit: 50 }, refetchInterval: 5_000 })
  );

  if (!data?.length) return <p className="text-meta text-muted-foreground">Todavía no hay comandos.</p>;

  return (
    <ul className="divide-y divide-border text-ui">
      {data.map((command) => (
        <li key={command.id} className="flex items-center gap-3 py-1.5">
          <span className="w-16 shrink-0 font-terminal text-meta text-muted-foreground tabular-nums">
            {formatClock(new Date(command.createdAt), undefined, true)}
          </span>
          {/* The whole error, wrapped: a touchscreen never shows the title. */}
          <span className="min-w-0 flex-1 break-words">
            {describe(command)}
            {command.error && <span className="ml-2 text-meta text-live-foreground">{command.error}</span>}
          </span>
          <span className="hidden shrink-0 font-terminal text-meta text-muted-foreground sm:inline">
            {command.source}
          </span>
          <Badge className="shrink-0" variant={STATUS[command.status].variant}>
            {STATUS[command.status].label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
