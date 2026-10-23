import { and, asc, desc, eq, gt, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { Effect } from "effect";

import { clockTime, dayKey, montevideoIso, shortWhen } from "../../community/time";
import {
  activity,
  attendees,
  communities,
  communityMembers,
  events,
  runOfShowItems,
  staffTaskAssignments,
  staffTasks,
  surveys,
  talkClaims,
  talkProposals,
  user,
  venues,
  type EventRow,
  type VolunteerRole,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { taskDueEmail, volunteerRoleEmail, volunteerThanksEmail } from "../../email/lifecycle-templates";
import { appUrl } from "../../email/templates";
import { meetupAgenda, withStarts } from "../../organizar/agenda";
import { volunteerLabel } from "../../organizar/presets";
import { pickRepeatDay, repeatDays, staleOnCopy } from "../../organizar/repeat";
import { HOLD_DAYS, MAX_HOLDS } from "../../organizar/rules";
import {
  heavyLoad,
  nudgeDay,
  planTemplate,
  templateFor,
  TEMPLATES,
  type TemplateName,
} from "../../organizar/task-templates";
import { eventPagePath } from "../../revalidate";
import { wallClock } from "../../slot-day";
import { plan } from "../calendar/service";
import { query, transaction } from "../db";
import { Conflict, NotFound } from "../errors";
import { freeSlug, slugify } from "../open-spaces/service";
import { opsPing, recordActivity } from "../ops";
import * as RunOfShow from "../run-of-show/service";
import { listTasks } from "../staff-tasks/service";
import { CommunityScope, CurrentUser } from "../services";
import { acceptedCohosts } from "./cohosts";
import type { Slides, Volunteer } from "./schemas";
import { editableOf, headsUp, liveHolds, responderNames } from "./service";
import { taskDay } from "./tasks";

const DAY_MS = 86_400_000;
const notFound = new NotFound({ entity: "event", message: "Ese evento no existe" });
/** Roles that organize: the ones a task or a responder can be */
const ORGANIZERS = ["owner", "admin", "editor"];

/** One of the scoped community's events, locked for the rest of the transaction when asked. */
const eventIn = (eventId: string, lock = false) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [row] = yield* query((db) => {
      const select = db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.communityId, communityId)));
      return lock ? select.for("update") : select;
    });
    if (!row) return yield* notFound;

    return row;
  });

// ---------------------------------------------------------------------------
// Repetir: the same weekday and time, about four weeks later, held like the calendar would
// ---------------------------------------------------------------------------

/** The day a copy of `source` would get, scored by the community's calendar. */
const repeatDate = (source: EventRow) =>
  Effect.gen(function* () {
    const candidates = repeatDays(dayKey(source.startDate), dayKey(new Date()));
    const startTime = clockTime(source.startDate);
    const durationMin = Math.min(
      12 * 60,
      Math.max(30, Math.round((source.endDate.getTime() - source.startDate.getTime()) / 60_000))
    );
    const months = [...new Set(candidates.map((day) => day.slice(0, 7)))];
    const plans = yield* Effect.forEach(months, (month) =>
      plan({ communityId: source.communityId, month, startTime, durationMin })
    );
    const levels = new Map(plans.flatMap((result) => result.days.map((day) => [day.day, day.level] as const)));
    const picked = pickRepeatDay(candidates, (day) => levels.get(day));

    return { ...picked, startTime, durationMin };
  });

/** The event "Repetir" would copy: the one asked for, or the community's last published one. */
const repeatSource = (eventId: string | undefined) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [row] = yield* query((db) =>
      db
        .select()
        .from(events)
        .where(
          and(eq(events.communityId, communityId), eventId ? eq(events.id, eventId) : eq(events.status, "published"))
        )
        .orderBy(desc(events.startDate))
        .limit(1)
    );

    return row ?? null;
  });

/** What "Repetir «…»" would make: the source and the day it proposes ("jue 19 nov · Libre"). */
export const nextDate = (eventId?: string) =>
  Effect.gen(function* () {
    const source = yield* repeatSource(eventId);
    if (!source) return null;
    const date = yield* repeatDate(source);

    return { source: { id: source.id, name: source.name }, ...date };
  });

