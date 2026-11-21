"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, RotateCw, ScanEye, Trash2, TvMinimal } from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog } from "components/Admin/panel";
import { PageContainer, PageHeader, Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { RelativeTime, useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { screenLabel, type Screen } from "lib/orpc/screens/schemas";
import { eventChannel } from "lib/realtime/channels";

type EventRef = { id: string; name: string; slug: string; communitySlug: string };

/** A screen that dropped this recently is news; one that's been off since yesterday is not. */
const RECENT_MS = 15 * 60_000;
/** How long a display shows its name after Identificar (the display's own timer). */
const IDENTIFY_MS = 5_000;

const nameOf = (screen: Screen) => screen.name || "sin nombre";

function ScreenCard({ screen, eventId }: { screen: Screen; eventId: string }) {
  const queryClient = useQueryClient();
  const listKey = orpc.screens.list.queryKey({ input: { eventId } });
  const now = useNow(15_000);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [identifiedAt, setIdentifiedAt] = useState(0);

  useEffect(() => {
    if (!identifiedAt) return;
    const timer = setTimeout(() => setIdentifiedAt(0), IDENTIFY_MS);
    return () => clearTimeout(timer);
  }, [identifiedAt]);

  const fail = (title: string) => (error: Error) => toast.error(title, error.message);
  const identify = useMutation(
    orpc.screens.identify.mutationOptions({
      onSuccess: () => setIdentifiedAt(Date.now()),
      onError: fail("No se pudo identificar"),
    })
  );
  const reload = useMutation(
    orpc.screens.reload.mutationOptions({
      onSuccess: () => toast.success(`Recargando «${nameOf(screen)}»`, "Vuelve en unos segundos."),
      onError: fail("No se pudo recargar"),
    })
  );
  const rename = useMutation(
    orpc.screens.rename.mutationOptions({
      onSuccess: (renamed) =>
        queryClient.setQueryData<Screen[]>(listKey, (list) =>
          list?.map((item) => (item.id === renamed.id ? renamed : item))
        ),
      onError: fail("No se pudo renombrar"),
    })
  );
  const forget = useMutation(
    orpc.screens.forget.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        queryClient.setQueryData<Screen[]>(listKey, (list) => list?.filter((item) => item.id !== screen.id));
      },
      onError: fail("No se pudo olvidar"),
    })
  );

  const save = (value: string) => {
    setEditing(false);
    const name = value.trim();
    if (name && name !== screen.name) rename.mutate({ id: screen.id, name });
  };
  const recentlyLost = !screen.online && now > 0 && now - Date.parse(screen.lastSeenAt) < RECENT_MS;
  const offlineHint = screen.online ? undefined : "Sin conexión: no la va a recibir";

  return (
    <Panel aria-label={screen.name || "Pantalla sin nombre"} className="flex flex-col">
      <div className="flex items-start gap-3 px-3.5 pt-3 pb-2.5">
        <StatusDot className="mt-[7px]" ring={screen.online} tone={screen.online ? "ok" : "idle"} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              aria-label="Nombre de la pantalla"
              autoFocus
              className="-my-1 sm:h-8"
              enterKeyHint="done"
              defaultValue={screen.name}
              maxLength={60}
              placeholder="Kiosco · Lobby"
              onBlur={(event) => save(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save(event.currentTarget.value);
                if (event.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <button
              className={cn(
                // A finger gets the row's height; the layout stays as it was.
                "block max-w-full truncate rounded-sm text-left text-ui font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/70 pointer-coarse:-my-3 pointer-coarse:py-3",
                !screen.name && "text-muted-foreground italic"
              )}
              title="Renombrar"
              type="button"
              onClick={() => setEditing(true)}
            >
              {screen.name || "Sin nombre"}
            </button>
          )}
          <p className="mt-0.5 truncate text-meta text-muted-foreground">{screen.label}</p>
        </div>
        {screen.online ? (
          <span className="shrink-0 font-terminal text-meta text-muted-foreground">en línea</span>
        ) : (
          // Said on screen, not only in the titles: why Identificar and Recargar are off.
          <span className="shrink-0 font-terminal text-meta whitespace-nowrap text-muted-foreground">
            sin conexión ·{" "}
            <RelativeTime className={cn(recentlyLost && "text-warning-foreground")} date={screen.lastSeenAt} />
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center gap-1.5 border-t border-border px-2.5 py-2">
        <Button
          disabled={!screen.online || identify.isPending || identifiedAt > 0}
          size="sm"
          title={offlineHint ?? "Muestra su nombre a pantalla completa por 5 segundos"}
          variant="outline"
          onClick={() => identify.mutate({ id: screen.id })}
        >
          <ScanEye />
          {identifiedAt ? "En pantalla…" : "Identificar"}
        </Button>
        <Button
          disabled={!screen.online || reload.isPending}
          size="sm"
          title={offlineHint ?? "La pantalla se recarga sola"}
          variant="outline"
          onClick={() => reload.mutate({ id: screen.id })}
        >
          <RotateCw className={cn(reload.isPending && "animate-spin")} />
          Recargar
        </Button>
        <span
          className="min-w-0 flex-1 truncate text-right font-terminal text-2xs text-muted-foreground"
          title={screen.userAgent}
        >
          {screen.id}
        </span>
        <Button
          aria-label="Renombrar"
          size="icon-sm"
          title="Renombrar"
          variant="ghost"
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </Button>
        <Button aria-label="Olvidar" size="icon-sm" title="Olvidar" variant="ghost" onClick={() => setConfirming(true)}>
          <Trash2 />
        </Button>
      </div>
      <ConfirmDialog
        confirmLabel="Olvidar"
        description="Sale de la lista. Si sigue prendida, vuelve a aparecer sin nombre con su próximo latido."
        open={confirming}
        pending={forget.isPending}
        title={`¿Olvidar «${nameOf(screen)}»?`}
        onConfirm={() => forget.mutate({ id: screen.id })}
        onOpenChange={setConfirming}
      />
    </Panel>
  );
}

/** Where to point a TV so it shows up here. */
function displayLinks(event: EventRef) {
  const base = `/comunidad/${event.communitySlug}/events/${event.slug}`;

  return [`${base}/kiosk`, `${base}/kiosk/map`, `${base}/stickynote`, `${base}/countdown`, "/owy/stage"].map(
    (path) => ({ path, label: screenLabel(path) ?? path })
  );
}

function ScreenGrid({ event }: { event: EventRef }) {
  const queryClient = useQueryClient();
  const query = useQuery(orpc.screens.list.queryOptions({ input: { eventId: event.id }, refetchInterval: 15_000 }));
  // Renames and forgets ping the event; beats don't (too chatty), so the poll keeps "en línea" fresh.
  useRealtimeChannel(eventChannel(event.id, "ops"), (topic) => {
    if (topic === "screens") void queryClient.invalidateQueries({ queryKey: orpc.screens.list.key() });
  });

  const screens = query.data ?? [];
  const online = screens.filter((screen) => screen.online).length;
  const unnamed = screens.filter((screen) => !screen.name).length;

  return (
    <>
      <PageHeader
        description="Cada pantalla del lugar, qué muestra y si sigue viva. Identificá cuál es cuál y recargala desde acá."
        meta={
          query.data && screens.length > 0 ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-terminal text-meta text-muted-foreground tabular-nums">
                <StatusDot tone={online === screens.length ? "ok" : online > 0 ? "warn" : "idle"} />
                {online} de {screens.length} en línea
              </span>
              {unnamed > 0 && (
                <Badge variant="warning">{unnamed === 1 ? "1 sin nombre" : `${unnamed} sin nombre`}</Badge>
              )}
            </>
          ) : null
        }
        title="Pantallas"
      />
      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[109px] rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          retrying={query.isFetching}
          title="No se pudieron cargar las pantallas"
          onRetry={() => void query.refetch()}
        />
      ) : screens.length === 0 ? (
        <EmptyState
          action={displayLinks(event).map((link) => (
            <Button key={link.path} asChild size="sm" variant="outline">
              <a href={link.path} rel="noreferrer" target="_blank">
                {link.label}
                <ExternalLink />
              </a>
            </Button>
          ))}
          description="Abrí el kiosco, el mapa, la cuenta regresiva o la pared en la pantalla del lugar: aparece acá sola en unos segundos."
          icon={TvMinimal}
          title="Todavía no se conectó ninguna pantalla"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {screens.map((screen) => (
            <ScreenCard key={screen.id} eventId={event.id} screen={screen} />
          ))}
        </div>
      )}
    </>
  );
}

export default function ScreensClient({ event, communityName }: { event: EventRef | null; communityName: string }) {
  return (
    <PageContainer>
      {event ? (
        <ScreenGrid event={event} />
      ) : (
        <>
          <PageHeader title="Pantallas" />
          <EmptyState
            description={`${communityName} todavía no tiene eventos: las pantallas se agrupan por evento.`}
            icon={TvMinimal}
            title="Sin eventos"
          />
        </>
      )}
    </PageContainer>
  );
}
