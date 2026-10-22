import { and, asc, count, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { Effect } from "effect";

import {
  attendeeSync,
  attendees,
  communities,
  events,
  incidents,
  obsInstances,
  outboundMessages,
  owyStageState,
  rooms,
  runOfShowItems,
  schedules,
  screens,
  staffTaskAssignments,
  staffTasks,
  surveys,
  tracks,
} from "../../db/schema";
import { slotDay, wallClock } from "../../slot-day";
import { query } from "../db";
import { NotFound } from "../errors";
import { visibleTo } from "../incidents/service";
import { memberRole } from "../scope";
import { ONLINE_MS } from "../screens/service";
import { CurrentUser } from "../services";
import * as StaffTasks from "../staff-tasks/service";
import type { PrepItem, ShellStatus } from "./schemas";

/** OBS counts as rehearsed if an operator connected it this recently. */
const OBS_REHEARSED_MS = 14 * 24 * 3_600_000;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (total: number) => {
  const clamped = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};
const daysBetween = (fromDay: string, toDay: string) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);

const countOf = (rows: { value: number }[]) => rows[0]?.value ?? 0;

/** Before its day, on it (its whole day, until it ends), or over. */
export const eventPhase = (event: { startDate: Date; endDate: Date; timezone: string }, now: Date) => {
  const today = wallClock(now, event.timezone).slice(0, 10);
  const startDay = wallClock(event.startDate, event.timezone).slice(0, 10);
  const phase: ShellStatus["phase"] = now > event.endDate ? "post" : today < startDay ? "pre" : "live";

  return { phase, daysLeft: Math.max(0, daysBetween(today, startDay)), today };
};

/**
 * What runs now and next on the event's clock: the run of show when it has moments
 * (with its drift), else the board's time slots.
 */
const eventClock = (eventId: string, timezone: string, now: Date) =>
  Effect.gen(function* () {
    const clock = wallClock(now, timezone);
    const nowMin = minutes(clock.slice(11));
    const [moments, slots] = yield* Effect.all(
      [
        query((db) =>
          db
            .select()
            .from(runOfShowItems)
            .where(eq(runOfShowItems.eventId, eventId))
            .orderBy(asc(runOfShowItems.position))
        ),
        query((db) =>
          db
            .select()
            .from(schedules)
            .where(and(eq(schedules.openSpaceId, eventId), eq(schedules.isActive, true)))
        ),
      ],
      { concurrency: "unbounded" }
    );

    if (moments.length > 0) {
      const runningIndex = moments.findIndex((moment) => moment.actualStart && !moment.actualEnd);
      const plannedIndex = moments.findIndex(
        (moment) => minutes(moment.plannedStart) <= nowMin && nowMin < minutes(moment.plannedStart) + moment.durationMin
      );
      const index = runningIndex >= 0 ? runningIndex : plannedIndex;
      const current = index >= 0 ? moments[index] : null;
      const next = index >= 0 ? moments[index + 1] : moments.find((moment) => minutes(moment.plannedStart) > nowMin);
      const block = (moment: (typeof moments)[number]) => ({
        title: moment.title,
        start: moment.plannedStart,
        end: hhmm(minutes(moment.plannedStart) + moment.durationMin),
      });
      const drift =
        current?.actualStart != null
          ? minutes(wallClock(current.actualStart, timezone).slice(11)) - minutes(current.plannedStart)
          : null;

      return { current: current ? block(current) : null, next: next ? block(next) : null, driftMin: drift };
    }

    const sorted = slots.toSorted((a, b) =>
      `${slotDay(a.date.toISOString())}T${a.startTime}`.localeCompare(`${slotDay(b.date.toISOString())}T${b.startTime}`)
    );
    const start = (slot: (typeof sorted)[number]) => `${slotDay(slot.date.toISOString())}T${slot.startTime}`;
    const end = (slot: (typeof sorted)[number]) => `${slotDay(slot.date.toISOString())}T${slot.endTime}`;
    const current = sorted.find((slot) => start(slot) <= clock && clock < end(slot)) ?? null;
    const next = sorted.find((slot) => start(slot) > clock) ?? null;
    const block = (slot: (typeof sorted)[number]) => ({ title: slot.name, start: slot.startTime, end: slot.endTime });

    return { current: current ? block(current) : null, next: next ? block(next) : null, driftMin: null };
  });