/**
 * "Repetir": a draft like `sourceId` on the same weekday and time about four weeks later, held
 * like the calendar would (up to MAX_HOLDS; past it, undated). It copies texts, format, size,
 * needs, sign-up settings, questions, the hands asked for, responders still on the team and where
 * Owy announces it; the space and co-hosts are only offered again. Never people, talks, materials,
 * holds or publications. Date-dependent fields read "Revisá" until edited.
 */
export const repeat = (sourceId: string, title?: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const me = yield* CurrentUser;
      const source = yield* repeatSource(sourceId);
      if (!source) return yield* notFound;
      const date = yield* repeatDate(source);
      const startDate = new Date(montevideoIso(`${date.day}T${date.startTime}`));
      const shift = startDate.getTime() - source.startDate.getTime();
      const held = (yield* liveHolds(communityId)) < MAX_HOLDS;
      const team = yield* query((db) =>
        db
          .select({ userId: communityMembers.userId })
          .from(communityMembers)
          .where(and(eq(communityMembers.communityId, communityId), inArray(communityMembers.role, ORGANIZERS)))
      );
      const onTeam = new Set(team.map((member) => member.userId));
      const name = title ?? source.name;
      const slug = yield* freeSlug(communityId, slugify(name));
      const [row] = yield* query((db) =>
        db
          .insert(events)
          .values({
            communityId,
            name,
            slug,
            status: "draft",
            timezone: source.timezone,
            startDate,
            endDate: new Date(startDate.getTime() + date.durationMin * 60_000),
            heldUntil: held ? new Date(Date.now() + HOLD_DAYS * DAY_MS) : null,
            summary: source.summary,
            description: source.description,
            format: source.format,
            topics: source.topics,
            mode: source.mode,
            onlineUrl: source.onlineUrl,
            registration: source.registration,
            approval: source.approval,
            capacity: source.capacity,
            waitlist: source.waitlist,
            guestsAllowed: source.guestsAllowed,
            rsvpClosesAt: source.rsvpClosesAt ? new Date(source.rsvpClosesAt.getTime() + shift) : null,
            questions: source.questions,
            sizeBucket: source.sizeBucket,
            needs: source.needs,
            announcement: source.announcement,
            reminderNote: source.reminderNote,
            confirmPing: source.confirmPing,
            volunteerRoles: source.volunteerRoles,
            responders: source.responders.filter((id) => onTeam.has(id)),
            staleFields: staleOnCopy(source),
            copiedFromId: source.id,
          })
          .returning()
      );
      if (held) yield* headsUp(row);
      yield* recordActivity({
        eventId: row.id,
        verb: "event.drafted",
        entityType: "event",
        entityId: row.id,
        summary: held
          ? `repitió «${source.name}» y reservó el ${shortWhen(startDate)} por ${HOLD_DAYS} días`
          : `repitió «${source.name}», sin fecha: ya había ${MAX_HOLDS} reservadas`,
      });
      // The tasks come along if the last one had them: same template, dated from the new start
      const [used] = yield* query((db) =>
        db
          .select({ templateKey: staffTasks.templateKey })
          .from(staffTasks)
          .where(and(eq(staffTasks.openSpaceId, source.id), isNotNull(staffTasks.templateKey)))
          .limit(1)
      );
      const template = TEMPLATES.find((name) => used?.templateKey?.startsWith(`${name}:`));
      if (template) yield* addTemplate(row, template, me.id);

      return yield* editableOf(row.id);
    })
  );

// ---------------------------------------------------------------------------
// Tasks: per-format templates on staff_tasks, with owners, nudged on their day
// ---------------------------------------------------------------------------

