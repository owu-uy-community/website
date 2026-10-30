"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Armchair,
  Check,
  ChevronDown,
  Download,
  Mail,
  MoreHorizontal,
  Search,
  Undo2,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { useDebounced } from "components/Admin/access/shared";
import { downloadCsv } from "components/Admin/attendees/helpers";
import { Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime, useNow } from "components/Admin/ui/time";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { clockTime } from "lib/community/time";
import { volunteerLabel } from "lib/organizar/presets";
import { headcount, plural } from "lib/organizar/words";
import { client, orpc } from "lib/orpc/client";
import type { Attendee, Presence } from "lib/orpc/attendees/schemas";
import type { EditableEvent } from "lib/orpc/events/schemas";
import type { VolunteerRole } from "lib/db/schema";

import { usePanel } from "../shell/context";
import { Composer } from "./EmailsTab";
import { NotifyDialog } from "./NotifyDialog";
import { HistoryChips, PendingList } from "./PendingList";
import type { EventInput } from "./save";

const PAGE = 200;
/** "Hacer entrar" sits in the row from a day before; earlier it's in the row's menu */
const DOOR_OPENS_MS = 24 * 3_600_000;

const PEOPLE_TABS: { key: Presence; title: string }[] = [
  { key: "all", title: "Todos" },
  { key: "out", title: "Anotados" },
  { key: "waiting", title: "En espera" },
  { key: "pending", title: "Por aprobar" },
  { key: "in", title: "Entraron" },
  { key: "cancelled", title: "Liberaron o bajas" },
];

/** Still in: their place can be cancelled while they haven't come in (OWU's own sign-ups only) */
const cancellable = (person: Attendee) =>
  person.source === "owu" &&
  !person.checkedInAt &&
  ["attending", "offered", "waitlisted", "pending"].includes(person.status);
/** Still in, with an address: who "Escribirles" reaches */
const writable = (person: Attendee) =>
  Boolean(person.email) && ["attending", "offered", "waitlisted", "pending"].includes(person.status);
/** Has a seat and a code, and isn't in yet */
const admittable = (person: Attendee) =>
  person.status === "attending" && !person.checkedInAt && Boolean(person.barcode ?? person.eventbriteId);

/** The scanner's own check-in, from the panel: same idempotent path, its own nonce per person. */
const checkIn = (eventId: string, person: Attendee) =>
  client.attendees.scan({
    eventId,
    code: person.barcode ?? person.eventbriteId ?? "",
    nonce: crypto.randomUUID(),
    device: "Panel",
  });

/** Where someone stands, in the glossary's words: liberó su lugar (themselves) vs dado de baja (the team). */
function standing(person: Attendee): { label: string; variant: NonNullable<BadgeProps["variant"]> } {
  if (person.checkedInAt) return { label: `Entró ${clockTime(person.checkedInAt)}`, variant: "success" };
  switch (person.status) {
    case "attending":
      return { label: "Anotado", variant: "secondary" };
    case "offered":
      return { label: "Lugar ofrecido", variant: "outline" };
    case "waitlisted":
      return { label: "En espera", variant: "outline" };
    case "pending":
      return { label: "Por aprobar", variant: "warning" };
    case "cancelled":
      return { label: person.excused ? "Dado de baja" : "Liberó su lugar", variant: "outline" };
    case "declined":
      return { label: "No aprobado", variant: "outline" };
    case "refunded":
      return { label: "Reembolsada", variant: "outline" };
  }
}

/**
 * Who signed up. Organizers with attendee:read get the whole list: tabs by where people stand,
 * search, "Sin confirmar", CSV, and acting on people one by one or on a selection; each action
 * only for whoever holds its permission. Editors (rsvp:review) get who waits for approval.
 */
export function PeopleTab({ input, event }: { input: EventInput; event: EditableEvent }) {
  const { can } = usePanel();

  return can("attendee:read") ? <PeopleList event={event} input={input} /> : <PendingList input={input} />;
}

