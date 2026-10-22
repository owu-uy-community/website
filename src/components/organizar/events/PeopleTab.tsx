"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Armchair,
  Check,
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
import { downloadCsv } from "components/Admin/attendees/helpers";
import { ConfirmDialog } from "components/Admin/panel";
import { Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
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
import { client, orpc } from "lib/orpc/client";
import { NOT_ATTENDING_LABEL, type Attendee, type Presence } from "lib/orpc/attendees/schemas";

import { Composer } from "./EmailsTab";
import type { EventInput } from "./save";

const PEOPLE_TABS: { key: Presence; title: string }[] = [
  { key: "all", title: "Todos" },
  { key: "out", title: "Anotados" },
  { key: "waiting", title: "En espera" },
  { key: "pending", title: "Por aprobar" },
  { key: "in", title: "Acreditados" },
  { key: "cancelled", title: "Bajas" },
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

type Confirm = { kind: "cancel" | "undo"; people: Attendee[] };

/**
 * Who signed up: tabs by where they stand, search, CSV, and acting on people (approve, give a
 * seat, check in, cancel a place), one by one or on a selection from the floating bar.
 */
export function PeopleTab({ input }: { input: EventInput }) {
  const queryClient = useQueryClient();
  const { eventId } = input;
  const [status, setStatus] = useState<Presence>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Map<string, Attendee>>(() => new Map());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useQuery(
    orpc.attendees.list.queryOptions({ input: { eventId, status, q, pageSize: 200, sort: "-registered" } })
  );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.attendees.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
  };
  const failed = (error: Error) => toast.error("No se pudo", error.message);
  const review = useMutation(
    orpc.rsvps.review.mutationOptions({
      onSuccess: (result) => {
        toast.success(result.status === "declined" ? "No aprobado" : "Aprobado", "Le avisamos por mail.");
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
          result.cancelled === 1 ? "Lugar cancelado" : `${result.cancelled} lugares cancelados`,
          "Les avisamos por mail; los lugares pasan a quien sigue en la lista."
        );
        setConfirm(null);
        setSelected(new Map());
        refresh();
      },
      onError: failed,
    })
  );
  const undo = useMutation(
    orpc.attendees.undoCheckin.mutationOptions({
      onSuccess: () => {
        toast.success("Acreditación deshecha", "Vuelve a figurar por llegar.");
        setConfirm(null);
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

  const admit = async (people: Attendee[]) => {
    setBusy(true);
    let admitted = 0;
    try {
      // One at a time: a selection of a hundred shouldn't fire a hundred requests at once
      for (const person of people) {
        const result = await checkIn(eventId, person);
        if (result.result === "ok") admitted += 1;
      }
      toast.success(admitted === 1 ? "Acreditada" : `${admitted} acreditados`);
      setSelected(new Map());
    } catch (error) {
      toast.error("No se pudo acreditar", (error as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const rows = list.data?.rows ?? [];
  const totals = list.data?.totals;
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

  return (
    <div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto">
            {PEOPLE_TABS.map((item) => (
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
            <span className="sr-only">Buscar</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              placeholder="Nombre o email"
              value={q}
              onChange={(change) => setQ(change.target.value)}
            />
          </label>
          <Button
            disabled={exportCsv.isPending}
            size="sm"
            variant="outline"
            onClick={() => exportCsv.mutate({ eventId, status, q })}
          >
            <Download />
            CSV
          </Button>
        </div>
        {list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} title="No pudimos traer la lista" />
        ) : !list.data ? (
          <Skeleton className="m-3 h-32" />
        ) : rows.length === 0 ? (
          <EmptyState compact icon={Users} title={q ? "Nadie coincide" : "Nadie acá todavía"} />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2">
              <Checkbox
                aria-label="Elegir a todos los de la lista"
                checked={allOn ? true : rows.some((person) => selected.has(person.id)) ? "indeterminate" : false}
                onCheckedChange={(on) => {
                  for (const person of rows) toggle(person, on === true);
                }}
              />
              <span className="font-terminal text-2xs text-muted-foreground tabular-nums">
                {rows.length} {rows.length === 1 ? "persona" : "personas"}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((person) => (
                <li
                  key={person.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-3.5 py-2.5",
                    selected.has(person.id) && "bg-primary/[0.04]"
                  )}
                >
                  <Checkbox
                    aria-label={`Elegir a ${person.name}`}
                    checked={selected.has(person.id)}
                    onCheckedChange={(on) => toggle(person, on === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-foreground">
                      {person.name}
                      {person.ticketClass === "En la puerta" ? (
                        <span className="text-muted-foreground"> · en la puerta</span>
                      ) : null}
                    </p>
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
                  {person.checkedInAt ? (
                    <Badge variant="success">
                      <Check aria-hidden />
                      Acreditado
                    </Badge>
                  ) : person.status === "attending" ? (
                    <Badge variant="secondary">Anotado</Badge>
                  ) : (
                    <Badge variant={person.status === "pending" ? "warning" : "outline"}>
                      {NOT_ATTENDING_LABEL[person.status]}
                    </Badge>
                  )}
                  <div className="flex items-center gap-1">
                    {person.status === "pending" ? (
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
                    ) : person.status === "waitlisted" || person.status === "offered" ? (
                      <Button
                        disabled={pending}
                        size="xs"
                        variant="outline"
                        onClick={() => seat.mutate({ ...input, attendeeId: person.id })}
                      >
                        <Armchair />
                        Dar lugar
                      </Button>
                    ) : admittable(person) ? (
                      <Button disabled={pending} size="xs" variant="outline" onClick={() => void admit([person])}>
                        <UserCheck />
                        Acreditar
                      </Button>
                    ) : null}
                    {person.checkedInAt || cancellable(person) ? (
                      // Not modal: the confirm it opens must get the focus and the pointer
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button aria-label={`Más acciones para ${person.name}`} size="icon-xs" variant="ghost">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {person.checkedInAt ? (
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: "undo", people: [person] })}>
                              <Undo2 />
                              Deshacer la acreditación
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: "cancel", people: [person] })}>
                              <UserX />
                              Cancelar su lugar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
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
            <Button
              disabled={pending || !chosen.some(admittable)}
              size="sm"
              variant="outline"
              onClick={() => void admit(chosen.filter(admittable))}
            >
              <UserCheck />
              <span className="max-sm:sr-only">Acreditar</span>
            </Button>
            <Button
              disabled={!chosen.some(cancellable)}
              size="sm"
              variant="outline"
              onClick={() => setConfirm({ kind: "cancel", people: chosen.filter(cancellable) })}
            >
              <UserX />
              <span className="max-sm:sr-only">Cancelar lugar</span>
            </Button>
            <Button disabled={!chosen.some(writable)} size="sm" variant="outline" onClick={() => setWriting(true)}>
              <Mail />
              <span className="max-sm:sr-only">Escribirles</span>
            </Button>
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

      <ConfirmDialog
        confirmLabel={confirm?.kind === "undo" ? "Deshacer" : "Cancelar el lugar"}
        description={
          confirm?.kind === "undo"
            ? "Vuelve a figurar por llegar; el escaneo queda en el historial."
            : "Le avisamos por mail y el lugar pasa a quien sigue en la lista de espera. Quien ya entró no se toca."
        }
        open={confirm !== null}
        pending={cancel.isPending || undo.isPending}
        pendingLabel={confirm?.kind === "undo" ? "Deshaciendo…" : "Cancelando…"}
        title={
          confirm?.kind === "undo"
            ? `¿Deshacer la acreditación de ${confirm.people[0]?.name}?`
            : confirm?.people.length === 1
              ? `¿Cancelar el lugar de ${confirm.people[0]?.name}?`
              : `¿Cancelar ${confirm?.people.length} lugares?`
        }
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "undo") undo.mutate({ eventId, attendeeId: confirm.people[0]?.id ?? "" });
          else cancel.mutate({ ...input, attendeeIds: confirm.people.map((person) => person.id) });
        }}
        onOpenChange={(open) => !open && setConfirm(null)}
      />

      <Dialog open={writing} onOpenChange={setWriting}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Escribirles</DialogTitle>
            <DialogDescription>
              A {chosen.filter(writable).length} de las personas elegidas, por mail (quienes se dieron de baja no).
            </DialogDescription>
          </DialogHeader>
          <Composer
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