/** The template's tasks the event doesn't have yet, given to `assigneeId` while they're on the team. */
const addTemplate = (event: EventRow, name: TemplateName, assigneeId: string | null) =>
  Effect.gen(function* () {
    const existing = yield* query((db) =>
      db
        .select({ templateKey: staffTasks.templateKey })
        .from(staffTasks)
        .where(and(eq(staffTasks.openSpaceId, event.id), isNotNull(staffTasks.templateKey)))
    );
    const other = existing.find((task) => !task.templateKey?.startsWith(`${name}:`));
    if (other) {
      return yield* new Conflict({
        reason: "other_template",
        message: "Este evento ya tiene las tareas de otra lista: seguí con esas",
      });
    }
    const have = new Set(existing.map((task) => task.templateKey));
    const missing = planTemplate(name, event.startDate).filter((task) => !have.has(task.templateKey));
    if (missing.length === 0) return 0;
    const [member] = assigneeId
      ? yield* query((db) =>
          db
            .select({ userId: communityMembers.userId })
            .from(communityMembers)
            .where(and(eq(communityMembers.communityId, event.communityId), eq(communityMembers.userId, assigneeId)))
        )
      : [];
    const made = yield* query((db) =>
      db
        .insert(staffTasks)
        .values(
          missing.map((task) => ({
            openSpaceId: event.id,
            title: task.title,
            dayDate: taskDay(task.day),
            sortOrder: task.sortOrder,
            templateKey: task.templateKey,
          }))
        )
        .returning({ id: staffTasks.id })
    );
    if (member) {
      yield* query((db) =>
        db.insert(staffTaskAssignments).values(made.map((task) => ({ taskId: task.id, userId: member.userId })))
      );
    }

    return made.length;
  });

/** Who started the event (its first change), the default owner of its tasks */
const creatorOf = (eventId: string) =>
  query((db) =>
    db
      .select({ actorId: activity.actorId })
      .from(activity)
      .where(and(eq(activity.eventId, eventId), isNotNull(activity.actorId)))
      .orderBy(asc(activity.createdAt))
      .limit(1)
  ).pipe(Effect.map(([row]) => row?.actorId ?? null));

/** Put a template's tasks on the event: twice adds nothing; the owner is whoever created the event. */
export const applyTemplate = (input: { eventId: string; template: TemplateName }) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventIn(input.eventId, true);
        const added = yield* addTemplate(event, input.template, (yield* creatorOf(event.id)) ?? me.id);
        if (added > 0) {
          yield* recordActivity({
            eventId: event.id,
            verb: "task.template",
            entityType: "task",
            summary: `sumó ${added} tareas de la lista «${input.template}»`,
          });
        }
      })
    );

    return yield* tasks(input.eventId);
  });

/** Of the community's last 3 events, the done tasks and who marked each */
const recentLoad = (communityId: string) =>
  Effect.gen(function* () {
    const last = yield* query((db) =>
      db
        .select({ id: events.id })
        .from(events)
        .where(
          and(eq(events.communityId, communityId), ne(events.status, "cancelled"), lt(events.startDate, new Date()))
        )
        .orderBy(desc(events.startDate))
        .limit(3)
    );
    if (last.length === 0) return null;
    const done = yield* query((db) =>
      db
        .select({ by: staffTasks.statusUpdatedById })
        .from(staffTasks)
        .where(
          and(
            inArray(
              staffTasks.openSpaceId,
              last.map((event) => event.id)
            ),
            eq(staffTasks.status, "done")
          )
        )
    );
    const heavy = heavyLoad(done.map((task) => task.by));
    if (!heavy) return null;
    const [person] = yield* query((db) => db.select({ name: user.name }).from(user).where(eq(user.id, heavy.userId)));

    return person ? { name: person.name, share: heavy.share } : null;
  });

/** The event's tasks (template or not) with their template key, the template that fits, and the load hint. */
export const tasks = (eventId: string) =>
  Effect.gen(function* () {
    const event = yield* eventIn(eventId);
    const list = yield* listTasks(eventId);
    const keys = yield* query((db) =>
      db
        .select({ id: staffTasks.id, templateKey: staffTasks.templateKey })
        .from(staffTasks)
        .where(eq(staffTasks.openSpaceId, eventId))
    );
    const cohosts = yield* acceptedCohosts(eventId);

    return {
      tasks: list.map((task) => ({
        ...task,
        templateKey: keys.find((key) => key.id === task.id)?.templateKey ?? null,
      })),
      suggested: templateFor({ ...event, cohosts }),
      load: yield* recentLoad(event.communityId),
    };
  });

