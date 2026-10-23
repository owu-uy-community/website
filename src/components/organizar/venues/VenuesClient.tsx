"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accessibility,
  Building2,
  CalendarClock,
  Check,
  CircleCheck,
  Clock,
  Info,
  Mic,
  Plus,
  Projector,
  Radio,
  Search,
  Send,
  TriangleAlert,
  UserX,
  Users,
  UtensilsCrossed,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { MicroLabel, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "components/shared/ui/sheet";
import { useSidebar } from "components/shared/ui/sidebar";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import { addDays, daysBetween } from "lib/calendar/holidays";
import { clockTime, dayKey, shortWhen } from "lib/community/time";
import { factLines } from "lib/organizar/venue-facts";
import { rotationLabel, SIZE_PEOPLE, type SizeBucket } from "lib/organizar/venue-fit";
import { plural } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";
import {
  AMENITIES,
  AMENITY_LABEL,
  AMENITY_SHORT,
  type Amenity,
  type RankedVenue,
  type Venue,
  type VenueRequest,
} from "lib/orpc/venues/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { HostRecapDialog } from "./HostRecapDialog";

const AMENITY_ICON: Record<Venue["amenities"][number], LucideIcon> = {
  proyector: Projector,
  microfono: Mic,
  wifi: Wifi,
  accesible: Accessibility,
  comida: UtensilsCrossed,
};
const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const SIZES = [
  { value: "0", label: "Todos" },
  { value: "30", label: "30+" },
  { value: "60", label: "60+" },
  { value: "120", label: "120+" },
];
/** Requests shown before "Ver todos" */
const FIRST_REQUESTS = 6;
const PLAN_B = "El Plan B recibe siempre, cuando ningún otro espacio puede: pedilo como cualquier otro.";

const STATUS: Record<
  VenueRequest["status"],
  { label: string; variant: "warning" | "success" | "secondary" | "destructive" }
> = {
  pending: { label: "Esperando respuesta", variant: "warning" },
  accepted: { label: "Aceptado", variant: "success" },
  declined: { label: "Esta vez no", variant: "destructive" },
  expired: { label: "Venció", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "secondary" },
  proposed: { label: "Propuso otra fecha", variant: "warning" },
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const hostDaysLabel = (days: number[]) =>
  days.length === 0
    ? "Cualquier día"
    : days
        .toSorted((a, b) => a - b)
        .map((day) => WEEKDAY_SHORT[day])
        .join(" · ");

/** "Casa de la Tecnología" → "CT": the first letters of the words that name it, not of "de" or "la". */
export function initials(name: string) {
  const words = name.split(/[\s·\-–]+/).filter(Boolean);
  const named = words.filter((word) => /^[\p{Lu}\p{N}]/u.test(word));

  return (named.length > 0 ? named : words)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/** The size a number of people means, to rank spaces for it */
const sizeFor = (people: number): SizeBucket =>
  people <= 30 ? "hasta-30" : people <= 60 ? "30-60" : people <= 120 ? "60-120" : "120+";

const noStore = () => () => undefined;
/** ⌘ on Apple, Ctrl elsewhere; null before hydration and on touch screens, where there's no keyboard to hint. */
function useSubmitHint() {
  return useSyncExternalStore(
    noStore,
    () =>
      window.matchMedia("(pointer: coarse)").matches
        ? null
        : /Mac|iPhone|iPad/.test(navigator.platform)
          ? "⌘↵"
          : "Ctrl+↵",
    () => null
  );
}

/** Spaces that host meetups, and asking one (or several at once) for a date. */
export function VenuesClient({ community, today }: { community: CalendarCommunity; today: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [size, setSize] = useState("0");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [asking, setAsking] = useState<Venue | "broadcast" | null>(null);

  const venues = useQuery(orpc.venues.list.queryOptions({ input: { communityId: community.id } }));
  const requests = useQuery(orpc.venues.requests.queryOptions({ input: { communityId: community.id } }));

  useShortcuts([
    {
      id: "venues.search",
      keys: "/",
      label: "Buscar espacio",
      group: "Espacios",
      run: (event) => {
        event.preventDefault();
        document.getElementById("venue-search")?.focus();
      },
    },
  ]);

  const visible = useMemo(() => {
    const needle = normalize(search.trim());

    return (venues.data ?? []).filter(
      (venue) =>
        (!needle || normalize(`${venue.name} ${venue.neighbourhood} ${venue.city}`).includes(needle)) &&
        (size === "0" || (venue.capacity ?? 0) >= Number(size)) &&
        amenities.every((amenity) => venue.amenities.includes(amenity as Venue["amenities"][number]))
    );
  }, [venues.data, search, size, amenities]);
  const pending = new Set(
    (requests.data ?? [])
      .filter((request) => request.status === "pending" || request.status === "proposed")
      .map((request) => request.venue.id)
  );
  const filtered = search.trim() !== "" || size !== "0" || amenities.length > 0;
  const clear = () => {
    setSearch("");
    setSize("0");
    setAmenities([]);
  };

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          venues.data && venues.data.some((venue) => venue.requestable) ? (
            <Button onClick={() => setAsking("broadcast")}>
              <Radio />
              Pedir a varios a la vez
            </Button>
          ) : undefined
        }
        description="Empresas e instituciones que reciben meetups. Pedí lugar a un espacio con hasta tres fechas, o a varios a la vez: te avisamos por mail cuando respondan."
        meta={venues.data ? <span className="font-terminal tabular-nums">{venues.data.length}</span> : undefined}
        title="Espacios"
      />

      {requests.isError ? (
        <ErrorState className="mb-5" title="No pudimos traer tus pedidos" onRetry={() => void requests.refetch()} />
      ) : requests.data && requests.data.length > 0 ? (
        <RequestList communityId={community.id} requests={requests.data} />
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Buscar espacio</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pr-8 pl-8"
            id="venue-search"
            placeholder="Buscar por nombre o barrio"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 pointer-coarse:hidden">/</Kbd>
        </label>
        <ToggleGroup
          aria-label="Capacidad"
          className="rounded-md border border-input"
          type="single"
          value={size}
          onValueChange={(value) => value && setSize(value)}
        >
          {SIZES.map((option) => (
            <ToggleGroupItem
              key={option.value}
              className="h-8 px-2.5 font-terminal text-ui tabular-nums"
              value={option.value}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="Equipamiento"
          className="flex-wrap"
          type="multiple"
          value={amenities}
          onValueChange={setAmenities}
        >
          {AMENITIES.map((amenity) => {
            const Icon = AMENITY_ICON[amenity];

            return (
              <ToggleGroupItem
                key={amenity}
                className="h-8 gap-1.5 rounded-md border border-dashed border-input px-2.5 text-meta data-[state=on]:border-solid data-[state=on]:border-primary/50 data-[state=on]:bg-primary-surface"
                title={AMENITY_LABEL[amenity]}
                value={amenity}
              >
                <Icon aria-hidden className="size-3.5" />
                {AMENITY_SHORT[amenity]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      {venues.isError ? (
        <ErrorState onRetry={() => void venues.refetch()} title="No pudimos traer los espacios" />
      ) : venues.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : venues.data.length === 0 ? (
        <Panel>
          <EmptyState
            action={
              <a className="text-ui text-foreground underline underline-offset-2" href="/empresas/espacio">
                Contale a una empresa cómo sumarse
              </a>
            }
            description="Las empresas se suman desde owu.uy/empresas/espacio y el staff de OWU las revisa."
            icon={Building2}
            title="Todavía no hay espacios"
          />
        </Panel>
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState
            action={
              filtered ? (
                <Button size="sm" variant="outline" onClick={clear}>
                  Limpiar filtros
                </Button>
              ) : undefined
            }
            description="Probá con menos filtros o con otro nombre."
            icon={Search}
            title="Ningún espacio coincide"
          />
        </Panel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((venue) => (
            <VenueCard key={venue.id} pending={pending.has(venue.id)} venue={venue} onAsk={() => setAsking(venue)} />
          ))}
        </ul>
      )}

      <RequestComposer
        community={community}
        needs={amenities as Amenity[]}
        target={asking}
        today={today}
        onClose={() => setAsking(null)}
        onSent={() => {
          setAsking(null);
          void queryClient.invalidateQueries({ queryKey: orpc.venues.key() });
        }}
      />
    </PageContainer>
  );
}

/** A space; with `fit` (from a ranked list), what doesn't work for this event and what it lacks. */
export function VenueCard({
  venue,
  pending,
  onAsk,
}: {
  venue: Venue & { fit?: RankedVenue["fit"] };
  pending: boolean;
  onAsk: () => void;
}) {
  const blockers = venue.fit?.blockers ?? [];
  const facts = factLines(venue.facts);

  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-edge">
      <div className="flex items-start gap-3 p-3.5">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-raised font-terminal text-ui font-semibold text-subtle"
        >
          {initials(venue.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-semibold text-foreground">{venue.name}</p>
          <p className="truncate text-meta text-muted-foreground">
            {[venue.neighbourhood, venue.city].filter(Boolean).join(", ") || "Montevideo"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {venue.fallback ? (
            <Badge title={PLAN_B} variant="warning">
              Plan B
            </Badge>
          ) : null}
          {venue.contactStale ? (
            <Badge title="Su contacto no confirmó hace más de 6 meses: puede tardar en responder" variant="secondary">
              Contacto sin verificar
            </Badge>
          ) : null}
        </div>
      </div>
      {venue.fallback ? (
        <p className="-mt-1.5 flex items-start gap-1.5 px-3.5 pb-2.5 text-meta text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {PLAN_B}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border px-3.5 py-3 text-meta">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users aria-hidden className="size-3.5 shrink-0" />
          <dt className="sr-only">Capacidad</dt>
          <dd className="font-terminal text-foreground tabular-nums">
            {venue.capacity ? `hasta ${venue.capacity}` : "a confirmar"}
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <CalendarClock aria-hidden className="size-3.5 shrink-0" />
          <dt className="sr-only">Días</dt>
          <dd className="truncate font-terminal text-foreground tabular-nums">{hostDaysLabel(venue.hostDays)}</dd>
        </div>
        {venue.availability ? (
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Clock aria-hidden className="size-3.5 shrink-0" />
            <dt className="sr-only">Horarios</dt>
            <dd className="truncate">{venue.availability}</dd>
          </div>
        ) : null}
        <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Building2 aria-hidden className="size-3.5 shrink-0" />
          <dt className="sr-only">Cuánto recibe</dt>
          <dd className="min-w-0">
            {rotationLabel(venue.hostedThisYear, venue.lastHostedAt, Date.now())}
            {venue.hosted.times > 0 ? (
              <span className="text-success-foreground">
                {" · "}
                Los recibió {venue.hosted.times === 1 ? "1 vez" : `${venue.hosted.times} veces`} ·{" "}
                {plural(venue.hosted.people, "persona", "personas")}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {venue.amenities.length > 0 ? (
        <ul aria-label="Equipamiento" className="flex flex-wrap gap-1 px-3.5 pb-3">
          {venue.amenities.map((amenity) => {
            const Icon = AMENITY_ICON[amenity];

            return (
              <li
                key={amenity}
                className="flex items-center gap-1 rounded-md bg-raised px-1.5 py-0.5 text-2xs text-subtle"
                title={AMENITY_LABEL[amenity]}
              >
                <Icon aria-hidden className="size-3" />
                {AMENITY_SHORT[amenity]}
              </li>
            );
          })}
        </ul>
      ) : null}
      {facts.length > 0 ? (
        <ul
          aria-label="Cómo es el espacio"
          className="flex flex-col gap-0.5 px-3.5 pb-3 text-meta text-muted-foreground"
        >
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      ) : null}

      {blockers.length > 0 || (venue.fit?.missing.length ?? 0) > 0 ? (
        <p className="flex items-start gap-1.5 px-3.5 pb-3 text-meta text-warning-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {[...blockers, ...(venue.fit?.missing ?? []).map((need) => `Sin ${AMENITY_SHORT[need].toLowerCase()}`)].join(
            " · "
          )}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3.5 py-2.5">
        {venue.requestable ? (
          <>
            <span className="text-meta text-muted-foreground">
              Avisá con <span className="font-terminal tabular-nums">{venue.leadDays}</span> días
            </span>
            <Button disabled={pending || blockers.length > 0} size="sm" variant="outline" onClick={onAsk}>
              {pending ? "Ya pediste" : "Pedir lugar"}
            </Button>
          </>
        ) : (
          <>
            <Badge variant="secondary">Lo coordina OWU</Badge>
            <span className="text-right text-meta text-muted-foreground">Pedilo en #organizadores-meetups</span>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The community's requests, newest first, each with its event and where it stands: waiting (until
 * when), answered, another date proposed, lapsed. What can be done on each is right there.
 */
export function RequestList({
  communityId,
  requests,
  title = "Tus pedidos",
  className = "mb-5",
  onChanged,
}: {
  communityId: string;
  requests: VenueRequest[];
  title?: string;
  className?: string;
  /** After a change here (the wizard re-reads its event) */
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [all, setAll] = useState(false);
  const [recapFor, setRecapFor] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.venues.key() });
    onChanged?.();
  };
  const reopen = useMutation(
    orpc.venues.reopenRequest.mutationOptions({
      onSuccess: () => {
        toast.success("El pedido sigue en pie");
        changed();
      },
      onError: (error) => toast.error("No se pudo deshacer", error.message),
    })
  );
  const cancel = useMutation(
    orpc.venues.cancelRequest.mutationOptions({
      onSuccess: (_, input) => {
        const venue = requests.find((request) => request.id === input.requestId)?.venue.name ?? "el espacio";
        toast.undo(`Cancelaste el pedido a ${venue}`, () => reopen.mutate(input));
        changed();
      },
      onError: (error) => toast.error("No se pudo cancelar", error.message),
    })
  );
  const accept = useMutation(
    orpc.venues.acceptProposal.mutationOptions({
      onSuccess: (request) => {
        const chosen = request.chosenOption === null ? null : request.options[request.chosenOption];
        toast.success(
          `${request.venue.name} los recibe${chosen ? ` el ${shortWhen(chosen.start)}` : ""}`,
          request.eventId ? "La fecha quedó reservada para tu evento." : undefined
        );
        changed();
      },
      onError: (error) => toast.error("No se pudo aceptar esa fecha", error.message),
    })
  );
  const decline = useMutation(
    orpc.venues.declineProposal.mutationOptions({
      onSuccess: () => {
        setDeclining(null);
        toast.success("Le avisamos al espacio. ¡Gracias por responder!");
        changed();
      },
      onError: (error) => toast.error("No se pudo avisar", error.message),
    })
  );
  const gone = useMutation(
    orpc.venues.contactLeft.mutationOptions({
      onSuccess: ({ remaining }) => {
        toast.success(
          "Gracias por avisar",
          remaining > 0
            ? "Le reenviamos el pedido a otra persona del espacio. El staff de OWU revisa el contacto."
            : "No queda otra persona: el staff de OWU busca un contacto nuevo. Probá con otro espacio."
        );
        changed();
      },
      onError: (error) => toast.error("No se pudo marcar", error.message),
    })
  );
  const takenBroadcasts = new Set(
    requests
      .filter((request) => request.broadcastId && request.status === "accepted")
      .map((request) => request.broadcastId)
  );
  const shown = all ? requests : requests.slice(0, FIRST_REQUESTS);
  const busy = cancel.isPending || accept.isPending || decline.isPending || gone.isPending || reopen.isPending;

  return (
    <Panel className={className}>
      <PanelHead icon={Send} meta={requests.length} title={title} />
      <ul className="divide-y divide-border">
        {shown.map((request) => {
          const taken = request.status === "cancelled" && takenBroadcasts.has(request.broadcastId);
          const status = taken
            ? { label: "Otro espacio aceptó", variant: "secondary" as const }
            : STATUS[request.status];
          const chosen = request.chosenOption === null ? null : request.options[request.chosenOption];
          const over = request.event ? Date.parse(request.event.endDate) < Date.now() : false;
          const ref = { communityId, requestId: request.id };

          return (
            <li key={request.id} className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ui font-medium text-foreground">{request.venue.name}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
                {request.broadcastId ? <Badge variant="info">Pedido a varios</Badge> : null}
                <span className="ml-auto truncate text-meta text-muted-foreground">
                  {request.event ? `Para ${request.event.name}` : "Sin evento todavía"}
                </span>
              </div>
              <ol aria-label="Cómo va" className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="size-1.5 rounded-full bg-info" />
                  Enviado <span className="font-terminal tabular-nums">{shortWhen(request.createdAt)}</span>
                </li>
                {request.status === "pending" || request.respondedAt ? (
                  <>
                    <li aria-hidden className="h-px w-4 bg-border" />
                    <li className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          request.status === "accepted"
                            ? "bg-success"
                            : request.status === "declined"
                              ? "bg-live"
                              : request.status === "pending" || request.status === "proposed"
                                ? "animate-pulse bg-warning"
                                : "bg-faint"
                        )}
                      />
                      {request.status === "pending" ? "vence " : "Respondió "}
                      <span className="font-terminal tabular-nums">
                        {shortWhen(request.status === "pending" ? request.expiresAt : (request.respondedAt ?? ""))}
                      </span>
                    </li>
                  </>
                ) : null}
              </ol>
              <ol aria-label="Fechas pedidas" className="flex flex-wrap gap-1.5">
                {request.options.map((option, index) => (
                  <li
                    key={option.start}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-terminal text-meta tabular-nums",
                      chosen === option
                        ? "border-success/50 bg-success-surface text-success-foreground"
                        : "border-border text-muted-foreground",
                      chosen && chosen !== option && "line-through opacity-60"
                    )}
                  >
                    {index + 1}. {shortWhen(option.start)}
                  </li>
                ))}
              </ol>

              {request.status === "proposed" ? (
                <div className="flex flex-col gap-2 rounded-md bg-warning-surface/40 px-2.5 py-2">
                  <p className="text-meta text-foreground">
                    No puede en esas fechas. Propone:
                    {request.hostMessage ? (
                      <span className="block text-muted-foreground">«{request.hostMessage}»</span>
                    ) : null}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {request.counterOptions.map((option, index) => (
                      <li key={option.start} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-terminal text-ui text-foreground tabular-nums">
                          {shortWhen(option.start)}
                        </span>
                        <Button
                          disabled={busy}
                          size="sm"
                          variant="outline"
                          onClick={() => accept.mutate({ ...ref, option: index })}
                        >
                          <Check />
                          Aceptar esta fecha
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {declining === request.id ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-meta text-muted-foreground">Le avisamos que ninguna les sirve.</span>
                      <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>
                        Volver
                      </Button>
                      <Button disabled={busy} size="sm" variant="outline" onClick={() => decline.mutate(ref)}>
                        Avisar a {request.venue.name}
                      </Button>
                    </div>
                  ) : (
                    <Button className="self-end" size="sm" variant="ghost" onClick={() => setDeclining(request.id)}>
                      No nos sirve
                    </Button>
                  )}
                </div>
              ) : request.status === "accepted" ? (
                <div className="flex flex-col gap-1 rounded-md bg-success-surface/50 px-2.5 py-2 text-meta text-foreground">
                  {request.address ? <span>Dirección: {request.address}</span> : null}
                  {request.hostMessage ? <span>«{request.hostMessage}»</span> : null}
                  {request.contact ? (
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span>
                        Contacto: {request.contact.name} ·{" "}
                        <a className="underline underline-offset-2" href={`mailto:${request.contact.email}`}>
                          {request.contact.email}
                        </a>
                      </span>
                      <Button
                        disabled={busy}
                        size="xs"
                        variant="ghost"
                        onClick={() => gone.mutate({ ...ref, contactId: request.contact?.id })}
                      >
                        <UserX />
                        Esta persona ya no está
                      </Button>
                    </span>
                  ) : null}
                </div>
              ) : request.hostMessage ? (
                <p className="text-meta text-muted-foreground">«{request.hostMessage}»</p>
              ) : null}

              {request.status === "accepted" && request.eventId && over ? (
                request.event?.recapSentAt ? (
                  <p className="flex items-center gap-1.5 text-meta text-success-foreground">
                    <CircleCheck aria-hidden className="size-3.5" />
                    Le mandaste el resumen el {shortWhen(request.event.recapSentAt)}
                  </p>
                ) : (
                  <Button
                    className="self-start"
                    size="sm"
                    variant="outline"
                    onClick={() => setRecapFor(request.eventId)}
                  >
                    <Send />
                    Mandar el resumen al espacio
                  </Button>
                )
              ) : null}

              {request.status === "pending" ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-meta text-muted-foreground">
                    Le llegó un mail al espacio: responde sin crear cuenta.
                  </span>
                  <span className="flex items-center gap-1">
                    <Button disabled={busy} size="xs" variant="ghost" onClick={() => gone.mutate(ref)}>
                      <UserX />
                      La persona de contacto ya no está
                    </Button>
                    <Button disabled={busy} size="xs" variant="ghost" onClick={() => cancel.mutate(ref)}>
                      <X />
                      Cancelar
                    </Button>
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {requests.length > FIRST_REQUESTS ? (
        <div className="border-t border-border px-3.5 py-2">
          <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
            {all ? "Ver menos" : `Ver todos (${requests.length})`}
          </Button>
        </div>
      ) : null}
      {recapFor ? (
        <HostRecapDialog
          communityId={communityId}
          eventId={recapFor}
          open
          onOpenChange={(open) => !open && setRecapFor(null)}
        />
      ) : null}
    </Panel>
  );
}

type OptionDraft = { day: string; startTime: string; durationMin: number };

/**
 * Ask one space for 1–3 ranked dates, or (`target` "broadcast") every space that fits at once.
 * `presetEventId` picks the event (from the wizard), `presetAttendees` how many to expect.
 */
export function RequestComposer({
  community,
  target,
  today,
  presetEventId,
  presetAttendees,
  needs = [],
  onClose,
  onSent,
}: {
  community: CalendarCommunity;
  target: Venue | "broadcast" | null;
  today: string;
  presetEventId?: string;
  presetAttendees?: number;
  /** What the event needs, to pick spaces for a broadcast */
  needs?: Amenity[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { isMobile } = useSidebar();
  const hint = useSubmitHint();
  const broadcast = target === "broadcast";
  const venue = broadcast ? null : target;
  const own = useQuery({
    ...orpc.events.list.queryOptions({ input: { communityId: community.id } }),
    enabled: target !== null,
  });
  const [eventId, setEventId] = useState("none");
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [attendees, setAttendees] = useState(String(presetAttendees ?? 40));
  const [message, setMessage] = useState("");

  const upcoming = (own.data ?? []).filter(
    (event) => event.status !== "cancelled" && Date.parse(event.endDate) > Date.now() && event.dateChosen
  );
  const reset = () => {
    setOptions([]);
    setMessage("");
    setEventId("none");
  };
  const send = useMutation(
    orpc.venues.request.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Pedido enviado a ${result.venue.name}`, "Te avisamos por mail cuando respondan.");
        reset();
        onSent();
      },
      onError: (error) => toast.error("No se pudo enviar el pedido", error.message),
    })
  );
  const sendAll = useMutation(
    orpc.venues.broadcast.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Pedido enviado a ${plural(result.venues.length, "espacio", "espacios")}`,
          "El primero que acepta se lo queda; te avisamos por mail."
        );
        reset();
        onSent();
      },
      onError: (error) => toast.error("No se pudo enviar el pedido", error.message),
    })
  );

  // From the wizard: the event is already known, so are its date and time
  const presetFor = useRef<string | null>(null);
  useEffect(() => {
    const key = venue?.id ?? (broadcast ? "broadcast" : null);
    if (!key || !presetEventId || presetFor.current === key || !own.data) return;
    presetFor.current = key;
    pickEvent(presetEventId);
  });

  // The first day far enough ahead that the space hosts on
  let fallback = addDays(today, venue?.leadDays ?? 14);
  for (let step = 0; step < 7 && venue?.hostDays.length; step++) {
    if (venue.hostDays.includes(new Date(`${fallback}T12:00:00Z`).getUTCDay())) break;
    fallback = addDays(fallback, 1);
  }
  const rows = options.length > 0 ? options : [{ day: fallback, startTime: "19:00", durationMin: 120 }];
  const update = (index: number, change: Partial<OptionDraft>) =>
    setOptions(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
  function pickEvent(id: string) {
    setEventId(id);
    const event = upcoming.find((item) => item.id === id);
    if (!event) return;
    setOptions([
      {
        day: dayKey(event.startDate),
        startTime: clockTime(event.startDate),
        durationMin: Math.round((Date.parse(event.endDate) - Date.parse(event.startDate)) / 60_000),
      },
    ]);
    if (event.capacity) setAttendees(String(event.capacity));
  }
  const warnings = rows.map((row) => {
    const weekday = new Date(`${row.day}T12:00:00Z`).getUTCDay();
    if (venue && venue.hostDays.length > 0 && !venue.hostDays.includes(weekday)) {
      return `Recibe solo ${hostDaysLabel(venue.hostDays)}`;
    }
    if (venue && daysBetween(today, row.day) < venue.leadDays) return `Pide ${venue.leadDays} días de aviso`;

    return null;
  });
  const people = Number(attendees) || 0;
  const valid = rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && /^\d{2}:\d{2}$/.test(row.startTime));
  const reach = useQuery({
    ...orpc.venues.broadcastPreview.queryOptions({
      input: {
        communityId: community.id,
        eventId: eventId === "none" ? undefined : eventId,
        options: rows,
        size: sizeFor(people || SIZE_PEOPLE["30-60"]),
        needs,
      },
    }),
    enabled: broadcast && valid,
  });
  const submit = () => {
    const input = {
      communityId: community.id,
      eventId: eventId === "none" ? undefined : eventId,
      options: rows,
      expectedAttendees: people,
      message,
    };
    if (broadcast) sendAll.mutate({ ...input, size: sizeFor(people), needs });
    else if (venue) send.mutate({ ...input, venueId: venue.id });
  };
  const pending = send.isPending || sendAll.isPending;

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className={cn(
          "flex flex-col gap-0 p-0",
          isMobile ? "max-h-[90svh] rounded-t-2xl" : "w-[440px] sm:max-w-[440px]"
        )}
        side={isMobile ? "bottom" : "right"}
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>
            {broadcast ? "Pedir a varios espacios a la vez" : `Pedir lugar en ${venue?.name ?? ""}`}
          </SheetTitle>
          <SheetDescription>
            {broadcast
              ? "Le pedimos a los espacios que mejor encajan (hasta 5). El primero que acepta se lo queda y a los demás les avisamos."
              : "Hasta tres fechas, en orden. Responden desde un link en 3 días."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            <div className="flex flex-col gap-1.5">
              <MicroLabel>Para qué evento</MicroLabel>
              {own.isError ? (
                <ErrorState compact title="No pudimos traer tus eventos" onRetry={() => void own.refetch()} />
              ) : (
                <Select value={eventId} onValueChange={pickEvent}>
                  <SelectTrigger aria-label="Evento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todavía sin evento</SelectItem>
                    {upcoming.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name} · {shortWhen(event.startDate)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5">
                <MicroLabel>Fechas, la que más te sirve primero</MicroLabel>
              </legend>
              {rows.map((row, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- the rows are positions in a ranking
                <div key={index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 font-terminal text-meta text-muted-foreground tabular-nums">{index + 1}</span>
                    <Input
                      aria-label={`Fecha ${index + 1}`}
                      className="flex-1 font-terminal tabular-nums"
                      min={today}
                      required
                      type="date"
                      value={row.day}
                      onChange={(event) => update(index, { day: event.target.value })}
                    />
                    <Input
                      aria-label={`Hora ${index + 1}`}
                      className="w-[104px] font-terminal tabular-nums"
                      required
                      step={900}
                      type="time"
                      value={row.startTime}
                      onChange={(event) => update(index, { startTime: event.target.value })}
                    />
                    {rows.length > 1 ? (
                      <Button
                        aria-label={`Quitar la fecha ${index + 1}`}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => setOptions(rows.filter((_, at) => at !== index))}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                  {warnings[index] ? (
                    <p className="pl-5.5 text-meta text-warning-foreground">{warnings[index]}</p>
                  ) : null}
                </div>
              ))}
              {rows.length < 3 ? (
                <Button
                  className="self-start"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setOptions([...rows, { ...rows[rows.length - 1], day: addDays(rows[rows.length - 1].day, 7) }])
                  }
                >
                  <Plus />
                  Otra fecha
                </Button>
              ) : null}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <MicroLabel>Cuántas personas esperan</MicroLabel>
              <Input
                className="w-28 font-terminal tabular-nums"
                inputMode="numeric"
                max={2000}
                min={5}
                required
                type="number"
                value={attendees}
                onChange={(event) => setAttendees(event.target.value)}
              />
              {venue?.capacity && people > venue.capacity ? (
                <span className="text-meta text-warning-foreground">Entran hasta {venue.capacity}</span>
              ) : null}
            </label>

            {broadcast ? (
              <div className="flex flex-col gap-1.5" aria-live="polite">
                <MicroLabel>Les llega a</MicroLabel>
                {reach.isError ? (
                  <ErrorState
                    compact
                    title="No pudimos ver qué espacios encajan"
                    onRetry={() => void reach.refetch()}
                  />
                ) : !reach.data ? (
                  <Skeleton className="h-6 w-2/3 rounded" />
                ) : reach.data.length === 0 ? (
                  <p className="text-meta text-warning-foreground">
                    Ningún espacio puede en esas fechas: probá otras, o pedile a uno de la lista.
                  </p>
                ) : (
                  <p className="text-ui text-foreground">{reach.data.map((item) => item.name).join(", ")}</p>
                )}
              </div>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between">
                <MicroLabel>Mensaje para {broadcast ? "los espacios" : "el espacio"}</MicroLabel>
                <span className="font-terminal text-2xs text-muted-foreground tabular-nums">{message.length}/1000</span>
              </span>
              <Textarea
                maxLength={1000}
                placeholder="Qué hacen, qué necesitan (proyector, sillas, algo para tomar…)"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>

            <p className="text-meta text-muted-foreground">
              El espacio ve tu nombre y el de tu comunidad. Tu email le llega solo si acepta.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border p-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Volver
            </Button>
            <Button disabled={pending || (broadcast && (reach.data?.length ?? 0) === 0)} type="submit">
              <Send />
              {broadcast && reach.data?.length
                ? `Pedir a ${plural(reach.data.length, "espacio", "espacios")}`
                : "Enviar pedido"}
              {hint ? <Kbd className="ml-1 bg-primary-foreground/10 text-primary-foreground">{hint}</Kbd> : null}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
