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
import { allowed } from "../authz";
import { CommunityScope, CurrentUser, isBot } from "../services";
import { createAnnouncement } from "../staff-tasks/service";
import type {
  CreateIncidentInput,
  Incident,
  IncidentCategory,
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
const CATEGORY_WORDS: Record<IncidentCategory, string> = {
  medical: "médico",
  conduct: "conducta",
  technical: "técnica",
  venue: "venue",
  lost: "perdidos",
  other: "otro",
};
const SEVERITY_RANK: Record<IncidentSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const isLoud = (severity: IncidentSeverity) => SEVERITY_RANK[severity] >= SEVERITY_RANK.high;

const person = { columns: { id: true, name: true, image: true } } as const;
const place = { columns: { id: true, name: true, color: true } } as const;

const incidentNotFound = new NotFound({ entity: "incident", message: "Ese incidente no existe en este evento" });

/**
 * Who is asking, as far as incidents care. Organizers (`incident:confidential`: site staff, the
 * community's owners and admins) see code-of-conduct reports; `incident:manage` manages incidents.
 */
const viewer = Effect.gen(function* () {
  const me = yield* CurrentUser;
  const { communityId } = yield* CommunityScope;
  const [organizer, editor] = yield* Effect.all([
    allowed("incident:confidential", communityId),
    allowed("incident:manage", communityId),
  ]);

  return { id: me.id, organizer, editor };
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
        kind: note.kind,
        author: note.author,
        createdAt: note.createdAt.toISOString(),
        editedAt: note.editedAt?.toISOString() ?? null,
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
    const quiet = isBot(me) && isLoud(input.severity) && (yield* owyAlertedRecently(input.eventId, me.id));

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
              source: isBot(me) ? "owy" : (input.source ?? "admin"),
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

type Change = Partial<
  Pick<
    IncidentRow,
    | "status"
    | "assigneeId"
    | "severity"
    | "roomId"
    | "title"
    | "description"
    | "category"
    | "location"
    | "sensitive"
    | "photo"
  >
>;

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
  if (change.roomId !== undefined) return names.room ? `movió ${quoted} a ${names.room}` : `sacó ${quoted} de su sala`;
  if (change.title) return `le cambió el título a ${quoted}: «${change.title}»`;

  return `editó ${quoted}`;
}

/** What the report itself says, as opposed to how it's being handled (status, assignee, severity, room). */
const REPORT_FIELDS = ["title", "description", "category", "location", "photo"] as const;

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
        if (wanted.title !== undefined && wanted.title !== current.title) {
          change.title = wanted.title;
          lines.push(`cambió el título a «${wanted.title}»`);
        }
        const description = wanted.description === undefined ? undefined : wanted.description || null;
        if (description !== undefined && description !== current.description) {
          change.description = description;
          lines.push(description ? "cambió el detalle" : "le sacó el detalle");
        }
        if (wanted.category !== undefined && wanted.category !== current.category) {
          change.category = wanted.category;
          lines.push(`cambió el tipo a ${CATEGORY_WORDS[wanted.category]}`);
        }
        const location = wanted.location === undefined ? undefined : wanted.location || null;
        if (location !== undefined && location !== current.location) {
          change.location = location;
          lines.push(location ? `cambió el lugar a «${location}»` : "le sacó el lugar");
        }
        if (wanted.sensitive !== undefined && wanted.sensitive !== current.sensitive) {
          // Out of confidential, a conduct report reaches the whole staff: only organizers do that.
          if (!wanted.sensitive && !who.organizer) {
            return yield* new Forbidden({ message: "Solo un organizador le saca lo confidencial a un incidente" });
          }
          change.sensitive = wanted.sensitive;
          lines.push(wanted.sensitive ? "lo marcó como confidencial" : "le sacó lo confidencial");
        }
        if (wanted.photo !== undefined && wanted.photo !== current.photo) {
          change.photo = wanted.photo;
          lines.push(wanted.photo ? (current.photo ? "cambió la foto" : "le agregó una foto") : "le sacó la foto");
        }
        // What a confidential report says is its evidence: like deleting it, only organizers rewrite it.
        if (current.sensitive && !who.organizer && REPORT_FIELDS.some((field) => field in change)) {
          return yield* new Forbidden({
            message: "Lo que dice un incidente confidencial lo cambia solo un organizador: anotá lo nuevo",
          });
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
          db.insert(incidentNotes).values({ incidentId: id, authorId: me.id, body: lines.join(" · "), kind: "change" })
        );
        yield* recordActivity({
          eventId,
          verb: change.status === "resolved" ? "incident.resolved" : "incident.updated",
          entityType: "incident",
          entityId: id,
          summary:
            current.sensitive || change.sensitive
              ? "actualizó un incidente confidencial"
              : activityLine(current, change, me.id, { assignee: assigneeName, room: roomName }),
        });

        if (!(change.severity !== undefined && isLoud(change.severity) && !isLoud(current.severity))) {
          return { after: current, alertAt: undefined };
        }
        // The alert tells of the incident as it is now, and as confidential if it was or now is one.
        const after = {
          title: change.title ?? current.title,
          sensitive: current.sensitive || change.sensitive === true,
        };
        const roomId = change.roomId === undefined ? current.roomId : change.roomId;
        const place = change.location === undefined ? current.location : change.location;
        const where = roomId ? (roomName ?? (yield* roomInEvent(roomId, eventId)).name) : place;
        return { after, alertAt: where };
      })
    );

    if (outcome) {
      if (outcome.alertAt !== undefined) yield* alertStaff(eventId, outcome.after, outcome.alertAt);
      yield* opsPing(eventId, "incidents");
    }

    return yield* getIncident({ eventId, id });
  });