/** From 9:00 on the day a template task is due, its people get one email (per task, day and person). */
export const sendTaskNudges = Effect.gen(function* () {
  const today = nudgeDay();
  const due = yield* query((db) =>
    db
      .select({
        taskId: staffTasks.id,
        title: staffTasks.title,
        userId: user.id,
        email: user.email,
        eventId: events.id,
        eventName: events.name,
        startDate: events.startDate,
        community: communities.name,
        slug: communities.slug,
      })
      .from(staffTasks)
      .innerJoin(staffTaskAssignments, eq(staffTaskAssignments.taskId, staffTasks.id))
      .innerJoin(user, eq(user.id, staffTaskAssignments.userId))
      .innerJoin(events, eq(events.id, staffTasks.openSpaceId))
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(
        and(
          isNotNull(staffTasks.templateKey),
          ne(staffTasks.status, "done"),
          eq(staffTasks.dayDate, taskDay(today)),
          ne(events.status, "cancelled")
        )
      )
  );
  for (const task of due) {
    yield* enqueueEmail({
      kind: "task_due",
      to: task.email,
      dedupeKey: `task_due:${task.taskId}:${today}:${task.userId}`,
      ...taskDueEmail({
        task: task.title,
        event: task.eventName,
        when: shortWhen(task.startDate),
        community: task.community,
        panelPath: `/organizar/panel/${task.slug}/eventos/${task.eventId}`,
      }),
    });
  }

  return { queued: due.length };
});

// ---------------------------------------------------------------------------
// Volunteers: who offered a hand, the job the team gives them, and thanks after
// ---------------------------------------------------------------------------

const ROLE_TAG = "rol:";
const assignedRole = (tags: readonly string[]) =>
  (tags.find((tag) => tag.startsWith(ROLE_TAG))?.slice(ROLE_TAG.length) as VolunteerRole | undefined) ?? null;

/** When each job starts, in minutes from the event's start (the close, from its end) */
const ROLE_AT: Record<VolunteerRole, { from: "start" | "end"; minutes: number }> = {
  recepcion: { from: "start", minutes: -30 },
  puerta: { from: "start", minutes: -30 },
  comida: { from: "start", minutes: -15 },
  mc: { from: "start", minutes: -15 },
  fotos: { from: "start", minutes: 0 },
  cierre: { from: "end", minutes: -15 },
};

const roleTime = (role: VolunteerRole, event: { startDate: Date; endDate: Date }) => {
  const at = ROLE_AT[role];
  const base = at.from === "start" ? event.startDate : event.endDate;

  return clockTime(new Date(base.getTime() + at.minutes * 60_000));
};

const toVolunteer = (row: {
  id: string;
  name: string;
  volunteerRoles: VolunteerRole[];
  tags: string[];
  checkedInAt: Date | null;
}): Volunteer => ({
  attendeeId: row.id,
  name: row.name,
  offered: row.volunteerRoles,
  assigned: assignedRole(row.tags),
  checkedIn: row.checkedInAt !== null,
});

/** People with a seat who offered a hand (or got a job), by name. */
export const volunteers = (eventId: string) =>
  Effect.gen(function* () {
    yield* eventIn(eventId);
    const rows = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(
          and(
            eq(attendees.eventId, eventId),
            eq(attendees.status, "attending"),
            sql`(cardinality(${attendees.volunteerRoles}) > 0 or exists (select 1 from jsonb_array_elements_text(${attendees.tags}) as tag where tag like ${`${ROLE_TAG}%`}))`
          )
        )
        .orderBy(asc(attendees.name))
    );

    return rows.map(toVolunteer);
  });

/**
 * Give someone a job (or take it back with null). The job is a tag on their RSVP ("rol:puerta"):
 * volunteers are attendees, not team members, so staff_tasks can't hold them. They get one
 * email per job ("¡Gracias! Te toca la puerta a las 18:30").
 */