export const getStatus = (eventId: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const now = new Date();
    const [row] = yield* query((db) =>
      db
        .select({
          event: events,
          communityName: communities.name,
          communitySlug: communities.slug,
          communityLogoUrl: communities.logoUrl,
        })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(eq(events.id, eventId))
    );
    if (!row) return yield* new NotFound({ entity: "event", message: "Ese evento no existe" });
    const { event } = row;
    const siteAdmin = me.role === "admin";
    const role = yield* memberRole(event.communityId, me.id);
    const organizer = siteAdmin || role === "owner" || role === "admin";

    const [
      clock,
      talks,
      roomCount,
      slotCount,
      moments,
      taskRows,
      attendeeCount,
      checkedIn,
      sync,
      announcements,
      openIncidentRows,
      screenRows,
      stage,
      obs,
      cadence,
      survey,
    ] = yield* Effect.all(
      [
        eventClock(event.id, event.timezone, now),
        query((db) => db.select({ value: count() }).from(tracks).where(eq(tracks.openSpaceId, eventId))),
        query((db) =>
          db
            .select({ value: count() })
            .from(rooms)
            .where(and(eq(rooms.openSpaceId, eventId), eq(rooms.isActive, true)))
        ),
        query((db) =>
          db
            .select({ value: count() })
            .from(schedules)
            .where(and(eq(schedules.openSpaceId, eventId), eq(schedules.isActive, true)))
        ),
        query((db) => db.select({ value: count() }).from(runOfShowItems).where(eq(runOfShowItems.eventId, eventId))),
        query((db) =>
          db
            .select({ id: staffTasks.id, minPeople: staffTasks.minPeople, people: count(staffTaskAssignments.id) })
            .from(staffTasks)
            .leftJoin(staffTaskAssignments, eq(staffTaskAssignments.taskId, staffTasks.id))
            .where(and(eq(staffTasks.openSpaceId, eventId), ne(staffTasks.type, "milestone")))
            .groupBy(staffTasks.id)
        ),
        query((db) =>
          db
            .select({ value: count() })
            .from(attendees)
            // Has a ticket or already came in, as Asistentes counts: a refund after entering still came.
            .where(
              and(
                eq(attendees.eventId, eventId),
                or(eq(attendees.status, "attending"), isNotNull(attendees.checkedInAt))
              )
            )
        ),
        query((db) =>
          db
            .select({ value: count() })
            .from(attendees)
            .where(and(eq(attendees.eventId, eventId), isNotNull(attendees.checkedInAt)))
        ),
        query((db) => db.select().from(attendeeSync).where(eq(attendeeSync.eventId, eventId))),
        StaffTasks.listAnnouncements(eventId),
        query((db) =>
          db
            .select({ severity: incidents.severity })
            .from(incidents)
            .where(
              and(eq(incidents.eventId, eventId), ne(incidents.status, "resolved"), visibleTo({ id: me.id, organizer }))
            )
        ),
        query((db) =>
          db
            .select({ name: screens.name, lastSeenAt: screens.lastSeenAt })
            .from(screens)
            .where(eq(screens.eventId, eventId))
        ),
        siteAdmin
          ? query((db) =>
              db.select({ scene: owyStageState.scene }).from(owyStageState).where(eq(owyStageState.id, "global"))
            )
          : Effect.succeed([]),
        siteAdmin ? query((db) => db.select().from(obsInstances).where(eq(obsInstances.id, 1))) : Effect.succeed([]),
        query((db) =>
          db
            .select({ value: count() })
            .from(outboundMessages)
            .where(
              and(
                eq(outboundMessages.eventId, eventId),
                inArray(outboundMessages.step, ["t-7", "t-1", "morning", "t+1"]),
                ne(outboundMessages.status, "failed")
              )
            )
        ),
        query((db) => db.select({ questions: surveys.questions }).from(surveys).where(eq(surveys.eventId, eventId))),
      ],
      { concurrency: "unbounded" }
    );

    const { phase, daysLeft } = eventPhase(event, now);
    const synced = sync[0]?.syncedAt != null;
    const withMinimum = taskRows.filter((task) => task.minPeople != null);
    const understaffed = withMinimum.filter((task) => task.people < (task.minPeople ?? 0)).length;
    const screensOnline = screenRows.filter((screen) => now.getTime() - screen.lastSeenAt.getTime() < ONLINE_MS);
    const obsRow = obs[0];
    const obsOnline =
      Boolean(obsRow?.executorId) &&
      (obsRow?.executorSeenAt?.getTime() ?? 0) > now.getTime() - 30_000 &&
      obsRow?.connected;
    const obsRehearsed = obsRow?.statusAt ? now.getTime() - obsRow.statusAt.getTime() < OBS_REHEARSED_MS : false;
    const cadenceCount = countOf(cadence);

    const prep: PrepItem[] = [
      {
        key: "structure",
        title: "Salas y horarios definidos",
        meta: `${countOf(roomCount)} salas · ${countOf(slotCount)} bloques`,
        done: countOf(roomCount) > 0 && countOf(slotCount) > 0,
        href: "/admin/openspace",
      },
      {
        key: "eventbrite",
        title: "Eventbrite conectado",
        meta: synced ? `${countOf(attendeeCount)} entradas sincronizadas` : "Todavía no se sincronizó",
        done: synced,
        href: "/admin/attendees",
      },
      {
        key: "rundown",
        title: "Guion del día cargado",
        meta: countOf(moments) > 0 ? `${countOf(moments)} momentos` : "Sin momentos",
        done: countOf(moments) > 0,
        href: "/admin/guion",
      },
      {
        key: "staff",
        title: "Turnos del staff cubiertos",
        meta:
          withMinimum.length > 0
            ? `${withMinimum.length - understaffed} de ${withMinimum.length} tareas con gente suficiente`
            : `${taskRows.length} tareas, ninguna pide un mínimo de gente`,
        done: taskRows.length > 0 && understaffed === 0,
        href: "/admin/tareas",
      },
      {
        key: "screens",
        title: "Pantallas nombradas",
        meta:
          screenRows.length > 0
            ? `${screenRows.filter((screen) => screen.name).length} de ${screenRows.length} con nombre`
            : "Ninguna pantalla se conectó todavía",
        done: screenRows.length > 0 && screenRows.every((screen) => screen.name),
        href: "/admin/pantallas",
      },
      {
        key: "obs",
        title: "OBS probado",
        meta: obsRow?.statusAt ? "Se conectó en las últimas dos semanas" : "Nadie lo conectó todavía",
        done: obsRehearsed,
        href: "/admin/screen",
      },
      {
        key: "comms",
        title: "Mensajes del día programados",
        meta: `${Math.min(cadenceCount, 4)} de 4 (T-7, T-1, mañana del evento, T+1)`,
        done: cadenceCount >= 4,
        href: "/admin/comunicacion",
      },
      {
        key: "survey",
        title: "Encuesta post-evento lista",
        meta: survey[0] ? `${survey[0].questions.length} preguntas` : "Sin encuesta",
        done: (survey[0]?.questions.length ?? 0) > 0,
        href: "/admin/comunicacion",
      },
    ];

    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        communityId: event.communityId,
        communityName: row.communityName,
        communitySlug: row.communitySlug,
        communityLogoUrl: row.communityLogoUrl,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        timezone: event.timezone,
      },
      phase,
      daysLeft,
      me: { siteAdmin, role },
      clock,
      counts: {
        talks: countOf(talks),
        moments: countOf(moments),
        tasks: taskRows.length,
        attendees: synced ? countOf(attendeeCount) : null,
        checkedIn: synced ? countOf(checkedIn) : null,
        unackedAnnouncements: announcements.filter((announcement) =>
          announcement.pending.some((person) => person.userId === me.id)
        ).length,
        openIncidents: openIncidentRows.length,
        criticalIncidents: openIncidentRows.filter(
          (incident) => incident.severity === "high" || incident.severity === "critical"
        ).length,
        screensOnline: screensOnline.length,
        screensTotal: screenRows.length,
      },
      live: siteAdmin
        ? {
            wallScene: stage[0]?.scene ?? "black",
            onAir: (stage[0]?.scene ?? "black") !== "black",
            obsConnected: obsOnline,
            obsStreaming: obsOnline && obsRow?.streaming,
            obsRecording: obsOnline && obsRow?.recording,
          }
        : null,
      prep,
    } satisfies ShellStatus;
  });
