"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Info, Keyboard, LogOut, Radio, RefreshCw, UserRound } from "lucide-react";

import { signOut } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { KeyHint, openShortcutSheet } from "components/Admin/shell/shortcuts";
import {
  SettingsCard,
  SettingsLayout,
  SettingsRow,
  SettingsSection,
  type SettingsSectionLink,
} from "components/Admin/settings/settings";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { ErrorState } from "components/Admin/ui/states";
import { StatusDot, useRealtimeStatus } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";

const SECTIONS: SettingsSectionLink[] = [
  { id: "cuenta", label: "Cuenta", icon: UserRound },
  { id: "tiempo-real", label: "Tiempo real", icon: Radio },
  { id: "atajos", label: "Atajos", icon: Keyboard },
  { id: "acerca", label: "Acerca de", icon: Info },
];

const ENVIRONMENT = {
  production: "Producción",
  preview: "Preview",
  development: "Desarrollo",
  local: "Local",
} as const;

const subscribeNothing = () => () => undefined;

/** True once in the browser: for what only the browser knows (the socket's address, ⌘ or Ctrl). */
function useInBrowser() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
}

/** Where this tab's socket goes, worked out the way the realtime client does it. */
function socketAddress() {
  const explicit = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "development") return `ws://${window.location.hostname}:3199`;

  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/realtime`;
}

/**
 * Round trip of one message over the page's socket: sent on a channel only this tab listens
 * to, timed when the server hands it back. Measured on open and on demand, never on a timer.
 */
function useSocketLatency() {
  const status = useRealtimeStatus();
  const channel = useMemo(() => `private:ping:${Math.random().toString(36).slice(2, 10)}`, []);
  const sentAt = useRef(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);

  const { publish } = useRealtimeChannel(
    channel,
    () => {
      setLatency(Math.round(performance.now() - sentAt.current));
      setMeasuring(false);
    },
    { receiveSelf: true }
  );

  const measure = useCallback(() => {
    sentAt.current = performance.now();
    setMeasuring(true);
    publish("ping", {});
  }, [publish]);

  useEffect(() => {
    if (status !== "open") return;
    const timer = setTimeout(measure, 400);
    return () => clearTimeout(timer);
  }, [status, measure]);

  // An answer that never came: the socket dropped in between.
  useEffect(() => {
    if (!measuring) return;
    const timer = setTimeout(() => setMeasuring(false), 5000);
    return () => clearTimeout(timer);
  }, [measuring]);

  return { status, latency, measuring, measure };
}

function RealtimeRows() {
  const inBrowser = useInBrowser();
  const { status, latency, measuring, measure } = useSocketLatency();
  const integrations = useQuery(orpc.system.integrations.queryOptions({ staleTime: 60_000 }));
  const realtime = integrations.data?.realtime;

  const connection =
    status === "open"
      ? { tone: "ok" as const, label: "Conectado", hint: "Los cambios de otras pantallas llegan al instante." }
      : status === "connecting"
        ? { tone: "warn" as const, label: "Conectando…", hint: "Reconectando con el servidor." }
        : { tone: "live" as const, label: "Sin conexión", hint: "Lo que ves puede estar desactualizado." };

  return (
    <SettingsCard>
      <SettingsRow compact hint={connection.hint} label="Conexión">
        <span aria-live="polite" className="flex items-center gap-2 text-ui text-foreground">
          <StatusDot ring tone={connection.tone} />
          {connection.label}
        </span>
      </SettingsRow>
      <SettingsRow compact hint="Ida y vuelta de un mensaje por el socket de esta pestaña." label="Latencia">
        <span className="flex items-center gap-2">
          <span className="min-w-14 text-right font-terminal text-ui text-foreground tabular-nums">
            {latency === null ? "—" : `${latency} ms`}
          </span>
          <Button
            aria-label="Medir la latencia de nuevo"
            disabled={status !== "open" || measuring}
            size="icon-sm"
            title="Medir de nuevo"
            variant="ghost"
            onClick={measure}
          >
            <RefreshCw className={cn(measuring && "motion-safe:animate-spin")} />
          </Button>
        </span>
      </SettingsRow>
      <SettingsRow compact hint="El servidor de sockets de esta pestaña." label="Servidor">
        <p
          className="max-w-[11rem] truncate font-terminal text-meta text-subtle sm:max-w-[18rem]"
          title={inBrowser ? socketAddress() : undefined}
        >
          {inBrowser ? socketAddress() : "—"}
        </p>
      </SettingsRow>
      <SettingsRow
        compact
        hint="Con más de un servidor, Redis reparte cada aviso entre todos."
        label="Entre servidores"
      >
        {integrations.isError ? (
          <Badge variant="warning">sin datos</Badge>
        ) : !realtime ? (
          <Skeleton className="h-5 w-24" />
        ) : realtime.redis ? (
          <Badge variant="success">
            <StatusDot tone="ok" />
            Redis
          </Badge>
        ) : realtime.sidecar ? (
          <Badge variant="info">sidecar local</Badge>
        ) : (
          <Badge variant="warning">sin Redis</Badge>
        )}
      </SettingsRow>
    </SettingsCard>
  );
}

const SHORTCUTS = [
  { keys: "mod+k", label: "Buscar o ejecutar cualquier cosa" },
  { keys: "?", label: "Ver todos los atajos" },
  { keys: "g h", label: "Ir a Hoy (G y una letra lleva a cada página)" },
  { keys: "mod+s", label: "Guardar, en las páginas de ajustes" },
];

export default function SettingsClient({ user }: { user: { name: string; email: string; image: string | null } }) {
  const router = useRouter();
  const inBrowser = useInBrowser();
  const integrations = useQuery(orpc.system.integrations.queryOptions({ staleTime: 60_000 }));
  const version = integrations.data?.version;
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    const { error } = await signOut();
    if (error) {
      setLeaving(false);
      toast.error("No se pudo cerrar la sesión", error.message ?? "Probá de nuevo en un rato.");
      return;
    }
    router.replace("/login");
  };

  return (
    <SettingsLayout label="Ajustes" sections={SECTIONS}>
      <PageContainer className="pb-10" size="small">
        <PageHeader description="Tu cuenta, la conexión en tiempo real y la versión del sitio." title="Ajustes" />

        <div className="space-y-7">
          <SettingsSection id="cuenta" title="Cuenta">
            <SettingsCard>
              <div className="flex items-center gap-3 border-b border-border py-4">
                <PersonAvatar image={user.image} name={user.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui font-medium text-foreground">{user.name}</p>
                  <p className="truncate font-terminal text-meta text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant="secondary">Staff del sitio</Badge>
              </div>
              <SettingsRow
                compact
                hint="Solo en este dispositivo. Para volver, entrás de nuevo con Slack."
                label="Cerrar sesión"
              >
                <Button disabled={leaving} size="sm" variant="outline" onClick={() => void leave()}>
                  <LogOut />
                  {leaving ? "Cerrando…" : "Cerrar sesión"}
                </Button>
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection id="tiempo-real" title="Tiempo real">
            <RealtimeRows />
          </SettingsSection>

          <SettingsSection id="atajos" title="Atajos">
            <SettingsCard>
              <ul className="divide-y divide-border">
                {SHORTCUTS.map((shortcut) => (
                  <li key={shortcut.keys} className="flex min-h-11 items-center justify-between gap-4 py-2">
                    <span className="text-ui text-subtle">{shortcut.label}</span>
                    {/* ⌘ or Ctrl is only known in the browser. */}
                    {inBrowser ? <KeyHint keys={shortcut.keys} /> : <span className="h-[18px]" />}
                  </li>
                ))}
              </ul>
              <SettingsRow
                compact
                hint="Cada página suma los suyos. No se activan mientras escribís."
                label="Todos los atajos"
              >
                <Button size="sm" variant="outline" onClick={openShortcutSheet}>
                  Ver atajos
                  <Kbd>?</Kbd>
                </Button>
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection id="acerca" title="Acerca de">
            {integrations.isError ? (
              <ErrorState
                retrying={integrations.isFetching}
                title="No se pudo leer la versión"
                onRetry={() => void integrations.refetch()}
              />
            ) : (
              <SettingsCard>
                <SettingsRow compact hint="El commit que está sirviendo este sitio." label="Versión">
                  {version ? (
                    <span
                      className="font-terminal text-ui text-foreground tabular-nums"
                      title={version.commit ?? undefined}
                    >
                      {version.commit ? version.commit.slice(0, 7) : "sin commit"}
                    </span>
                  ) : (
                    <Skeleton className="h-5 w-20" />
                  )}
                </SettingsRow>
                <SettingsRow compact hint="Dónde corre: producción, una preview o una copia local." label="Entorno">
                  {version ? (
                    <Badge variant={version.environment === "production" ? "success" : "secondary"}>
                      {ENVIRONMENT[version.environment]}
                    </Badge>
                  ) : (
                    <Skeleton className="h-5 w-20" />
                  )}
                </SettingsRow>
                <SettingsRow
                  compact
                  hint="La landing, los sponsors, los speakers y las ediciones pasadas. Se editan con Keystatic, en una copia local."
                  label="Contenido del sitio"
                >
                  <Button asChild size="sm" variant="outline">
                    <a href="/keystatic" rel="noreferrer" target="_blank">
                      Keystatic
                      <ArrowUpRight />
                    </a>
                  </Button>
                </SettingsRow>
              </SettingsCard>
            )}
          </SettingsSection>
        </div>
      </PageContainer>
    </SettingsLayout>
  );
}