export const assignVolunteer = (input: { eventId: string; attendeeId: string; role: VolunteerRole | null }) =>
  transaction(
    Effect.gen(function* () {
      const event = yield* eventIn(input.eventId);
      const [person] = yield* query((db) =>
        db
          .select()
          .from(attendees)
          .where(and(eq(attendees.id, input.attendeeId), eq(attendees.eventId, event.id)))
          .for("update")
      );
      if (!person) return yield* new NotFound({ entity: "attendee", message: "Esa persona no está en este evento" });
      if (person.status !== "attending") {
        return yield* new Conflict({ reason: "not_attending", message: "Solo se le da una tarea a quien tiene lugar" });
      }
      const tags = [
        ...person.tags.filter((tag) => !tag.startsWith(ROLE_TAG)),
        ...(input.role ? [`${ROLE_TAG}${input.role}`] : []),
      ];
      const [saved] = yield* query((db) =>
        db.update(attendees).set({ tags }).where(eq(attendees.id, person.id)).returning()
      );
      if (input.role && person.email) {
        const [community] = yield* query((db) =>
          db
            .select({ name: communities.name, slug: communities.slug })
            .from(communities)
            .where(eq(communities.id, event.communityId))
        );
        yield* enqueueEmail({
          kind: "volunteer_role",
          to: person.email,
          dedupeKey: `volunteer_role:${person.id}:${input.role}`,
          ...volunteerRoleEmail({
            name: person.name.split(/\s+/)[0] ?? person.name,
            role: volunteerLabel(input.role),
            at: roleTime(input.role, event),
            event: event.name,
            day: shortWhen(event.startDate).split(" · ")[0],
            community: community?.name ?? "",
            pagePath: eventPagePath(community?.slug ?? "", event.slug),
          }),
        });
      }
      yield* recordActivity({
        eventId: event.id,
        verb: "volunteer.assigned",
        entityType: "attendee",
        entityId: person.id,
        summary: input.role
          ? `le dio ${volunteerLabel(input.role).toLowerCase()} a ${person.name}`
          : `le sacó la tarea a ${person.name}`,
      });

      return toVolunteer(saved);
    })
  );

/** After the event: one thank-you to each volunteer who came (everyone with a job, when the door wasn't used). */
export const thankVolunteers = (eventId: string) =>
  transaction(
    Effect.gen(function* () {
      const event = yield* eventIn(eventId);
      if (event.endDate.getTime() > Date.now()) {
        return yield* new Conflict({ reason: "not_over", message: "Las gracias salen cuando termina el evento" });
      }
      const people = yield* query((db) =>
        db
          .select({
            id: attendees.id,
            name: attendees.name,
            email: attendees.email,
            tags: attendees.tags,
            checkedInAt: attendees.checkedInAt,
          })
          .from(attendees)
          .where(and(eq(attendees.eventId, eventId), eq(attendees.status, "attending")))
      );
      const doorUsed = people.some((person) => person.checkedInAt !== null);
      const thanked = people.filter(
        (person) => assignedRole(person.tags) && person.email && (person.checkedInAt !== null || !doorUsed)
      );
      const [community] = yield* query((db) =>
        db
          .select({ name: communities.name, slug: communities.slug })
          .from(communities)
          .where(eq(communities.id, event.communityId))
      );
      for (const person of thanked) {
        yield* enqueueEmail({
          kind: "volunteer_thanks",
          to: person.email,
          dedupeKey: `volunteer_thanks:${event.id}:${person.id}`,
          ...volunteerThanksEmail({
            name: person.name.split(/\s+/)[0] ?? person.name,
            event: event.name,
            community: community?.name ?? "",
            pagePath: eventPagePath(community?.slug ?? "", event.slug),
          }),
        });
      }
      if (thanked.length > 0) {
        yield* recordActivity({
          eventId: event.id,
          verb: "volunteer.thanked",
          entityType: "event",
          entityId: event.id,
          summary: `les agradeció a ${thanked.length} ${thanked.length === 1 ? "persona" : "personas"} que dieron una mano`,
        });
      }

      return { sent: thanked.length };
    })
  );

// ---------------------------------------------------------------------------
// Close-out and "avisó que no venía"
// ---------------------------------------------------------------------------

/** The team went through the close-out (or takes it back): Inicio stops asking for it. */
export const closeOut = (input: { eventId: string; done: boolean }) =>
  transaction(
    Effect.gen(function* () {
      const event = yield* eventIn(input.eventId, true);
      if (event.status !== "published" || event.endDate.getTime() > Date.now()) {
        return yield* new Conflict({ reason: "not_over", message: "Se cierra cuando el evento termina" });
      }
      yield* query((db) =>
        db
          .update(events)
          .set({ closedOutAt: input.done ? (event.closedOutAt ?? new Date()) : null })
          .where(eq(events.id, event.id))
      );
      yield* recordActivity({
        eventId: event.id,
        verb: input.done ? "event.closed_out" : "event.reopened",
        entityType: "event",
        entityId: event.id,
        summary: input.done ? `cerró «${event.name}»` : `volvió a abrir el cierre de «${event.name}»`,
      });

      return yield* editableOf(event.id);
    })
  );

