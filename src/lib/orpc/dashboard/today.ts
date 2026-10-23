import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Effect } from "effect";

import {
  activity,
  attendeeSync,
  attendees,
  events,
  incidents,
  obsCues,
  obsInstances,
  outboundMessages,
  owyStageState,
  rooms,
  runOfShowItems,
  schedules,
  screens,
  staffArrivals,
  staffTaskAssignments,
  staffTasks,
  surveyResponses,
  surveys,
  tracks,
  user,
} from "../../db/schema";
import { owyChannels } from "../../owy/messaging";
import { isSceneId, SCENES } from "../../owy-stage/scenes";
import { slotDay, wallClock } from "../../slot-day";
import { query } from "../db";
import { NotFound } from "../errors";
import { eventPhase } from "../shell/service";
import * as StaffTasks from "../staff-tasks/service";
import type { Today, TodayMoment } from "./today-schemas";

const SCREEN_ONLINE_MS = 60_000;
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const CHAPTER_CLOCK = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
};

export const getToday = (eventId: string) =>
  Effect.gen(function* () {
    const now = new Date();
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, eventId)));
    if (!event) return yield* new NotFound({ entity: "event", message: "Ese evento no existe" });

    const { phase } = eventPhase(event, now);
    const clock = wallClock(now, event.timezone);
    const today = clock.slice(0, 10);
    const nowMin = toMinutes(clock.slice(11));

    const [
      attendeeRows,
      sync,
      slotRows,
      roomRows,
      trackRows,
      taskRows,
      assignmentRows,
      arrivalRows,
      announcements,
      shift,
      stageRows,
      obsRows,
      momentRows,
      incidentRows,
      activityRows,
      screenRows,
      messageRows,
      surveyRows,
    ] = yield* Effect.all(
      [
        query((db) =>
          db
            .select({
              status: attendees.status,
              registeredAt: attendees.registeredAt,
              checkedInAt: attendees.checkedInAt,
              checkinDevice: attendees.checkinDevice,
            })
            .from(attendees)
            .where(eq(attendees.eventId, eventId))
        ),
        query((db) => db.select().from(attendeeSync).where(eq(attendeeSync.eventId, eventId))),
        query((db) =>
          db
            .select()
            .from(schedules)
            .where(and(eq(schedules.openSpaceId, eventId), eq(schedules.isActive, true)))
        ),
        query((db) =>
          db
            .select()
            .from(rooms)
            .where(and(eq(rooms.openSpaceId, eventId), eq(rooms.isActive, true)))
            .orderBy(asc(rooms.sortOrder), asc(rooms.name))
        ),
        query((db) => db.select().from(tracks).where(eq(tracks.openSpaceId, eventId))),
        query((db) => db.select().from(staffTasks).where(eq(staffTasks.openSpaceId, eventId))),
        query((db) =>
          db
            .select({
              taskId: staffTaskAssignments.taskId,
              noShow: staffTaskAssignments.noShow,
              id: user.id,
              name: user.name,
              image: user.image,
            })
            .from(staffTaskAssignments)
            .innerJoin(staffTasks, eq(staffTasks.id, staffTaskAssignments.taskId))
            .innerJoin(user, eq(user.id, staffTaskAssignments.userId))
            .where(eq(staffTasks.openSpaceId, eventId))
        ),
        query((db) =>
          db
            .select({
              arrivedAt: staffArrivals.arrivedAt,
              leftAt: staffArrivals.leftAt,
              id: user.id,
              name: user.name,
              image: user.image,
            })
            .from(staffArrivals)
            .innerJoin(user, eq(user.id, staffArrivals.userId))
            .where(eq(staffArrivals.eventId, eventId))
            .orderBy(desc(staffArrivals.arrivedAt))
        ),
        StaffTasks.listAnnouncements(eventId),
        StaffTasks.onShift(eventId),
        query((db) => db.select().from(owyStageState).where(eq(owyStageState.id, "global"))),
        query((db) => db.select().from(obsInstances).where(eq(obsInstances.id, 1))),
        query((db) =>
          db
            .select({
              item: runOfShowItems,
              ownerId: user.id,
              ownerName: user.name,
              ownerImage: user.image,
              cueName: obsCues.name,
            })
            .from(runOfShowItems)
            .leftJoin(user, eq(user.id, runOfShowItems.ownerId))
            .leftJoin(obsCues, eq(obsCues.id, runOfShowItems.cueId))
            .where(eq(runOfShowItems.eventId, eventId))
            .orderBy(asc(runOfShowItems.position))
        ),
        query((db) =>
          db
            .select({
              incident: incidents,
              roomName: rooms.name,
              assigneeId: user.id,
              assigneeName: user.name,
              assigneeImage: user.image,
            })
            .from(incidents)
            .leftJoin(rooms, eq(rooms.id, incidents.roomId))
            .leftJoin(user, eq(user.id, incidents.assigneeId))
            // Public reports belong to the conduct page (its responders and OWU's staff), never this screen
            .where(and(eq(incidents.eventId, eventId), ne(incidents.source, "public")))
            .orderBy(desc(incidents.createdAt))
        ),
        query((db) =>
          db
            .select({
              id: activity.id,
              verb: activity.verb,
              summary: activity.summary,
              createdAt: activity.createdAt,
              actorId: user.id,
              actorName: user.name,
              actorImage: user.image,
            })
            .from(activity)
            .leftJoin(user, eq(user.id, activity.actorId))
            .where(eq(activity.eventId, eventId))
            .orderBy(desc(activity.createdAt))
            .limit(8)
        ),
        query((db) => db.select().from(screens).where(eq(screens.eventId, eventId)).orderBy(asc(screens.name))),
        query((db) =>
          db
            .select()
            .from(outboundMessages)
            .where(and(eq(outboundMessages.eventId, eventId), inArray(outboundMessages.status, ["sent", "scheduled"])))
            .orderBy(desc(outboundMessages.createdAt))
        ),
        query((db) => db.select().from(surveys).where(eq(surveys.eventId, eventId))),
      ],
      { concurrency: "unbounded" }
    );

    // ---- Attendance -----------------------------------------------------------------------
    const synced = sync[0]?.syncedAt ?? null;
    // Has a ticket or already came in, as Asistentes counts: a refund after entering still came.
    const attending = attendeeRows.filter((row) => row.status === "attending" || row.checkedInAt);
    const dayKey = (at: Date) => wallClock(at, event.timezone).slice(0, 10);
    const registrations =
      synced || attendeeRows.length > 0
        ? (() => {
            const days = Array.from({ length: 30 }, (_, index) =>
              dayKey(new Date(now.getTime() - (29 - index) * 86_400_000))
            );
            const counts = new Map<string, number>();
            let before = 0;
            for (const row of attending) {
              if (!row.registeredAt) continue;
              const key = dayKey(row.registeredAt);
              if (key < days[0]) before += 1;
              else counts.set(key, (counts.get(key) ?? 0) + 1);
            }
            let running = before;
            const series = days.map((day) => ({ day, total: (running += counts.get(day) ?? 0) }));
            const since = (ms: number) =>
              attending.filter((row) => row.registeredAt && now.getTime() - row.registeredAt.getTime() < ms).length;

            return {
              attending: attending.length,
              today: attending.filter((row) => row.registeredAt && dayKey(row.registeredAt) === today).length,
              week: since(7 * 86_400_000),
              series,
              syncedAt: synced?.toISOString() ?? null,
            };
          })()
        : null;

    const checked = attending.filter((row) => row.checkedInAt);
    const checkins =
      registrations === null
        ? null
        : {
            checkedIn: checked.length,
            attending: attending.length,
            last15: checked.filter((row) => now.getTime() - (row.checkedInAt?.getTime() ?? 0) < 15 * 60_000).length,
            lastHour: Array.from({ length: 12 }, (_, index) => {
              const from = now.getTime() - (12 - index) * 5 * 60_000;
              return checked.filter((row) => {
                const at = row.checkedInAt?.getTime() ?? 0;
                return at >= from && at < from + 5 * 60_000;
              }).length;
            }),
            byDevice: [...Map.groupBy(checked, (row) => row.checkinDevice ?? "Sin dato").entries()]
              .map(([device, rows]) => ({ device, count: rows.length }))
              .toSorted((a, b) => b.count - a.count),
            syncedAt: synced?.toISOString() ?? null,
          };

    // ---- The board: the slot on now, and every room's talk ----------------------------------
    const slots = slotRows.toSorted((a, b) =>
      `${slotDay(a.date.toISOString())}T${a.startTime}`.localeCompare(`${slotDay(b.date.toISOString())}T${b.startTime}`)
    );
    const start = (slot: (typeof slots)[number]) => `${slotDay(slot.date.toISOString())}T${slot.startTime}`;
    const end = (slot: (typeof slots)[number]) => `${slotDay(slot.date.toISOString())}T${slot.endTime}`;
    const currentIndex = slots.findIndex((slot) => start(slot) <= clock && clock < end(slot));
    const currentSlot = currentIndex >= 0 ? slots[currentIndex] : null;
    const nextSlot = slots.find((slot) => start(slot) > clock) ?? null;
    const slotView = (slot: (typeof slots)[number] | null) =>
      slot ? { name: slot.name, start: slot.startTime, end: slot.endTime } : null;

    const openByRoom = new Map<string, string>();
    for (const { incident } of incidentRows) {
      if (incident.status !== "resolved" && incident.roomId && !openByRoom.has(incident.roomId)) {
        openByRoom.set(incident.roomId, incident.sensitive ? "Reporte confidencial" : incident.title);
      }
    }

    const roomViews = roomRows.map((room) => {
      const current = currentSlot
        ? trackRows.find((track) => track.roomId === room.id && track.scheduleId === currentSlot.id)
        : undefined;
      const next = nextSlot
        ? trackRows.find((track) => track.roomId === room.id && track.scheduleId === nextSlot.id)
        : undefined;
      return {
        id: room.id,
        name: room.name,
        color: room.color,
        capacity: room.capacity,
        hasTV: room.hasTV,
        status: room.status,
        current: current ? { trackId: current.id, title: current.title, speaker: current.speaker } : null,
        next: next && nextSlot ? { trackId: next.id, title: next.title, start: nextSlot.startTime } : null,
        openIncident: openByRoom.get(room.id) ?? null,
      };
    });

    // ---- Staff: the same summary Staff y tareas shows (one shared rule for late and free) --------
    const workTasks = taskRows.filter((task) => task.type !== "milestone");
    const expectedIds = new Set(
      assignmentRows.filter((row) => workTasks.some((task) => task.id === row.taskId)).map((row) => row.id)
    );
    const taskTitle = new Map(taskRows.map((task) => [task.id, task.title]));
    const personOf = (row: (typeof shift.people)[number]) => ({ id: row.userId, name: row.name, image: row.image });

    // ---- The latest urgent announcement and who still has to read it --------------------------
    const urgentRow = announcements.find((item) => item.urgent);
    const urgent = urgentRow
      ? {
          id: urgentRow.id,
          body: urgentRow.body,
          author: urgentRow.author?.name ?? null,
          createdAt: urgentRow.createdAt,
          acked: urgentRow.acks.length,
          expected: urgentRow.acks.length + urgentRow.pending.length,
          pending: urgentRow.pending.map((item) => ({ id: item.userId, name: item.name, image: item.image })),
        }
      : null;

    // ---- On air ---------------------------------------------------------------------------
    const stage = stageRows[0];
    const obs = obsRows[0];
    const obsOnline =
      Boolean(obs?.executorId) &&
      (obs?.executorSeenAt?.getTime() ?? 0) > now.getTime() - 30_000 &&
      obs?.connected === true;
    const onAir = stage
      ? {
          scene: stage.scene,
          sceneTitle: isSceneId(stage.scene) ? SCENES[stage.scene].title : stage.scene,
          since: stage.updatedAt.toISOString(),
          obsConnected: obsOnline,
          streaming: obsOnline && obs?.streaming === true,
          recording: obsOnline && obs?.recording === true,
        }
      : null;

    // ---- Run of show --------------------------------------------------------------------------
    const moments: TodayMoment[] = momentRows.map(({ item, ownerId, ownerName, ownerImage, cueName }) => ({
      id: item.id,
      title: item.title,
      plannedStart: item.plannedStart,
      durationMin: item.durationMin,
      fixed: item.fixed,
      location: item.location,
      owner: ownerId && ownerName ? { id: ownerId, name: ownerName, image: ownerImage } : null,
      cueName,
      owyMessage: item.owyMessage,
      actualStart: item.actualStart?.toISOString() ?? null,
      actualEnd: item.actualEnd?.toISOString() ?? null,
    }));
    const runningIndex = moments.findIndex((moment) => moment.actualStart && !moment.actualEnd);
    const plannedIndex = moments.findIndex(
      (moment) =>
        toMinutes(moment.plannedStart) <= nowMin && nowMin < toMinutes(moment.plannedStart) + moment.durationMin
    );
    const pointer = runningIndex >= 0 ? runningIndex : phase === "live" ? plannedIndex : -1;
    const currentMoment = pointer >= 0 ? moments[pointer] : null;
    const nextIndex =
      pointer >= 0
        ? pointer + 1
        : moments.findIndex((moment) => !moment.actualStart && toMinutes(moment.plannedStart) >= nowMin);
    const driftOf = (moment: TodayMoment) =>
      moment.actualStart
        ? toMinutes(wallClock(new Date(moment.actualStart), event.timezone).slice(11)) - toMinutes(moment.plannedStart)
        : null;

    // ---- Incidents ----------------------------------------------------------------------------
    const open = incidentRows.filter(({ incident }) => incident.status !== "resolved");
    const incidentItems = open.slice(0, 5).map(({ incident, roomName, assigneeId, assigneeName, assigneeImage }) => ({
      id: incident.id,
      // Mission control may be on a shared screen: a code-of-conduct report never shows its title here.
      title: incident.sensitive ? "Reporte confidencial" : incident.title,
      severity: incident.severity,
      category: incident.sensitive ? "conduct" : incident.category,
      status: incident.status,
      room: roomName,
      assignee: assigneeId && assigneeName ? { id: assigneeId, name: assigneeName, image: assigneeImage } : null,
      createdAt: incident.createdAt.toISOString(),
    }));

    // ---- Coverage by kind of task ("Host de sala · Lobby" → "Host de sala") ----------------------
    const coverage = [
      ...Map.groupBy(
        workTasks.filter((task) => task.minPeople != null),
        (task) => task.title.split(" · ")[0]
      ).entries(),
    ].map(([group, tasks]) => ({
      group,
      need: tasks.reduce((sum, task) => sum + (task.minPeople ?? 0), 0),
      have: tasks.reduce(
        (sum, task) => sum + assignmentRows.filter((row) => row.taskId === task.id && !row.noShow).length,
        0
      ),
    }));

    // ---- Comms -----------------------------------------------------------------------------
    const lastSent = messageRows.find((row) => row.status === "sent" && row.sentAt);
    const nextScheduled = messageRows
      .filter((row) => row.status === "scheduled" && row.scheduledAt && row.scheduledAt > now)
      .toSorted((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0))[0];

    // ---- The report (after the event) ---------------------------------------------------------
    const report =
      phase === "post"
        ? yield* Effect.gen(function* () {
            const responses = surveyRows[0]
              ? yield* query((db) =>
                  db
                    .select({ answers: surveyResponses.answers })
                    .from(surveyResponses)
                    .where(eq(surveyResponses.surveyId, surveyRows[0].id))
                )
              : [];
            const npsQuestion = surveyRows[0]?.questions.find((question) => question.kind === "nps");
            const scores = npsQuestion
              ? responses.map((row) => Number(row.answers[npsQuestion.id])).filter((value) => Number.isFinite(value))
              : [];
            const nps =
              scores.length > 0
                ? Math.round(
                    ((scores.filter((score) => score >= 9).length - scores.filter((score) => score <= 6).length) /
                      scores.length) *
                      100
                  )
                : null;

            const arrivalBuckets = new Map<string, number>();
            for (const row of checked) {
              const at = wallClock(row.checkedInAt ?? now, event.timezone).slice(11);
              const bucket = `${at.slice(0, 3)}${String(Math.floor(Number(at.slice(3)) / 10) * 10).padStart(2, "0")}`;
              arrivalBuckets.set(bucket, (arrivalBuckets.get(bucket) ?? 0) + 1);
            }

            const resolved = incidentRows.filter(({ incident }) => incident.resolvedAt);
            const started = moments.filter((moment) => moment.actualStart);
            const first = started[0]?.actualStart ? new Date(started[0].actualStart).getTime() : null;

            return {
              arrival: [...arrivalBuckets.entries()]
                .map(([at, count]) => ({ at, count }))
                .toSorted((a, b) => a.at.localeCompare(b.at)),
              checkedIn: checked.length,
              attending: attending.length,
              drift: moments.map((moment) => ({
                title: moment.title,
                plannedStart: moment.plannedStart,
                actualStart: moment.actualStart,
                driftMin: driftOf(moment),
              })),
              incidents: {
                total: incidentRows.length,
                byCategory: [...Map.groupBy(incidentRows, ({ incident }) => incident.category).entries()].map(
                  ([category, rows]) => ({ category, count: rows.length })
                ),
                avgResolveMin:
                  resolved.length > 0
                    ? Math.round(
                        resolved.reduce(
                          (sum, { incident }) =>
                            sum + ((incident.resolvedAt?.getTime() ?? 0) - incident.createdAt.getTime()),
                          0
                        ) /
                          resolved.length /
                          60_000
                      )
                    : null,
              },
              staff: {
                arrived: arrivalRows.length,
                expected: expectedIds.size,
                noShows: assignmentRows.filter((row) => row.noShow).length,
              },
              survey: surveyRows[0] ? { responses: responses.length, nps } : null,
              chapters:
                first !== null
                  ? started
                      .map(
                        (moment) =>
                          `${CHAPTER_CLOCK((new Date(moment.actualStart ?? 0).getTime() - first) / 1000)} ${moment.title}`
                      )
                      .join("\n")
                  : null,
            };
          })
        : null;

    return {
      generatedAt: now.toISOString(),
      phase,
      event: {
        id: event.id,
        name: event.name,
        timezone: event.timezone,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        venueMapUrl: event.venueMapUrl,
      },
      registrations,
      checkins,
      slot: { current: slotView(currentSlot), next: slotView(nextSlot), index: currentIndex + 1, total: slots.length },
      rooms: roomViews,
      staff: {
        onSite: shift.onSite,
        expected: shift.expected,
        late: shift.people
          .filter((row) => row.state === "late")
          .map((row) => ({ ...personOf(row), task: taskTitle.get(row.taskIds[0] ?? "") ?? "" })),
        noShows: assignmentRows.filter((row) => row.noShow).length,
        free: shift.people.filter((row) => row.state === "free").map(personOf),
        recent: shift.people
          .filter((row) => row.arrivedAt && !row.leftAt)
          .toSorted((a, b) => (b.arrivedAt ?? "").localeCompare(a.arrivedAt ?? ""))
          .slice(0, 5)
          .map(personOf),
      },
      urgent,
      onAir,
      rundown: {
        total: moments.length,
        current: currentMoment,
        next: nextIndex >= 0 ? (moments[nextIndex] ?? null) : null,
        upcoming: nextIndex >= 0 ? moments.slice(nextIndex + 1, nextIndex + 3) : [],
        driftMin: currentMoment ? driftOf(currentMoment) : null,
      },
      incidents: {
        open: open.length,
        critical: open.filter(({ incident }) => incident.severity === "high" || incident.severity === "critical")
          .length,
        items: incidentItems,
      },
      activity: activityRows.map((row) => ({
        id: row.id,
        verb: row.verb,
        summary: row.summary,
        actor: row.actorId && row.actorName ? { id: row.actorId, name: row.actorName, image: row.actorImage } : null,
        createdAt: row.createdAt.toISOString(),
      })),
      screens: {
        online: screenRows.filter((screen) => now.getTime() - screen.lastSeenAt.getTime() < SCREEN_ONLINE_MS).length,
        total: screenRows.length,
        items: screenRows.map((screen) => ({
          id: screen.id,
          name: screen.name,
          path: screen.path,
          online: now.getTime() - screen.lastSeenAt.getTime() < SCREEN_ONLINE_MS,
          lastSeenAt: screen.lastSeenAt.toISOString(),
        })),
      },
      coverage,
      comms: {
        channels: owyChannels(),
        lastSent: lastSent?.sentAt
          ? { body: lastSent.body, channel: lastSent.channel, sentAt: lastSent.sentAt.toISOString() }
          : null,
        nextScheduled: nextScheduled?.scheduledAt
          ? {
              body: nextScheduled.body,
              channel: nextScheduled.channel,
              scheduledAt: nextScheduled.scheduledAt.toISOString(),
            }
          : null,
      },
      report,
    } satisfies Today;
  });
