"use client";

import * as React from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, MapPin, Send, UserRoundCheck } from "lucide-react";

import { cn } from "app/lib/utils";
import { usePresence } from "components/Admin/shell/presence";
import { MicroLabel } from "components/Admin/ui/page";
import { AvatarStack, PersonAvatar } from "components/Admin/ui/person";
import { formatClock, RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { IncidentDetail, IncidentStatus } from "lib/orpc/incidents/schemas";
import { roomColorFor } from "lib/rooms/palette";

import {
  CATEGORY,
  firstName,
  incidentPlace,
  SEVERITIES,
  SeverityDot,
  SeverityLabel,
  SOURCE_LABEL,
  STATUSES,
  StatusBadge,
} from "./meta";
import type { RoomOption } from "./ReportIncident";

export type RosterPerson = { userId: string; name: string; image: string | null };

const UNASSIGNED = "none";
const NO_ROOM = "none";
/** Log lines the server writes for a change (as opposed to a note someone typed). */
const CHANGE_LINE = /^(cambió|asignó|se lo asignó|lo dejó|lo movió|le sacó)/;

/** Status, assignment, notes: every write answers with the incident, which replaces the cached one. */
export function useIncidentActions(eventId: string, id: string) {
  const queryClient = useQueryClient();
  const settle = (incident: IncidentDetail) => {
    queryClient.setQueryData(orpc.incidents.get.queryKey({ input: { eventId, id } }), incident);
    void queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key({ input: { eventId } }) });
  };
  const fail = (title: string) => (error: Error) => toast.error(title, error.message);

  return {
    update: useMutation(
      orpc.incidents.update.mutationOptions({ onSuccess: settle, onError: fail("No se pudo cambiar") })
    ),
    take: useMutation(
      orpc.incidents.assignToMe.mutationOptions({
        onSuccess: (incident) => {
          settle(incident);
          toast.success("Es tuyo", `«${incident.title}» quedó en curso a tu nombre.`);
        },
        onError: fail("No se pudo tomar"),
      })
    ),
    note: useMutation(
      orpc.incidents.addNote.mutationOptions({ onSuccess: settle, onError: fail("No se pudo anotar") })
    ),
  };
}