/**
 * "Avisó que no venía": someone with a seat who told the team counts as excused, never as a
 * no-show. Only for people who didn't come in (undo the check-in first otherwise).
 */
export const excuse = (input: { eventId: string; attendeeId: string; excused: boolean }) =>
  transaction(
    Effect.gen(function* () {
      const event = yield* eventIn(input.eventId);
      const [person] = yield* query((db) =>
        db
          .select()
          .from(attendees)
          .where(and(eq(attendees.id, input.attendeeId), eq(attendees.eventId, event.id)))
          .for("update")
      );
      if (!person) return yield* new NotFound({ entity: "attendee", message: "Esa persona no está en este evento" });
      if (person.checkedInAt) {
        return yield* new Conflict({ reason: "checked_in", message: "Entró: deshacé la entrada antes" });
      }
      const [saved] = yield* query((db) =>
        db
          .update(attendees)
          .set({ excusedAt: input.excused ? (person.excusedAt ?? new Date()) : null })
          .where(eq(attendees.id, person.id))
          .returning({ excusedAt: attendees.excusedAt })
      );
      yield* recordActivity({
        eventId: event.id,
        verb: input.excused ? "attendee.excused" : "attendee.unexcused",
        entityType: "attendee",
        entityId: person.id,
        summary: input.excused ? `anotó que ${person.name} avisó que no venía` : `sacó el aviso de ${person.name}`,
      });

      return { attendeeId: person.id, excused: saved?.excusedAt !== null };
    })
  );

// ---------------------------------------------------------------------------
// The agenda (run_of_show_items, as the conf's guion), MC mode and the welcome slides
// ---------------------------------------------------------------------------

/** A guion made at the conf's stage desk (cues, Owy messages) is edited there, not here. */
const deskMade = (rows: { cueId: string | null; owyMessage: string | null }[]) =>
  rows.some((row) => row.cueId !== null || row.owyMessage !== null);

const deskConflict = new Conflict({
  reason: "desk_rundown",
  message: "Este guion tiene cues del escritorio del escenario: editalo desde ahí",
});

const itemsOf = (eventId: string) =>
  query((db) =>
    db
      .select()
      .from(runOfShowItems)
      .where(eq(runOfShowItems.eventId, eventId))
      .orderBy(asc(runOfShowItems.position), asc(runOfShowItems.createdAt))
  );

/** "19:00": the event's start on its own wall clock */
const startClock = (event: EventRow) => wallClock(event.startDate, event.timezone).slice(11, 16);

export const agenda = (eventId: string) =>
  Effect.gen(function* () {
    yield* eventIn(eventId);

    return yield* RunOfShow.listRunOfShow(eventId);
  });

/**
 * A first agenda from the event's talks: their length from the format the speaker proposed (a
 * talk typed by hand gets 20 minutes). Replaces an agenda that hasn't started; never one with cues.
 */
export const generateAgenda = (eventId: string) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventIn(eventId, true);
        const rows = yield* itemsOf(eventId);
        if (deskMade(rows)) return yield* deskConflict;
        if (rows.some((row) => row.actualStart)) {
          return yield* new Conflict({ reason: "agenda_started", message: "La agenda ya empezó: editala a mano" });
        }
        const proposals = yield* query((db) =>
          db
            .select({ title: talkProposals.title, format: talkProposals.format })
            .from(talkClaims)
            .innerJoin(talkProposals, eq(talkProposals.id, talkClaims.proposalId))
            .where(and(eq(talkClaims.eventId, eventId), ne(talkClaims.status, "released")))
        );
        const formatOf = (title: string) =>
          proposals.find((proposal) => proposal.title.trim().toLowerCase() === title.trim().toLowerCase())?.format ??
          null;
        const items = withStarts(
          meetupAgenda(event.talks.map((talk) => ({ ...talk, format: formatOf(talk.title) }))),
          startClock(event)
        );
        yield* query((db) => db.delete(runOfShowItems).where(eq(runOfShowItems.eventId, eventId)));
        yield* query((db) =>
          db.insert(runOfShowItems).values(items.map((item, position) => ({ ...item, eventId, position })))
        );
        yield* recordActivity({
          eventId,
          verb: "rundown.imported",
          entityType: "rundown",
          summary: `armó la agenda con ${items.length} momentos`,
        });
      })
    );
    yield* opsPing(eventId, "rundown");

    return yield* RunOfShow.listRunOfShow(eventId);
  });

