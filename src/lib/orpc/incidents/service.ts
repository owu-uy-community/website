import { and, asc, desc, eq, gt, or } from "drizzle-orm";
import { Effect } from "effect";

import {
  communityMembers,
  incidentNotes,
  incidents,
  rooms,
  staffAnnouncements,
  user,
  type IncidentRow,
} from "../../db/schema";
import { query, transaction } from "../db";
import { Forbidden, Invalid, NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { memberRole, ROLE_RANK } from "../scope";
import { CommunityScope, CurrentUser } from "../services";
import { createAnnouncement } from "../staff-tasks/service";
import type {
  CreateIncidentInput,
  Incident,
  IncidentDetail,
  IncidentSeverity,
  IncidentStatus,
  UpdateIncidentInput,
} from "./schemas";

const STATUS_WORDS: Record<IncidentStatus, string> = { open: "abierto", in_progress: "en curso", resolved: "resuelto" };
const SEVERITY_WORDS: Record<IncidentSeverity, string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  critical: "crítica",
};
const SEVERITY_RANK: Record<IncidentSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const isLoud = (severity: IncidentSeverity) => SEVERITY_RANK[severity] >= SEVERITY_RANK.high;

const person = { columns: { id: true, name: true, image: true } } as const;
const place = { columns: { id: true, name: true, color: true } } as const;

const incidentNotFound = new NotFound({ entity: "incident", message: "Ese incidente no existe en este evento" });

/**
 * Who is asking, as far as incidents care. Organizers (site staff, the community's owner and
 * admins) see code-of-conduct reports; editors manage incidents.
 */
const viewer = Effect.gen(function* () {
  const me = yield* CurrentUser;
  if (me.role === "admin") return { id: me.id, organizer: true, editor: true };
  const { communityId } = yield* CommunityScope;
  const role = yield* memberRole(communityId, me.id);

  return {
    id: me.id,
    organizer: role === "owner" || role === "admin",
    editor: role !== null && ROLE_RANK[role] >= ROLE_RANK.editor,
  };
});
type Viewer = Effect.Success<typeof viewer>;

/**
 * A sensitive report is visible to organizers and to the two people on it, and to nobody else.
 * The shell's incident counts use it too, so a badge never counts what its list hides.
 */
export const visibleTo = (who: Pick<Viewer, "id" | "organizer">) =>
  who.organizer
    ? undefined
    : or(eq(incidents.sensitive, false), eq(incidents.reporterId, who.id), eq(incidents.assigneeId, who.id));

type Person = { id: string; name: string; image: string | null };
type ListRow = Omit<IncidentRow, "photo"> & {
  hasPhoto: boolean;
  room: { id: string; name: string; color: string | null } | null;
  assignee: Person | null;
  reporter: Person | null;
};

const toIncident = (row: ListRow): Incident => ({
  id: row.id,
  eventId: row.eventId,
  title: row.title,
  description: row.description,
  severity: row.severity,
  category: row.category,
  status: row.status,
  room: row.room,
  location: row.location,
  assignee: row.assignee,
  reporter: row.reporter,
  source: row.source,
  sensitive: row.sensitive,
  hasPhoto: row.hasPhoto,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
});

