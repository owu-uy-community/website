"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accessibility,
  Building2,
  CalendarClock,
  Check,
  Clock,
  Mic,
  Plus,
  Projector,
  Search,
  Send,
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
import { dayKey, shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import { AMENITIES, AMENITY_LABEL, AMENITY_SHORT, type Venue, type VenueRequest } from "lib/orpc/venues/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";

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
const TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00"];

const STATUS: Record<
  VenueRequest["status"],
  { label: string; variant: "warning" | "success" | "secondary" | "destructive" }
> = {
  pending: { label: "Esperando respuesta", variant: "warning" },
  accepted: { label: "Aceptado", variant: "success" },
  declined: { label: "No puede", variant: "destructive" },
  expired: { label: "Venció", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "secondary" },
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

/** Spaces that host meetups, and asking one for a date. */
export function VenuesClient({ community, today }: { community: CalendarCommunity; today: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [size, setSize] = useState("0");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [asking, setAsking] = useState<Venue | null>(null);

  const venues = useQuery(orpc.venues.list.queryOptions({ input: { communityId: community.id } }));
  const requests = useQuery(orpc.venues.requests.queryOptions({ input: { communityId: community.id } }));
  const cancel = useMutation(
    orpc.venues.cancelRequest.mutationOptions({
      onSuccess: () => {
        toast.success("Cancelaste el pedido");
        void queryClient.invalidateQueries({ queryKey: orpc.venues.requests.key() });
      },
      onError: (error) => toast.error("No se pudo cancelar", error.message),
    })
  );

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
    (requests.data ?? []).filter((request) => request.status === "pending").map((request) => request.venue.id)
  );

  return (
    <PageContainer size="large">
      <PageHeader
        description="Empresas e instituciones que reciben meetups. Pedí lugar con hasta tres fechas: te avisamos por mail cuando respondan."
        meta={venues.data ? <span className="font-terminal tabular-nums">{venues.data.length}</span> : undefined}
        title="Espacios"
      />

      {requests.data && requests.data.length > 0 ? (
        <RequestList
          requests={requests.data}
          today={today}
          onCancel={(requestId) => cancel.mutate({ communityId: community.id, requestId })}
        />
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
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
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
                aria-label={AMENITY_LABEL[amenity]}
                className="h-8 gap-1.5 rounded-md border border-dashed border-input px-2.5 text-meta data-[state=on]:border-solid data-[state=on]:border-primary/50 data-[state=on]:bg-primary-surface"
                title={AMENITY_LABEL[amenity]}
                value={amenity}
              >
                <Icon aria-hidden className="size-3.5" />
                <span className="max-sm:hidden">{AMENITY_SHORT[amenity]}</span>
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
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState
            description={venues.data.length === 0 ? "Todavía no hay espacios cargados." : "Probá con menos filtros."}
            icon={Building2}
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
        today={today}
        venue={asking}
        onClose={() => setAsking(null)}
        onSent={() => {
          setAsking(null);
          void queryClient.invalidateQueries({ queryKey: orpc.venues.requests.key() });
        }}
      />
    </PageContainer>
  );
}

function VenueCard({ venue, pending, onAsk }: { venue: Venue; pending: boolean; onAsk: () => void }) {
  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-edge">
      <div className="flex items-start gap-3 p-3.5">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-raised font-terminal text-ui font-semibold text-subtle"
        >
          {venue.name
            .split(/[\s·]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-semibold text-foreground">{venue.name}</p>
          <p className="truncate text-meta text-muted-foreground">
            {[venue.neighbourhood, venue.city].filter(Boolean).join(", ") || "Montevideo"}
          </p>
        </div>
        {venue.hostedUs > 0 ? (
          <Badge variant="success" title="Veces que recibió a tu comunidad">
            <Check aria-hidden />
            {venue.hostedUs === 1 ? "Los recibió" : `${venue.hostedUs} veces`}
          </Badge>
        ) : null}
      </div>

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

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3.5 py-2.5">
        {venue.requestable ? (
          <>
            <span className="text-meta text-muted-foreground">
              Avisá con <span className="font-terminal tabular-nums">{venue.leadDays}</span> días
            </span>
            <Button disabled={pending} size="sm" variant="outline" onClick={onAsk}>
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

function RequestList({
  requests,
  today,
  onCancel,
}: {
  requests: VenueRequest[];
  today: string;
  onCancel: (requestId: string) => void;
}) {
  return (
    <Panel className="mb-5">
      <PanelHead icon={Send} meta={requests.length} title="Tus pedidos" />
      <ul className="divide-y divide-border">
        {requests.slice(0, 6).map((request) => {
          const status = STATUS[request.status];
          const chosen = request.chosenOption === null ? null : request.options[request.chosenOption];
          const hoursLeft = Math.max(0, Math.round((Date.parse(request.expiresAt) - Date.now()) / 3_600_000));

          return (
            <li key={request.id} className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ui font-medium text-foreground">{request.venue.name}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">
                  {request.status === "pending"
                    ? hoursLeft >= 24
                      ? `responde en ${Math.ceil(hoursLeft / 24)} días`
                      : `responde en ${hoursLeft} h`
                    : `pedido el ${shortWhen(request.createdAt).split(" · ")[0]}`}
                </span>
              </div>
              <ol className="flex flex-wrap gap-1.5">
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
              {request.status === "accepted" ? (
                <div className="flex flex-col gap-1 rounded-md bg-success-surface/50 px-2.5 py-2 text-meta text-foreground">
                  {request.address ? <span>Dirección: {request.address}</span> : null}
                  {request.hostMessage ? <span>«{request.hostMessage}»</span> : null}
                  {request.contact ? (
                    <span>
                      Contacto: {request.contact.name} ·{" "}
                      <a className="underline underline-offset-2" href={`mailto:${request.contact.email}`}>
                        {request.contact.email}
                      </a>
                    </span>
                  ) : null}
                </div>
              ) : request.hostMessage ? (
                <p className="text-meta text-muted-foreground">«{request.hostMessage}»</p>
              ) : null}
              {request.status === "pending" ? (
                <div className="flex items-center justify-between">
                  <span className="text-meta text-muted-foreground">
                    Le llegó un mail al espacio: responde sin crear cuenta.
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => onCancel(request.id)}>
                    <X />
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

type OptionDraft = { day: string; startTime: string; durationMin: number };

function RequestComposer({
  community,
  venue,
  today,
  onClose,
  onSent,
}: {
  community: CalendarCommunity;
  venue: Venue | null;
  today: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { isMobile } = useSidebar();
  const own = useQuery({
    ...orpc.events.list.queryOptions({ input: { communityId: community.id } }),
    enabled: venue !== null,
  });
  const [eventId, setEventId] = useState("none");
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [attendees, setAttendees] = useState("40");
  const [message, setMessage] = useState("");

  const upcoming = (own.data ?? []).filter(
    (event) => event.status !== "cancelled" && Date.parse(event.endDate) > Date.now() && event.dateChosen
  );
  const send = useMutation(
    orpc.venues.request.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Pedido enviado a ${result.venue.name}`, "Te avisamos por mail cuando respondan.");
        setOptions([]);
        setMessage("");
        setEventId("none");
        onSent();
      },
      onError: (error) => toast.error("No se pudo enviar el pedido", error.message),
    })
  );

  // The first day far enough ahead that the space hosts on
  let fallback = addDays(today, venue?.leadDays ?? 14);
  for (let step = 0; step < 7 && venue?.hostDays.length; step++) {
    if (venue.hostDays.includes(new Date(`${fallback}T12:00:00Z`).getUTCDay())) break;
    fallback = addDays(fallback, 1);
  }
  const rows = options.length > 0 ? options : [{ day: fallback, startTime: "19:00", durationMin: 120 }];
  const update = (index: number, change: Partial<OptionDraft>) =>
    setOptions(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
  const pickEvent = (id: string) => {
    setEventId(id);
    const event = upcoming.find((item) => item.id === id);
    if (event) {
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Montevideo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(event.startDate));
      setOptions([
        {
          day: dayKey(event.startDate),
          startTime: TIMES.includes(time) ? time : "19:00",
          durationMin: Math.round((Date.parse(event.endDate) - Date.parse(event.startDate)) / 60_000),
        },
      ]);
    }
  };
  const warnings = rows.map((row) => {
    const weekday = new Date(`${row.day}T12:00:00Z`).getUTCDay();
    if (venue && venue.hostDays.length > 0 && !venue.hostDays.includes(weekday)) {
      return `Recibe solo ${hostDaysLabel(venue.hostDays)}`;
    }
    if (venue && daysBetween(today, row.day) < venue.leadDays) return `Pide ${venue.leadDays} días de aviso`;

    return null;
  });
  const submit = () =>
    venue &&
    send.mutate({
      communityId: community.id,
      venueId: venue.id,
      eventId: eventId === "none" ? undefined : eventId,
      options: rows,
      expectedAttendees: Number(attendees) || 0,
      message,
    });

  return (
    <Sheet open={venue !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className={cn(
          "flex flex-col gap-0 p-0",
          isMobile ? "max-h-[90svh] rounded-t-2xl" : "w-[440px] sm:max-w-[440px]"
        )}
        side={isMobile ? "bottom" : "right"}
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Pedir lugar en {venue?.name}</SheetTitle>
          <SheetDescription>Hasta tres fechas, en orden. Responden desde un link en 3 días.</SheetDescription>
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
                    <Select value={row.startTime} onValueChange={(value) => update(index, { startTime: value })}>
                      <SelectTrigger aria-label={`Hora ${index + 1}`} className="w-[92px] font-terminal tabular-nums">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMES.map((time) => (
                          <SelectItem key={time} className="font-terminal tabular-nums" value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              {venue?.capacity && Number(attendees) > venue.capacity ? (
                <span className="text-meta text-warning-foreground">Entran hasta {venue.capacity}</span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between">
                <MicroLabel>Mensaje para el espacio</MicroLabel>
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
              Cancelar
            </Button>
            <Button disabled={send.isPending} type="submit">
              <Send />
              Enviar pedido
              <Kbd className="ml-1 bg-primary-foreground/10 text-primary-foreground">⌘↵</Kbd>
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