/** Title, chips and where/who/when, for the top of the detail. */
export function IncidentSummary({ incident, showTitle = true }: { incident: IncidentDetail; showTitle?: boolean }) {
  const category = CATEGORY[incident.category];
  const { peers } = usePresence();
  const watching = peers.filter((peer) => peer.focus === incident.id);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="gap-1.5" variant="outline">
          <SeverityDot incident={incident} />
          <SeverityLabel className="text-2xs" severity={incident.severity} />
        </Badge>
        <Badge variant="secondary">
          <category.icon aria-hidden />
          {category.label}
        </Badge>
        <StatusBadge status={incident.status} />
        {incident.sensitive ? (
          <Badge variant="destructive">
            <LockKeyhole aria-hidden />
            Confidencial
          </Badge>
        ) : null}
        {watching.length > 0 ? (
          <span className="ml-auto flex items-center gap-1.5 text-meta text-muted-foreground">
            <AvatarStack
              details="Mirando"
              people={watching.map((peer) => ({ id: peer.userId, name: peer.name, image: peer.image }))}
              size={18}
            />
            mirando
          </span>
        ) : null}
      </div>
      {showTitle ? <h3 className="text-[15px] leading-snug font-semibold text-foreground">{incident.title}</h3> : null}
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-muted-foreground">
        {incidentPlace(incident) ? (
          <>
            <MapPin aria-hidden className="size-3.5" />
            <span className="text-subtle">{incidentPlace(incident)}</span>
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span>
          {incident.reporter ? `reportó ${firstName(incident.reporter.name)}` : "reportado"}{" "}
          {SOURCE_LABEL[incident.source]}
        </span>
        <span aria-hidden>·</span>
        <RelativeTime date={incident.createdAt} />
      </p>
    </div>
  );
}

function Row({ label, top = false, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return (
    <>
      {/* `top`: lined up with the first control when a note sits under it. */}
      <dt
        className={cn("text-meta text-muted-foreground", top ? "self-start pt-2 pointer-coarse:pt-4" : "self-center")}
      >
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/**
 * The working part of an incident: who has it and in what state (editable by editors; its
 * assignee moves the status), the description and photo, and the log.
 */
export function IncidentBody({
  incident,
  eventId,
  meId,
  canEdit,
  timezone,
  rooms,
  roster,
}: {
  incident: IncidentDetail;
  eventId: string;
  meId: string;
  canEdit: boolean;
  timezone?: string;
  rooms: RoomOption[];
  roster: RosterPerson[];
}) {
  const { update, take } = useIncidentActions(eventId, incident.id);
  const mine = incident.assignee?.id === meId;
  const canMoveStatus = canEdit || mine;
  const busy = update.isPending || take.isPending;
  const people =
    incident.assignee && !roster.some((person) => person.userId === incident.assignee?.id)
      ? [{ userId: incident.assignee.id, name: incident.assignee.name, image: incident.assignee.image }, ...roster]
      : roster;

  const setStatus = (status: IncidentStatus) => update.mutate({ eventId, id: incident.id, status });

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
        <Row label="Estado" top={!canMoveStatus}>
          <ToggleGroup.Root
            aria-label="Estado"
            className="grid h-8 grid-cols-3 rounded-lg border border-input bg-background p-0.5 pointer-coarse:h-12"
            disabled={!canMoveStatus || busy}
            type="single"
            value={incident.status}
            onValueChange={(value) => value && setStatus(value as IncidentStatus)}
          >
            {STATUSES.map((item) => (
              <ToggleGroup.Item
                key={item.value}
                className={cn(
                  "rounded-md text-meta font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden disabled:cursor-not-allowed",
                  incident.status === item.value
                    ? "bg-raised text-foreground shadow-[inset_0_0_0_1px_hsl(var(--input)),0_1px_2px_rgb(0_0_0/0.5)]"
                    : cn("text-muted-foreground enabled:hover:text-foreground", !canMoveStatus && "opacity-50")
                )}
                value={item.value}
              >
                {item.label}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
          {canMoveStatus ? null : (
            // Read-only for them: say so, rather than a control that does nothing when pressed.
            <p className="mt-1.5 text-meta text-muted-foreground">
              {incident.status === "resolved"
                ? "Lo reabre quien lo tenía asignado o un editor."
                : "Tomalo para cambiarle el estado."}
            </p>
          )}
        </Row>

        <Row label="Asignado">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <Select
                disabled={busy}
                value={incident.assignee?.id ?? UNASSIGNED}
                onValueChange={(value) =>
                  update.mutate({ eventId, id: incident.id, assigneeId: value === UNASSIGNED ? null : value })
                }
              >
                <SelectTrigger aria-label="Asignado" className="min-w-[10rem] flex-1 text-left">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Nadie todavía</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      <span className="flex min-w-0 items-center gap-2">
                        <PersonAvatar image={person.image} name={person.name} size={18} />
                        <span className="truncate whitespace-nowrap">{person.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-2 text-ui text-foreground">
                {incident.assignee ? (
                  <>
                    <PersonAvatar image={incident.assignee.image} name={incident.assignee.name} size={20} />
                    <span className="truncate">{incident.assignee.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Nadie todavía</span>
                )}
              </span>
            )}
            {!mine && incident.status !== "resolved" ? (
              <Button
                className="shrink-0"
                disabled={busy}
                size="sm"
                variant="outline"
                onClick={() => take.mutate({ eventId, id: incident.id })}
              >
                <UserRoundCheck />
                Tomarlo
              </Button>
            ) : null}
          </div>
        </Row>

        <Row label="Gravedad">
          {canEdit ? (
            <Select
              disabled={busy}
              value={incident.severity}
              onValueChange={(value) =>
                update.mutate({ eventId, id: incident.id, severity: value as IncidentDetail["severity"] })
              }
            >
              <SelectTrigger aria-label="Gravedad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <SeverityLabel className="text-ui" severity={item.value} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <SeverityLabel className="text-ui" severity={incident.severity} />
          )}
        </Row>

        <Row label="Sala">
          {canEdit ? (
            <Select
              disabled={busy}
              value={incident.room?.id ?? NO_ROOM}
              onValueChange={(value) =>
                update.mutate({ eventId, id: incident.id, roomId: value === NO_ROOM ? null : value })
              }
            >
              <SelectTrigger aria-label="Sala">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>Ninguna sala</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: roomColorFor(room.id, room.color) }}
                      />
                      {room.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-ui text-foreground">{incident.room?.name ?? "—"}</span>
          )}
        </Row>
      </dl>

      {incident.description || incident.photo ? (
        <section className="space-y-2.5">
          <MicroLabel>Detalle</MicroLabel>
          {incident.description ? (
            <p className="text-ui whitespace-pre-wrap text-foreground">{incident.description}</p>
          ) : null}
          {incident.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL from the reporter's phone
            <img
              alt={`Foto de «${incident.title}»`}
              className="max-h-80 w-full rounded-lg border border-border bg-background object-contain"
              src={incident.photo}
            />
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <MicroLabel>Registro</MicroLabel>
          <span className="text-2xs text-muted-foreground">No se edita ni se borra</span>
        </div>
        <ol className="space-y-3">
          <li className="flex gap-2.5">
            <PersonAvatar
              className="mt-px"
              image={incident.reporter?.image}
              name={incident.reporter?.name ?? "Owy"}
              size={20}
            />
            <p className="min-w-0 flex-1 text-meta text-muted-foreground">
              <span className="font-medium text-subtle">{incident.reporter?.name ?? "Alguien"}</span> lo reportó{" "}
              {SOURCE_LABEL[incident.source]}
            </p>
            <LogTime date={incident.createdAt} timezone={timezone} />
          </li>
          {incident.notes.map((note) =>
            CHANGE_LINE.test(note.body) ? (
              <li key={note.id} className="flex gap-2.5">
                <PersonAvatar className="mt-px" image={note.author?.image} name={note.author?.name ?? "?"} size={20} />
                <p className="min-w-0 flex-1 text-meta text-muted-foreground">
                  <span className="font-medium text-subtle">{note.author?.name ?? "Alguien"}</span> {note.body}
                </p>
                <LogTime date={note.createdAt} timezone={timezone} />
              </li>
            ) : (
              <li key={note.id} className="flex gap-2.5">
                <PersonAvatar className="mt-0.5" image={note.author?.image} name={note.author?.name ?? "?"} size={20} />
                <div className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-meta font-medium text-subtle">{note.author?.name ?? "Alguien"}</p>
                  <p className="mt-0.5 text-ui whitespace-pre-wrap text-foreground">{note.body}</p>
                </div>
                <LogTime date={note.createdAt} timezone={timezone} />
              </li>
            )
          )}
        </ol>
      </section>
    </div>
  );
}

function LogTime({ date, timezone }: { date: string; timezone?: string }) {
  return (
    <time
      className="shrink-0 pt-px font-terminal text-2xs text-muted-foreground tabular-nums"
      dateTime={date}
      suppressHydrationWarning
    >
      {formatClock(new Date(date), timezone)}
    </time>
  );
}

/** Append a note: ⌘⏎ (or Ctrl⏎) sends it. */
export function NoteComposer({ eventId, incidentId }: { eventId: string; incidentId: string }) {
  const { note } = useIncidentActions(eventId, incidentId);
  const [body, setBody] = React.useState("");

  const send = () => {
    const text = body.trim();
    if (!text || note.isPending) return;
    note.mutate({ eventId, id: incidentId, body: text }, { onSuccess: () => setBody("") });
  };

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Textarea
        aria-label="Nota"
        className="min-h-[40px] resize-none"
        disabled={note.isPending}
        maxLength={2000}
        placeholder="Anotá qué hiciste o qué falta…"
        rows={1}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          }
        }}
      />
      <Button disabled={!body.trim() || note.isPending} type="submit" variant="outline">
        <Send />
        Anotar
      </Button>
    </form>
  );
}