/** Editors change anything; the person it's assigned to may move its status. */
export const updateIncident = ({ eventId, id, ...wanted }: UpdateIncidentInput) =>
  editIncident(eventId, id, (current, who) => {
    const { status: _status, ...rest } = wanted;
    const statusOnly = Object.values(rest).every((value) => value === undefined);
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

/** A note at the end of the log; its author (or an editor) can fix or delete it later. */
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
        yield* query((db) => db.insert(incidentNotes).values({ incidentId: id, authorId: me.id, body, kind: "note" }));
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

/**
 * An incident gone, with its log: for a duplicate or a mistake. Editors, of what they can see; a
 * confidential one only organizers, so whoever it's about can't make a conduct report disappear.
 */
export const deleteIncident = ({ eventId, id }: { eventId: string; id: string }) =>
  Effect.gen(function* () {
    const who = yield* viewer;
    if (!who.editor) return yield* new Forbidden({ message: "Solo un editor borra un incidente" });

    yield* transaction(
      Effect.gen(function* () {
        const [current] = yield* query((db) =>
          db
            .select({ sensitive: incidents.sensitive })
            .from(incidents)
            .where(and(eq(incidents.id, id), eq(incidents.eventId, eventId), visibleTo(who)))
            .for("update")
        );
        if (!current) return yield* incidentNotFound;
        if (current.sensitive && !who.organizer) {
          return yield* new Forbidden({ message: "Un incidente confidencial lo borra solo un organizador" });
        }
        const [row] = yield* query((db) =>
          db
            .delete(incidents)
            .where(eq(incidents.id, id))
            .returning({ id: incidents.id, title: incidents.title, sensitive: incidents.sensitive })
        );
        yield* recordActivity({
          eventId,
          verb: "incident.deleted",
          entityType: "incident",
          entityId: row.id,
          summary: row.sensitive ? "borró un incidente confidencial" : `borró «${row.title}»`,
        });
      })
    );
    yield* opsPing(eventId, "incidents");

    return { ok: true as const };
  });

/**
 * A typed note, the way it was meant: fix it or take it out of the log. Its author or an editor;
 * the lines an edit wrote (`change`) stay as they were.
 */
const fixableNote = ({ eventId, id, noteId }: { eventId: string; id: string; noteId: string }) =>
  Effect.gen(function* () {
    const who = yield* viewer;
    const [note] = yield* query((db) =>
      db
        .select({
          id: incidentNotes.id,
          kind: incidentNotes.kind,
          authorId: incidentNotes.authorId,
          incidentTitle: incidents.title,
          sensitive: incidents.sensitive,
        })
        .from(incidentNotes)
        .innerJoin(incidents, eq(incidents.id, incidentNotes.incidentId))
        .where(and(eq(incidentNotes.id, noteId), eq(incidents.id, id), eq(incidents.eventId, eventId), visibleTo(who)))
    );
    if (!note) return yield* new NotFound({ entity: "note", message: "Esa nota no está en este incidente" });
    if (note.kind !== "note") {
      return yield* new Forbidden({ message: "Lo que registró un cambio queda como está: anotá la corrección" });
    }
    // On a confidential report, someone else's note is the organizers' to touch.
    if (note.authorId !== who.id && !(note.sensitive ? who.organizer : who.editor)) {
      return yield* new Forbidden({
        message: note.sensitive
          ? "En un incidente confidencial, una nota la cambia quien la escribió o un organizador"
          : "Solo quien la escribió, o un editor, la cambia",
      });
    }

    return note;
  });

export const updateNote = (input: { eventId: string; id: string; noteId: string; body: string }) =>
  Effect.gen(function* () {
    const note = yield* fixableNote(input);
    yield* transaction(
      Effect.gen(function* () {
        yield* query((db) =>
          db.update(incidentNotes).set({ body: input.body, editedAt: new Date() }).where(eq(incidentNotes.id, note.id))
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "incident.note_updated",
          entityType: "incident",
          entityId: input.id,
          summary: note.sensitive
            ? "corrigió una nota de un incidente confidencial"
            : `corrigió una nota de «${note.incidentTitle}»`,
        });
      })
    );
    yield* opsPing(input.eventId, "incidents");

    return yield* getIncident({ eventId: input.eventId, id: input.id });
  });

export const deleteNote = (input: { eventId: string; id: string; noteId: string }) =>
  Effect.gen(function* () {
    const note = yield* fixableNote(input);
    yield* transaction(
      Effect.gen(function* () {
        yield* query((db) => db.delete(incidentNotes).where(eq(incidentNotes.id, note.id)));
        yield* recordActivity({
          eventId: input.eventId,
          verb: "incident.note_deleted",
          entityType: "incident",
          entityId: input.id,
          summary: note.sensitive
            ? "borró una nota de un incidente confidencial"
            : `borró una nota de «${note.incidentTitle}»`,
        });
      })
    );
    yield* opsPing(input.eventId, "incidents");

    return yield* getIncident({ eventId: input.eventId, id: input.id });
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