/** Open first, the loudest on top, newest first within a severity; resolved at the end. */
const byUrgency = (a: Incident, b: Incident) =>
  Number(a.status === "resolved") - Number(b.status === "resolved") ||
  (a.status === "resolved" ? 0 : SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
  b.createdAt.localeCompare(a.createdAt);

export const listIncidents = (input: { eventId: string; status?: IncidentStatus }) =>
  Effect.gen(function* () {
    const who = yield* viewer;
    const rows = yield* query((db) =>
      db.query.incidents.findMany({
        where: and(
          eq(incidents.eventId, input.eventId),
          input.status ? eq(incidents.status, input.status) : undefined,
          visibleTo(who)
        ),
        columns: { photo: false },
        extras: (fields, { sql }) => ({ hasPhoto: sql<boolean>`${fields.photo} is not null`.as("has_photo") }),
        with: { room: place, assignee: person, reporter: person },
        orderBy: desc(incidents.createdAt),
      })
    );

    return rows.map(toIncident).toSorted(byUrgency);
  });

export const getIncident = (input: { eventId: string; id: string }) =>
  Effect.gen(function* () {
    const who = yield* viewer;
    const row = yield* query((db) =>
      db.query.incidents.findFirst({
        where: and(eq(incidents.id, input.id), eq(incidents.eventId, input.eventId), visibleTo(who)),
        with: {
          room: place,
          assignee: person,
          reporter: person,
          notes: { with: { author: person }, orderBy: asc(incidentNotes.createdAt) },
        },
      })
    );
    if (!row) return yield* incidentNotFound;

    return {
      ...toIncident({ ...row, hasPhoto: row.photo !== null }),
      photo: row.photo,
      notes: row.notes.map((note) => ({
        id: note.id,
        body: note.body,
        author: note.author,
        createdAt: note.createdAt.toISOString(),
      })),
    } satisfies IncidentDetail;
  });

const roomInEvent = (roomId: string, eventId: string) =>
  query((db) =>
    db
      .select({ id: rooms.id, name: rooms.name })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.openSpaceId, eventId)))
  ).pipe(
    Effect.flatMap(([room]) =>
      room
        ? Effect.succeed(room)
        : Effect.fail(new NotFound({ entity: "room", message: "Esa sala no es de este evento" }))
    )
  );

/** Only people on the community's staff can be put on an incident. */
const staffMember = (userId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [member] = yield* query((db) =>
      db
        .select({ name: user.name })
        .from(communityMembers)
        .innerJoin(user, eq(user.id, communityMembers.userId))
        .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
    );
    if (!member) return yield* new Invalid({ message: "Solo se puede asignar a gente del staff de la comunidad" });

    return member;
  });

/**
 * High and critical incidents go to every staff phone as an urgent announcement. A
 * code-of-conduct report never says what happened there: only that there is one.
 */
const alertStaff = (eventId: string, incident: { title: string; sensitive: boolean }, where: string | null) =>
  createAnnouncement({
    eventId,
    urgent: true,
    audience: "all",
    body: incident.sensitive
      ? "Hay un reporte confidencial; organizadores, revisen Incidentes"
      : `Incidente: ${incident.title}${where ? ` · ${where}` : ""}`,
  });

/**
 * Reports through Owy can come from anyone, so Owy pages the whole staff at most once per window,
 * measured from the last urgent alert it actually sent: a report held back never extends it.
 */
const OWY_ALERT_WINDOW_MS = 5 * 60_000;

const owyAlertedRecently = (eventId: string, botId: string) =>
  query((db) =>
    db
      .select({ id: staffAnnouncements.id })
      .from(staffAnnouncements)
      .where(
        and(
          eq(staffAnnouncements.openSpaceId, eventId),
          eq(staffAnnouncements.authorId, botId),
          eq(staffAnnouncements.urgent, true),
          gt(staffAnnouncements.createdAt, new Date(Date.now() - OWY_ALERT_WINDOW_MS))
        )
      )
      .limit(1)
  ).pipe(Effect.map((rows) => rows.length > 0));

/** A loud report held back from paging still reaches every admin screen, as a regular announcement. */
const noteStaff = (eventId: string, incident: { title: string; sensitive: boolean }, where: string | null) =>
  createAnnouncement({
    eventId,
    urgent: false,
    audience: "all",
    body: incident.sensitive
      ? "Llegó otro reporte confidencial por Owy; organizadores, revisen Incidentes"
      : `Otro reporte por Owy: ${incident.title}${where ? ` · ${where}` : ""} · revisalo en Incidentes`,
  });

