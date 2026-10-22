"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Bookmark, ChevronLeft, ChevronRight, Star } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel } from "components/Admin/ui/page";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { addDays, weekdayOf } from "lib/calendar/holidays";
import { monthRange, shiftMonth } from "lib/calendar/items";
import { dayKey, shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { EditableEvent } from "lib/orpc/events/schemas";

import { LEVEL, REASON } from "../calendar/CalendarClient";

const TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00"];
const DURATIONS = [
  { value: 60, label: "1 h" },
  { value: 90, label: "1 h 30" },
  { value: 120, label: "2 h" },
  { value: 180, label: "3 h" },
  { value: 240, label: "4 h" },
];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const clockOf = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
const onDay = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", ...options }).format(new Date(`${day}T12:00:00Z`));

/**
 * Step 3: the community's calendar in small. A draft reserves its date here (every organizer sees
 * it); a published event moves to another one (its attendees hear about it).
 */
export function DatePicker({
  event,
  communityId,
  today,
  onHeld,
  onSchedule,
}: {
  event: EditableEvent;
  communityId: string;
  today: string;
  onHeld: () => void;
  onSchedule: (schedule: { day: string; startTime: string; durationMin: number }) => void;
}) {
  const current = dayKey(event.startDate);
  // Without a date yet, open where there's time to promote it (three weeks out)
  const [month, setMonth] = useState((event.dateChosen ? current : addDays(today, 21)).slice(0, 7));
  const [day, setDay] = useState<string | null>(event.dateChosen ? current : null);
  const initialTime = clockOf(event.startDate);
  const [startTime, setStartTime] = useState(TIMES.includes(initialTime) ? initialTime : "19:00");
  const initialLength = Math.round((Date.parse(event.endDate) - Date.parse(event.startDate)) / 60_000);
  const [durationMin, setDurationMin] = useState(
    DURATIONS.some((option) => option.value === initialLength) ? initialLength : 120
  );

  const plan = useQuery(
    orpc.calendar.plan.queryOptions({
      input: { communityId, month, startTime, durationMin, venueId: event.venueId ?? undefined },
      placeholderData: keepPreviousData,
    })
  );
  const hold = useMutation(
    orpc.events.hold.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Reservaste el ${shortWhen(result.startDate)}`,
          result.headsUp > 0
            ? "Le avisamos a las comunidades con público parecido."
            : "Todas las comunidades la ven por 14 días."
        );
        onHeld();
      },
      onError: (error) => toast.error("No se pudo reservar", error.message),
    })
  );

  const scores = new Map((plan.data?.days ?? []).map((entry) => [entry.day, entry]));
  const suggested = new Set((plan.data?.suggestions ?? []).map((entry) => entry.day));
  const { from, to } = monthRange(month);
  const cells: string[] = [];
  for (
    let cell = addDays(from, -((weekdayOf(from) + 6) % 7));
    cell <= addDays(to, (7 - weekdayOf(to)) % 7);
    cell = addDays(cell, 1)
  ) {
    cells.push(cell);
  }
  const chosen = day ? scores.get(day) : undefined;
  const published = event.status === "published";
  const heldHere = !published && event.heldUntil !== null && Date.parse(event.heldUntil) > Date.now();
  const unchanged =
    day === current && startTime === initialTime && durationMin === initialLength && (published || heldHere);

  return (
    <div className="grid gap-4 @2xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Button
            aria-label="Mes anterior"
            size="icon-sm"
            variant="ghost"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="font-terminal text-ui text-foreground tabular-nums first-letter:uppercase">
            {onDay(`${month}-15`, { month: "long", year: "numeric" })}
          </span>
          <Button
            aria-label="Mes siguiente"
            size="icon-sm"
            variant="ghost"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Días del mes">
          {WEEKDAYS.map((weekday, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- weekday initials repeat (M, M)
            <span key={index} aria-hidden className="text-center font-terminal text-2xs text-faint">
              {weekday}
            </span>
          ))}
          {cells.map((cell) => {
            const score = scores.get(cell);
            const level = score ? LEVEL[score.level] : null;
            const inMonth = cell >= from && cell <= to;

            return (
              <button
                key={cell}
                aria-label={`${onDay(cell, { weekday: "long", day: "numeric", month: "long" })}${level ? `, ${level.label}` : ""}`}
                aria-pressed={cell === day}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-md border border-transparent font-terminal text-meta tabular-nums transition-colors",
                  inMonth ? "text-foreground hover:bg-raised" : "text-faint",
                  score?.blocked && "text-faint line-through",
                  cell === day && "border-primary bg-primary-surface",
                  cell === current && event.dateChosen && cell !== day && "border-dashed border-info/70"
                )}
                disabled={!inMonth || score?.blocked}
                type="button"
                onClick={() => setDay(cell)}
              >
                {Number(cell.slice(8))}
                {inMonth && level && !score?.blocked ? (
                  <level.icon aria-hidden className={cn("absolute right-0.5 bottom-0.5 size-2.5", level.tone)} />
                ) : null}
                {inMonth && suggested.has(cell) ? (
                  <Star aria-hidden className="absolute top-0.5 right-0.5 size-2.5 fill-success text-success" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Select value={startTime} onValueChange={setStartTime}>
            <SelectTrigger aria-label="Hora de inicio" className="flex-1 font-terminal tabular-nums">
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
          <Select value={String(durationMin)} onValueChange={(value) => setDurationMin(Number(value))}>
            <SelectTrigger aria-label="Duración" className="flex-1 font-terminal tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((option) => (
                <SelectItem key={option.value} className="font-terminal tabular-nums" value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {plan.data && !day ? (
          <div className="flex flex-col gap-1.5">
            <MicroLabel>Te sugerimos</MicroLabel>
            {plan.data.suggestions.slice(0, 3).map((entry) => {
              const level = LEVEL[entry.level];

              return (
                <button
                  key={entry.day}
                  className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-left transition-colors hover:bg-raised"
                  type="button"
                  onClick={() => setDay(entry.day)}
                >
                  <level.icon aria-hidden className={cn("size-3.5", level.tone)} />
                  <span className="font-terminal text-ui text-foreground tabular-nums">
                    {onDay(entry.day, { weekday: "short", day: "numeric", month: "short" }).replaceAll(".", "")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
                    {(entry.reasons.find((reason) => reason.tone !== "ok") ?? entry.reasons[0])?.text}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {!plan.data ? <Skeleton className="h-32" /> : null}
        {day && chosen ? (
          <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-raised/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ui font-medium text-foreground first-letter:uppercase">
                {onDay(day, { weekday: "long", day: "numeric", month: "long" }).replace(",", "")}
              </span>
              <Badge variant={LEVEL[chosen.level].badge}>
                {LEVEL[chosen.level].label} · <span className="font-terminal tabular-nums">{chosen.score}</span>
              </Badge>
            </div>
            <ul className="flex flex-col gap-1">
              {chosen.reasons.slice(0, 4).map((reason) => {
                const { icon: Icon, tone } = REASON[reason.tone];

                return (
                  <li key={reason.text} className="flex items-start gap-2 text-meta text-foreground">
                    <Icon aria-hidden className={cn("mt-px size-3.5 shrink-0", tone)} />
                    {reason.text}
                  </li>
                );
              })}
            </ul>
            {published ? (
              <Button
                disabled={unchanged}
                variant="outline"
                onClick={() => onSchedule({ day, startTime, durationMin })}
              >
                Mover el evento a este día
              </Button>
            ) : (
              <Button
                disabled={hold.isPending || unchanged}
                onClick={() => hold.mutate({ communityId, eventId: event.id, day, startTime, durationMin })}
              >
                <Bookmark />
                {heldHere && day === current ? "Ya está reservado" : "Reservar esta fecha"}
              </Button>
            )}
            <p className="text-meta text-muted-foreground">
              {published
                ? "Quienes se anotaron reciben el cambio y la invitación actualizada."
                : "Todas las comunidades la ven por 14 días; la renovás desde Inicio."}
            </p>
          </div>
        ) : null}
        {heldHere && event.heldUntil ? (
          <p className="flex items-center gap-1.5 text-meta text-info-foreground">
            <Bookmark aria-hidden className="size-3.5" />
            Reservado el {shortWhen(event.startDate)}, hasta el {shortWhen(event.heldUntil).split(" · ")[0]}
          </p>
        ) : null}
      </div>
    </div>
  );
}
