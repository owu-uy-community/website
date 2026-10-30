"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bot, MessagesSquare, MonitorPlay, Radio, Sparkles, Webhook, type LucideIcon } from "lucide-react";

import { SettingsSection } from "components/Admin/settings/settings";
import { Panel } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { StatusDot, useRealtimeStatus } from "components/Admin/ui/status";
import { formatRelative, useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { orpc } from "lib/orpc";

type State = { tone: "ok" | "warn" | "off" | "live"; label: string };

const BADGE = { ok: "success", warn: "warning", off: "secondary", live: "destructive" } as const;

function Integration({
  icon: Icon,
  name,
  detail,
  state,
  action,
}: {
  icon: LucideIcon;
  name: string;
  detail: ReactNode;
  state: State;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-[10px] border border-border bg-background px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-raised ring-1 ring-border">
        <Icon aria-hidden className="size-4 text-subtle" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-ui font-medium text-foreground">{name}</p>
        <p className="text-meta break-words text-muted-foreground">{detail}</p>
      </div>
      <Badge className="max-sm:hidden" variant={BADGE[state.tone]}>
        {state.tone === "ok" ? <StatusDot tone="ok" /> : null}
        {state.label}
      </Badge>
      <StatusDot
        className="sm:hidden"
        tone={state.tone === "ok" ? "ok" : state.tone === "warn" ? "warn" : state.tone === "live" ? "live" : "idle"}
      />
      {action}
    </li>
  );
}

/**
 * What the event leans on, and whether each one is there: the OBS rig, Owy's channels, the AI
 * Gateway, the realtime socket and the Eventbrite webhook. Read-only: the switches live in the
 * deployment's environment, so this says what is missing, never what a key is.
 */
export function IntegrationsSection({ communicationHref }: { communicationHref: string }) {
  const integrations = useQuery(orpc.system.integrations.queryOptions({ staleTime: 60_000 }));
  const obs = useQuery(orpc.obsControl.status.queryOptions({ input: { instanceId: 1 }, refetchInterval: 15_000 }));
  const socket = useRealtimeStatus();
  const now = useNow(15_000);

  if (integrations.isError) {
    return (
      <SettingsSection id="integraciones" title="Integraciones">
        <ErrorState
          retrying={integrations.isFetching}
          title="No se pudo leer el estado de las integraciones"
          onRetry={() => void integrations.refetch()}
        />
      </SettingsSection>
    );
  }

  const config = integrations.data;
  const rig = obs.data;
  const missing = (names: string) => `Falta ${names}`;

  const obsState: State = !rig
    ? { tone: "off", label: obs.isError ? "sin datos" : "…" }
    : rig.connected
      ? { tone: "ok", label: rig.streaming ? "transmitiendo" : "conectado" }
      : rig.executorOnline
        ? { tone: "warn", label: "sin OBS" }
        : { tone: "off", label: "sin ejecutor" };
  const obsDetail = !rig
    ? obs.isError
      ? "No se pudo leer el estado del equipo"
      : "Leyendo el estado del equipo…"
    : rig.connected
      ? `Al aire: ${rig.programScene ?? "—"}${rig.recording ? " · grabando" : ""}`
      : rig.executorOnline
        ? "Hay una pestaña ejecutora, pero no llega a OBS"
        : rig.statusAt && now
          ? `Nadie lo tiene abierto · última vez ${formatRelative(new Date(rig.statusAt).getTime() - now)}`
          : "Nadie lo conectó todavía";

  return (
    <SettingsSection id="integraciones" title="Integraciones">
      <Panel className="p-3">
        {config ? (
          <ul className="space-y-2">
            <Integration
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/screen">Abrir</Link>
                </Button>
              }
              detail={obsDetail}
              icon={MonitorPlay}
              name="OBS"
              state={obsState}
            />
            <Integration
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href={communicationHref}>Mensajes</Link>
                </Button>
              }
              detail={
                config.owy.telegram
                  ? "Canal de los asistentes"
                  : missing("TELEGRAM_BOT_TOKEN u OWY_ANNOUNCE_TELEGRAM_CHAT_ID")
              }
              icon={Bot}
              name="Owy en Telegram"
              state={
                config.owy.telegram ? { tone: "ok", label: "conectado" } : { tone: "warn", label: "sin configurar" }
              }
            />
            <Integration
              detail={
                config.owy.slack
                  ? config.owy.staffDm
                    ? "Canal de la comunidad y mensajes directos al staff"
                    : "Canal de la comunidad"
                  : config.owy.staffDm
                    ? "Solo mensajes directos: falta OWY_ANNOUNCE_SLACK_CHANNEL_ID"
                    : missing("OWY_SLACK_BOT_TOKEN")
              }
              icon={MessagesSquare}
              name="Owy en Slack"
              state={
                config.owy.slack
                  ? { tone: "ok", label: "conectado" }
                  : { tone: "warn", label: config.owy.staffDm ? "a medias" : "sin configurar" }
              }
            />
            <Integration
              detail={
                config.ai.configured
                  ? "Lectura de tarjetas y «Sugerir con IA»"
                  : `${missing("AI_GATEWAY_API_KEY")} (en Vercel alcanza con OIDC)`
              }
              icon={Sparkles}
              name="IA (AI Gateway)"
              state={
                config.ai.configured ? { tone: "ok", label: "conectada" } : { tone: "warn", label: "sin configurar" }
              }
            />
            <Integration
              detail={
                config.realtime.redis
                  ? "Redis reparte los avisos entre servidores"
                  : config.realtime.sidecar
                    ? "Servidor local de desarrollo"
                    : "Sin Redis: cada aviso llega solo a quienes comparten servidor"
              }
              icon={Radio}
              name="Tiempo real"
              state={
                socket === "open"
                  ? config.realtime.redis || config.realtime.sidecar
                    ? { tone: "ok", label: "conectado" }
                    : { tone: "warn", label: "sin Redis" }
                  : socket === "connecting"
                    ? { tone: "warn", label: "reconectando" }
                    : { tone: "live", label: "sin conexión" }
              }
            />
            <Integration
              detail={
                config.eventbrite.webhookSecret
                  ? "Eventbrite avisa al instante las compras y los check-ins"
                  : missing("EVENTBRITE_WEBHOOK_SECRET")
              }
              icon={Webhook}
              name="Webhook de Eventbrite"
              state={
                config.eventbrite.webhookSecret
                  ? { tone: "ok", label: "configurado" }
                  : { tone: "off", label: "sin configurar" }
              }
            />
          </ul>
        ) : (
          <div aria-hidden className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[54px] w-full rounded-[10px]" />
            ))}
          </div>
        )}
      </Panel>
    </SettingsSection>
  );
}