export const createIncident = (input: CreateIncidentInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const room = input.roomId ? yield* roomInEvent(input.roomId, input.eventId) : null;
    // ponytail: a per-event window, not per reporter (Owy doesn't tell us who's behind the chat);
    // the report itself always lands in Incidentes and Hoy, only the sticky urgent banner waits.
    const quiet = me.via === "api-key" && isLoud(input.severity) && (yield* owyAlertedRecently(input.eventId, me.id));

    const id = yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .insert(incidents)
            .values({
              eventId: input.eventId,
              title: input.title,
              description: input.description || null,
              severity: input.severity,
              category: input.category,
              roomId: room?.id ?? null,
              location: input.location || null,
              reporterId: me.id,
              source: me.via === "api-key" ? "owy" : (input.source ?? "admin"),
              sensitive: input.sensitive,
              photo: input.photo ?? null,
            })
            .returning({ id: incidents.id })
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "incident.created",
          entityType: "incident",
          entityId: row.id,
          summary: input.sensitive ? "reportó un incidente confidencial" : `reportó «${input.title}»`,
        });

        return row.id;
      })
    );
    const where = room?.name ?? (input.location || null);
    if (isLoud(input.severity)) yield* (quiet ? noteStaff : alertStaff)(input.eventId, input, where);
    yield* opsPing(input.eventId, "incidents");

    return yield* getIncident({ eventId: input.eventId, id });
  });

type Change = Partial<Pick<IncidentRow, "status" | "assigneeId" | "severity" | "roomId">>;

/** The activity line for an edit: its most telling change, in the actor's voice. */
function activityLine(
  current: IncidentRow,
  change: Change,
  meId: string,
  names: { assignee?: string; room: string | null }
) {
  const quoted = `«${current.title}»`;
  if (change.status === "resolved") return `resolvió ${quoted}`;
  if (change.status && current.status === "resolved") return `reabrió ${quoted}`;
  if (change.assigneeId === meId) return `tomó ${quoted}`;
  if (change.assigneeId) return `asignó ${quoted} a ${names.assignee}`;
  if (change.assigneeId === null) return `dejó ${quoted} sin asignar`;
  if (change.status) return `marcó ${quoted} como ${STATUS_WORDS[change.status]}`;
  if (change.severity) return `cambió ${quoted} a gravedad ${SEVERITY_WORDS[change.severity]}`;
  return names.room ? `movió ${quoted} a ${names.room}` : `sacó ${quoted} de su sala`;
}

/**
 * Apply a change to one incident: the row is locked while it's read and written, every
 * change is appended to its log as one line ("cambió el estado a resuelto · asignó a Juan")
 * and to the event's activity. `decide` says, from the current row, what changes (or refuses).
 * An edit that escalates to high or critical alerts the staff like a new report would.
 */
const editIncident = (
  eventId: string,
  id: string,
  decide: (current: IncidentRow, who: Viewer) => Effect.Effect<Change, Forbidden>
) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const who = yield* viewer;

    const outcome = yield* transaction(
      Effect.gen(function* () {
        const [current] = yield* query((db) =>
          db
            .select()
            .from(incidents)
            .where(and(eq(incidents.id, id), eq(incidents.eventId, eventId), visibleTo(who)))
            .for("update")
        );
        if (!current) return yield* incidentNotFound;
        const wanted = yield* decide(current, who);

        const change: Change = {};
        const lines: string[] = [];
        let assigneeName: string | undefined;
        let roomName: string | null = null;

        if (wanted.status !== undefined && wanted.status !== current.status) {
          change.status = wanted.status;
          lines.push(`cambió el estado a ${STATUS_WORDS[wanted.status]}`);
        }
        if (wanted.assigneeId !== undefined && wanted.assigneeId !== current.assigneeId) {
          change.assigneeId = wanted.assigneeId;
          if (wanted.assigneeId === me.id) lines.push("se lo asignó");
          else if (wanted.assigneeId) {
            assigneeName = (yield* staffMember(wanted.assigneeId)).name;
            lines.push(`asignó a ${assigneeName}`);
          } else lines.push("lo dejó sin asignar");
        }
        if (wanted.severity !== undefined && wanted.severity !== current.severity) {
          change.severity = wanted.severity;
          lines.push(`cambió la gravedad a ${SEVERITY_WORDS[wanted.severity]}`);
        }
        if (wanted.roomId !== undefined && wanted.roomId !== current.roomId) {
          change.roomId = wanted.roomId;
          roomName = wanted.roomId ? (yield* roomInEvent(wanted.roomId, eventId)).name : null;
          lines.push(roomName ? `lo movió a ${roomName}` : "le sacó la sala");
        }
        if (lines.length === 0) return null;

        yield* query((db) =>
          db
            .update(incidents)
            .set({
              ...change,
              ...(change.status ? { resolvedAt: change.status === "resolved" ? new Date() : null } : {}),
            })
            .where(eq(incidents.id, id))
        );
        yield* query((db) =>
          db.insert(incidentNotes).values({ incidentId: id, authorId: me.id, body: lines.join(" · ") })
        );
        yield* recordActivity({
          eventId,
          verb: change.status === "resolved" ? "incident.resolved" : "incident.updated",
          entityType: "incident",
          entityId: id,
          summary: current.sensitive
            ? "actualizó un incidente confidencial"
            : activityLine(current, change, me.id, { assignee: assigneeName, room: roomName }),
        });

        if (!(change.severity !== undefined && isLoud(change.severity) && !isLoud(current.severity))) {
          return { current, alertAt: undefined };
        }
        const roomId = change.roomId === undefined ? current.roomId : change.roomId;
        const where = roomId ? (roomName ?? (yield* roomInEvent(roomId, eventId)).name) : current.location;
        return { current, alertAt: where };
      })
    );

    if (outcome) {
      if (outcome.alertAt !== undefined) yield* alertStaff(eventId, outcome.current, outcome.alertAt);
      yield* opsPing(eventId, "incidents");
    }

    return yield* getIncident({ eventId, id });
  });