function PeopleList({ input, event }: { input: EventInput; event: EditableEvent }) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const now = useNow(60_000);
  const { eventId } = input;
  const [status, setStatus] = useState<Presence>("all");
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Map<string, Attendee>>(() => new Map());
  const [cancelling, setCancelling] = useState<Attendee[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useInfiniteQuery(
    orpc.attendees.list.infiniteOptions({
      input: (page: number) => ({
        eventId,
        status,
        q,
        confirmed: unconfirmed ? ("no" as const) : undefined,
        pageSize: PAGE,
        sort: "-registered" as const,
        page,
      }),
      initialPageParam: 1,
      getNextPageParam: (last) => (last.rows.length === last.pageSize ? last.page + 1 : undefined),
    })
  );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.attendees.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.rsvps.pending.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
  };
  const failed = (error: Error) => toast.error("No se pudo", error.message);
  const review = useMutation(
    orpc.rsvps.review.mutationOptions({
      onSuccess: (result) => {
        toast.success(result.status === "declined" ? "No aprobada" : "Aprobada", "Le avisamos por mail.");
        refresh();
      },
      onError: failed,
    })
  );
  const seat = useMutation(
    orpc.rsvps.giveSeat.mutationOptions({
      onSuccess: () => {
        toast.success("Tiene su lugar", "Le mandamos la entrada por mail.");
        refresh();
      },
      onError: failed,
    })
  );
  const cancel = useMutation(
    orpc.rsvps.cancelSpots.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.cancelled === 1 ? "Dada de baja" : `${result.cancelled} dados de baja`,
          "Les avisamos por mail; los lugares pasan a quien sigue en la lista."
        );
        setCancelling(null);
        setSelected(new Map());
        refresh();
      },
      onError: failed,
    })
  );
  const exportCsv = useMutation(
    orpc.attendees.export.mutationOptions({
      onSuccess: downloadCsv,
      onError: (error) => toast.error("No se pudo exportar", error.message),
    })
  );

  /** Taking a check-in back is reversible: do it, and offer to undo */
  const undoEntry = async (people: Attendee[]) => {
    try {
      for (const person of people) await client.attendees.undoCheckin({ eventId, attendeeId: person.id });
      toast.undo(
        people.length === 1 ? "Ya no figura adentro" : `${people.length} ya no figuran adentro`,
        () => void admit(people, false)
      );
    } catch (error) {
      failed(error as Error);
    } finally {
      refresh();
    }
  };

  const admit = async (people: Attendee[], offerUndo = true) => {
    setBusy(true);
    const admitted: Attendee[] = [];
    try {
      // One at a time: a selection of a hundred shouldn't fire a hundred requests at once
      for (const person of people) {
        const result = await checkIn(eventId, person);
        if (result.result === "ok") admitted.push(person);
      }
      setSelected(new Map());
      if (offerUndo) {
        toast.undo(
          admitted.length === 1 ? `${admitted[0]?.name} entró` : `Entraron ${admitted.length}`,
          () => void undoEntry(admitted)
        );
      }
    } catch (error) {
      toast.error("No se pudo hacer entrar", (error as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const first = list.data?.pages[0];
  const rows = list.data?.pages.flatMap((page) => page.rows) ?? [];
  const totals = first?.totals;
  const count = first?.headcount ? headcount(first.headcount, event.capacity) : null;
  const tabs = PEOPLE_TABS.filter((item) => item.key !== "pending" || event.approval || (totals?.pending ?? 0) > 0);
  const chosen = [...selected.values()];
  const toggle = (person: Attendee, on: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(person.id, person);
      else next.delete(person.id);
      return next;
    });
  const allOn = rows.length > 0 && rows.every((person) => selected.has(person.id));
  const pending = review.isPending || seat.isPending || busy;
  // From a day before (now = 0 until mounted): the door is near, "Hacer entrar" moves into the row
  const doorNear = now > 0 && Date.parse(event.startDate) - now <= DOOR_OPENS_MS;
  const canAdmit = can("attendee:checkin");

  return (
    <div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto" role="group" aria-label="Quiénes">
            {tabs.map((item) => (
              <Button
                key={item.key}
                aria-pressed={status === item.key}
                className={cn(status === item.key && "bg-raised text-foreground")}
                size="sm"
                variant="ghost"
                onClick={() => setStatus(item.key)}
              >
                {item.title}
                <span className="font-terminal text-2xs text-muted-foreground tabular-nums">
                  {totals ? totals[item.key] : "–"}
                </span>
              </Button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-56">
            <span className="sr-only">Buscar por nombre o email</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              placeholder="Nombre o email"
              value={text}
              onChange={(change) => setText(change.target.value)}
            />
          </label>
          {can("attendee:export") ? (
            <Button
              disabled={exportCsv.isPending}
              size="sm"
              variant="outline"
              onClick={() => exportCsv.mutate({ eventId, status, q, confirmed: unconfirmed ? "no" : undefined })}
            >
              <Download />
              CSV
            </Button>
          ) : null}
        </div>
        {count && status !== "pending" ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3.5 py-2 text-meta text-muted-foreground">
            <span className="tabular-nums" data-testid="headcount">
              {count.seatsLabel} · {count.attendingLabel} · {count.waitlistLabel}
              {first?.headcount?.attending ? ` · ${first.headcount.confirmed} confirmaron` : ""}
            </span>
            {first?.headcount?.attending ? (
              <Button
                aria-pressed={unconfirmed}
                className={cn("ml-auto", unconfirmed && "border-primary/60 text-foreground")}
                size="xs"
                variant="outline"
                onClick={() => setUnconfirmed(!unconfirmed)}
              >
                Sin confirmar
              </Button>
            ) : null}
          </div>
        ) : null}
        {status === "pending" ? (
          <div className="p-3">
            <PendingList input={input} />
          </div>
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} title="No pudimos traer la lista" />
        ) : !list.data ? (
          <Skeleton className="m-3 h-32" />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title={q || unconfirmed ? "Nadie coincide" : "Nadie acá todavía"}
            action={
              q || unconfirmed ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setText("");
                    setUnconfirmed(false);
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2">
              <Checkbox
                aria-label="Elegir a todos los de la lista"
                checked={allOn ? true : rows.some((person) => selected.has(person.id)) ? "indeterminate" : false}
                className="max-sm:size-6"
                onCheckedChange={(on) => {
                  for (const person of rows) toggle(person, on === true);
                }}
              />
              <span className="font-terminal text-2xs text-muted-foreground tabular-nums">
                {plural(rows.length, "persona", "personas")}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((person) => {
                const state = standing(person);
                const expanded = open.has(person.id);
                const inRow = admittable(person) && canAdmit && doorNear;
                const menu = [
                  admittable(person) && canAdmit && !inRow
                    ? { key: "in", label: "Hacer entrar", icon: UserCheck, run: () => void admit([person]) }
                    : null,
                  person.status === "offered" && can("rsvp:seat")
                    ? {
                        key: "seat",
                        label: "Darle el lugar ya",
                        icon: Armchair,
                        run: () => seat.mutate({ ...input, attendeeId: person.id }),
                      }
                    : null,
                  person.checkedInAt && can("attendee:undo")
                    ? { key: "undo", label: "Deshacer la entrada", icon: Undo2, run: () => void undoEntry([person]) }
                    : null,
                  cancellable(person) && can("rsvp:cancel")
                    ? { key: "cancel", label: "Dar de baja", icon: UserX, run: () => setCancelling([person]) }
                    : null,
                ].filter((item) => item !== null);

                return (
                  <li key={person.id} className={cn(selected.has(person.id) && "bg-primary/[0.04]")}>
                    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                      <Checkbox
                        aria-label={`Elegir a ${person.name}`}
                        checked={selected.has(person.id)}
                        className="max-sm:size-6"
                        onCheckedChange={(on) => toggle(person, on === true)}
                      />
                      {/* On a phone the name keeps its width and the actions wrap below it */}
                      <div className="min-w-0 flex-1 basis-48">
                        {/* A div: the chips are divs, which a <p> can't hold */}
                        <div className="flex flex-wrap items-center gap-1.5 text-ui font-medium text-foreground">
                          <span className="truncate">{person.name}</span>
                          {person.guests ? <span className="text-muted-foreground">+{person.guests}</span> : null}
                          {person.ticketClass === "En la puerta" ? (
                            <span className="font-normal text-muted-foreground">· en la puerta</span>
                          ) : null}
                          {person.confirmedAt && !person.checkedInAt ? (
                            <Badge variant="success">
                              <Check aria-hidden />
                              Confirmó
                            </Badge>
                          ) : null}
                          <HistoryChips history={person.history} />
                        </div>
                        <p className="truncate text-meta text-muted-foreground">
                          {person.email || "sin email"}
                          {person.registeredAt ? (
                            <>
                              {" · "}
                              <RelativeTime className="text-meta" date={person.registeredAt} />
                            </>
                          ) : null}
                        </p>
                      </div>
                      <Badge variant={state.variant}>{state.label}</Badge>
                      <div className="flex items-center gap-1">
                        {person.status === "pending" && can("rsvp:review") ? (
                          <>
                            <Button
                              disabled={pending}
                              size="xs"
                              variant="outline"
                              onClick={() => review.mutate({ ...input, attendeeId: person.id, decision: "decline" })}
                            >
                              <X />
                              No
                            </Button>
                            <Button
                              disabled={pending}
                              size="xs"
                              variant="outline"
                              onClick={() => review.mutate({ ...input, attendeeId: person.id, decision: "approve" })}
                            >
                              <Check />
                              Aprobar
                            </Button>
                          </>
                        ) : person.status === "waitlisted" && can("rsvp:seat") ? (
                          <Button
                            disabled={pending}
                            size="xs"
                            variant="outline"
                            onClick={() => seat.mutate({ ...input, attendeeId: person.id })}
                          >
                            <Armchair />
                            Dar lugar
                          </Button>
                        ) : inRow ? (
                          <Button disabled={pending} size="xs" variant="outline" onClick={() => void admit([person])}>
                            <UserCheck />
                            Hacer entrar
                          </Button>
                        ) : null}
                        {menu.length > 0 ? (
                          // Not modal: the confirm it opens must get the focus and the pointer
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button aria-label={`Más acciones para ${person.name}`} size="icon-xs" variant="ghost">
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {menu.map((item) => (
                                <DropdownMenuItem key={item.key} onSelect={item.run}>
                                  <item.icon />
                                  {item.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                        <Button
                          aria-controls={`person-${person.id}`}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Ocultar" : "Ver"} las respuestas de ${person.name}`}
                          size="icon-xs"
                          variant="ghost"
                          onClick={() =>
                            setOpen((current) => {
                              const next = new Set(current);
                              if (expanded) next.delete(person.id);
                              else next.add(person.id);
                              return next;
                            })
                          }
                        >
                          <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
                        </Button>
                      </div>
                    </div>
                    {expanded ? (
                      <dl
                        className="grid gap-2 border-t border-border/60 bg-raised/30 px-3.5 py-2.5 text-meta sm:grid-cols-2 sm:pl-11"
                        id={`person-${person.id}`}
                      >
                        <div>
                          <dt className="text-muted-foreground">Acompañantes</dt>
                          <dd className="text-foreground">{person.guests ? `+${person.guests}` : "Viene sin +1"}</dd>
                        </div>
                        {person.volunteerRoles?.length ? (
                          <div>
                            <dt className="text-muted-foreground">Da una mano con</dt>
                            <dd className="text-foreground">
                              {person.volunteerRoles.map((role) => volunteerLabel(role as VolunteerRole)).join(", ")}
                            </dd>
                          </div>
                        ) : null}
                        {person.history && person.history.seated > 0 ? (
                          <div>
                            <dt className="text-muted-foreground">Antes en la comunidad</dt>
                            <dd className="text-foreground">
                              vino {plural(person.history.attended, "vez", "veces")}, faltó sin avisar{" "}
                              {plural(person.history.noShows, "vez", "veces")}
                              {person.history.lateReleases
                                ? `, liberó tarde ${plural(person.history.lateReleases, "vez", "veces")}`
                                : ""}
                              {person.history.excused
                                ? `, avisó ${plural(person.history.excused, "vez", "veces")}`
                                : ""}
                            </dd>
                          </div>
                        ) : null}
                        {(person.answers ?? []).map((answer) => (
                          <div key={answer.label}>
                            <dt className="text-muted-foreground">{answer.label}</dt>
                            <dd className="text-foreground">{answer.value}</dd>
                          </div>
                        ))}
                        {!person.answers?.length ? (
                          <p className="text-muted-foreground">No respondió preguntas.</p>
                        ) : null}
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {list.hasNextPage ? (
              <div className="border-t border-border p-3 text-center">
                <Button
                  disabled={list.isFetchingNextPage}
                  size="sm"
                  variant="outline"
                  onClick={() => void list.fetchNextPage()}
                >
                  {list.isFetchingNextPage ? "Cargando…" : "Cargar más"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      {selected.size > 0 ? (
        // On phones it floats above the panel's tab bar
        <div className="pointer-events-none sticky bottom-4 z-30 h-0 max-md:bottom-[calc(var(--admin-tabbar-h,56px)+0.5rem)]">
          <div
            aria-label="Acciones sobre la selección"
            className="pointer-events-auto absolute bottom-3 left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-xl border border-input bg-popover p-1.5 pl-3 shadow-overlay"
            role="toolbar"
          >
            <span className="mr-1.5 text-ui whitespace-nowrap">
              <span className="font-terminal text-primary tabular-nums">{selected.size}</span>
              <span className="max-sm:sr-only"> {selected.size === 1 ? "elegida" : "elegidas"}</span>
            </span>
            {canAdmit ? (
              <Button
                disabled={pending || !chosen.some(admittable)}
                size="sm"
                variant="outline"
                onClick={() => void admit(chosen.filter(admittable))}
              >
                <UserCheck />
                <span className="max-sm:sr-only">Hacer entrar</span>
              </Button>
            ) : null}
            {can("rsvp:cancel") ? (
              <Button
                disabled={!chosen.some(cancellable)}
                size="sm"
                variant="outline"
                onClick={() => setCancelling(chosen.filter(cancellable))}
              >
                <UserX />
                <span className="max-sm:sr-only">Dar de baja</span>
              </Button>
            ) : null}
            {can("event:message") ? (
              <Button disabled={!chosen.some(writable)} size="sm" variant="outline" onClick={() => setWriting(true)}>
                <Mail />
                <span className="max-sm:sr-only">Escribirles</span>
              </Button>
            ) : null}
            <Button
              aria-label="Limpiar la selección"
              size="icon-sm"
              variant="ghost"
              onClick={() => setSelected(new Map())}
            >
              <X />
            </Button>
          </div>
        </div>
      ) : null}

      <NotifyDialog
        destructive
        confirmLabel={`Dar de baja y avisar a ${plural(cancelling?.length ?? 0, "persona", "personas")}`}
        description="Le llega un mail y su lugar pasa a quien sigue en la lista de espera. Quien ya entró no se toca."
        open={cancelling !== null}
        pending={cancel.isPending}
        pendingLabel="Dando de baja…"
        title={
          cancelling?.length === 1
            ? `Dar de baja a ${cancelling[0]?.name}`
            : `Dar de baja a ${plural(cancelling?.length ?? 0, "persona", "personas")}`
        }
        onConfirm={() => cancelling && cancel.mutate({ ...input, attendeeIds: cancelling.map((person) => person.id) })}
        onOpenChange={(next) => !next && setCancelling(null)}
      />

      <Dialog open={writing} onOpenChange={setWriting}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Escribirles</DialogTitle>
            <DialogDescription>
              A {plural(chosen.filter(writable).length, "persona elegida", "personas elegidas")}, por mail (quienes
              pidieron no recibir mails, no).
            </DialogDescription>
          </DialogHeader>
          <Composer
            event={event}
            ids={chosen.filter(writable).map((person) => person.id)}
            input={input}
            onSent={() => {
              setWriting(false);
              setSelected(new Map());
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