/**
 * The agenda as the team left it: order, titles and lengths. Starts follow one after the other
 * from the event's start; moments that already ran keep what happened.
 */
export const saveAgenda = (input: { eventId: string; items: { id?: string; title: string; durationMin: number }[] }) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventIn(input.eventId, true);
        const rows = yield* itemsOf(input.eventId);
        if (deskMade(rows)) return yield* deskConflict;
        const ours = new Set(rows.map((row) => row.id));
        const planned = withStarts(input.items, startClock(event));
        const kept = planned.flatMap((item) => (item.id && ours.has(item.id) ? [item.id] : []));
        const gone = rows.filter((row) => !kept.includes(row.id)).map((row) => row.id);
        if (gone.length > 0) yield* query((db) => db.delete(runOfShowItems).where(inArray(runOfShowItems.id, gone)));
        yield* Effect.forEach(planned, (item, position) =>
          item.id && ours.has(item.id)
            ? query((db) =>
                db
                  .update(runOfShowItems)
                  .set({ title: item.title, durationMin: item.durationMin, plannedStart: item.plannedStart, position })
                  .where(eq(runOfShowItems.id, item.id ?? ""))
              )
            : query((db) =>
                db.insert(runOfShowItems).values({
                  eventId: input.eventId,
                  title: item.title,
                  durationMin: item.durationMin,
                  plannedStart: item.plannedStart,
                  position,
                })
              )
        );
      })
    );
    yield* opsPing(input.eventId, "rundown");

    return yield* RunOfShow.listRunOfShow(input.eventId);
  });

/** MC mode's "Siguiente": the GO of the conf's guion (no cue, no Owy message on a meetup's agenda). */
export const agendaGo = (input: { eventId: string; itemId?: string }) =>
  Effect.gen(function* () {
    yield* eventIn(input.eventId);
    yield* RunOfShow.go(input);

    return yield* RunOfShow.listRunOfShow(input.eventId);
  });

/** What the welcome slides show: names, never emails; wifi only here, for the organizers who present. */
export const slides = (eventId: string) =>
  Effect.gen(function* () {
    const event = yield* eventIn(eventId);
    const [row] = yield* query((db) =>
      db
        .select({
          community: communities.name,
          slug: communities.slug,
          logoUrl: communities.logoUrl,
          venue: venues.name,
          venueLogo: venues.logoUrl,
        })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(eq(events.id, eventId))
    );
    const [next] = yield* query((db) =>
      db
        .select({ name: events.name, slug: events.slug, startDate: events.startDate })
        .from(events)
        .where(
          and(
            eq(events.communityId, event.communityId),
            eq(events.status, "published"),
            ne(events.id, event.id),
            gt(events.startDate, event.endDate)
          )
        )
        .orderBy(asc(events.startDate))
        .limit(1)
    );
    const [survey] = yield* query((db) =>
      db.select({ id: surveys.id }).from(surveys).where(eq(surveys.eventId, eventId))
    );
    const items = yield* itemsOf(eventId);
    const slug = row?.slug ?? "";

    return {
      name: event.name,
      summary: event.summary,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      community: { name: row?.community ?? "", logoUrl: row?.logoUrl ?? null },
      notes: event.slideNotes ?? {},
      reminderNote: event.reminderNote,
      responders: yield* responderNames(event.responders),
      reportUrl: appUrl(`${eventPagePath(slug, event.slug)}/reportar`),
      venue: row?.venue ? { name: row.venue, logoUrl: row.venueLogo } : null,
      cohosts: (yield* acceptedCohosts(eventId)).map((cohost) => cohost.name),
      agenda: items.map((item) => ({ title: item.title, plannedStart: item.plannedStart })),
      next: next
        ? { name: next.name, startDate: next.startDate.toISOString(), url: appUrl(eventPagePath(slug, next.slug)) }
        : null,
      surveyUrl: survey ? appUrl(`${eventPagePath(slug, event.slug)}/encuesta`) : null,
    } satisfies Slides;
  });