/** Editors change anything; the person it's assigned to may move its status. */
export const updateIncident = ({ eventId, id, ...wanted }: UpdateIncidentInput) =>
  editIncident(eventId, id, (current, who) => {
    const statusOnly = wanted.assigneeId === undefined && wanted.severity === undefined && wanted.roomId === undefined;
    if (who.editor || (statusOnly && current.assigneeId === who.id)) return Effect.succeed(wanted);

    return Effect.fail(
      new Forbidden({ message: "Solo un editor cambia esto; quien lo tiene asignado puede cambiarle el estado" })
    );
  });

/** "Voy yo": anyone who can see it takes it, and an open one is now in progress. */
export const assignToMe = ({ eventId, id }: { eventId: string; id: string }) =>
  editIncident(eventId, id, (current, who) =>
    Effect.succeed({ assigneeId: who.id, ...(current.status === "open" ? { status: "in_progress" as const } : {}) })
  );

/** Notes are append-only: there is no way to edit or delete one. */
export const addNote = ({ eventId, id, body }: { eventId: string; id: string; body: string }) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const who = yield* viewer;
    const [current] = yield* query((db) =>
      db
        .select({ title: incidents.title, sensitive: incidents.sensitive })
        .from(incidents)
        .where(and(eq(incidents.id, id), eq(incidents.eventId, eventId), visibleTo(who)))
    );
    if (!current) return yield* incidentNotFound;

    yield* transaction(
      Effect.gen(function* () {
        yield* query((db) => db.insert(incidentNotes).values({ incidentId: id, authorId: me.id, body }));
        yield* recordActivity({
          eventId,
          verb: "incident.noted",
          entityType: "incident",
          entityId: id,
          summary: current.sensitive ? "anotó en un incidente confidencial" : `anotó en «${current.title}»`,
        });
      })
    );
    yield* opsPing(eventId, "incidents");

    return yield* getIncident({ eventId, id });
  });

/** A room's host asks for a hand: every staff phone hears it, calmly. */
export const requestStaff = ({ eventId, roomId }: { eventId: string; roomId: string }) =>
  Effect.gen(function* () {
    const room = yield* roomInEvent(roomId, eventId);
    const announcement = yield* createAnnouncement({
      eventId,
      urgent: false,
      audience: "all",
      body: `Se necesita ayuda en ${room.name}`,
    });
    yield* recordActivity({
      eventId,
      verb: "room.help",
      entityType: "room",
      entityId: room.id,
      summary: `pidió staff en ${room.name}`,
    });
    yield* opsPing(eventId, "activity");

    return announcement;
  });
