import { and, asc, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { Effect } from "effect";

import { CONDUCT_EMAIL } from "../../community/site";
import { communities, communityMembers, events, incidentNotes, incidents, user } from "../../db/schema";
import { conductReportEmail } from "../../email/community-templates";
import { enqueueEmail } from "../../email/outbox";
import { appUrl } from "../../email/templates";
import { refreshEvent } from "../../revalidate";
import { allowed } from "../authz";
import { query, transaction } from "../db";
import { Forbidden, Invalid, NotFound } from "../errors";
import { memberRole } from "../scope";
import { CommunityScope, CurrentUser } from "../services";
import type { ConductReports, ReportInput } from "./schemas";

/** Members help at the door and door volunteers only scan: responders come from the organizers. */
const NOT_RESPONDERS = ["member", "door"];

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

/** Who on the team can be named a responder, and who is, for the event in scope. */
export const team = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [event] = yield* query((db) =>
      db
        .select({ responders: events.responders, capacity: events.capacity })
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
    );
    if (!event) return yield* eventNotFound;
    const candidates = yield* query((db) =>
      db
        .select({ userId: communityMembers.userId, name: user.name, role: communityMembers.role })
        .from(communityMembers)
        .innerJoin(user, eq(user.id, communityMembers.userId))
        .where(and(eq(communityMembers.communityId, communityId), notInArray(communityMembers.role, NOT_RESPONDERS)))
        .orderBy(asc(user.name))
    );

    return { responders: event.responders, candidates, capacity: event.capacity };
  });

/** Name 1–3 responders from the team; the event's page shows their names. */
export const setResponders = (input: { eventId: string; userIds: string[] }) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const { candidates } = yield* team(input.eventId);
    if (input.userIds.some((id) => !candidates.some((candidate) => candidate.userId === id))) {
      return yield* new Invalid({ message: "Solo se puede nombrar a gente del equipo con rol de editor o más" });
    }
    const [row] = yield* query((db) =>
      db
        .update(events)
        .set({ responders: input.userIds })
        .where(and(eq(events.id, input.eventId), eq(events.communityId, communityId)))
        .returning({ slug: events.slug, status: events.status })
    );
    const [community] = yield* query((db) =>
      db.select({ slug: communities.slug }).from(communities).where(eq(communities.id, communityId))
    );
    if (row && community && row.status !== "draft") refreshEvent(community.slug, row.slug);

    return yield* team(input.eventId);
  });

/**
 * A report from the event's page, anyone, anonymous unless they leave a contact. It's kept as a
 * confidential incident and mailed to the event's responders and OWU's conduct team; when it names
 * someone on the team, to OWU only, and nobody on the team can read it.
 */
export const report = (input: ReportInput) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({
          id: events.id,
          name: events.name,
          responders: events.responders,
          community: communities.name,
          communityId: communities.id,
          communitySlug: communities.slug,
        })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(
          and(
            eq(communities.slug, input.communitySlug),
            eq(communities.isActive, true),
            eq(events.slug, input.eventSlug),
            eq(events.isActive, true),
            ne(events.status, "draft")
          )
        )
    );
    if (!row) return yield* eventNotFound;
    // Responders still on the team; nobody of the team when the report names one of them
    const responders =
      input.involvesOrganizer || row.responders.length === 0
        ? []
        : yield* query((db) =>
            db
              .select({ email: user.email })
              .from(communityMembers)
              .innerJoin(user, eq(user.id, communityMembers.userId))
              .where(
                and(eq(communityMembers.communityId, row.communityId), inArray(communityMembers.userId, row.responders))
              )
          );

    return yield* transaction(
      Effect.gen(function* () {
        const [incident] = yield* query((db) =>
          db
            .insert(incidents)
            .values({
              eventId: row.id,
              title: input.involvesOrganizer
                ? "Reporte de conducta (involucra a la organización)"
                : "Reporte de conducta",
              description: input.description,
              severity: "high",
              category: "conduct",
              location: input.where || null,
              source: "public",
              sensitive: true,
              reporterContact: input.contact || null,
              involvesOrganizer: input.involvesOrganizer,
            })
            .returning({ id: incidents.id })
        );
        const panelUrl = appUrl(`/organizar/panel/${row.communitySlug}/eventos/${row.id}/conducta`);
        for (const to of [...responders.map((person) => person.email), CONDUCT_EMAIL]) {
          yield* enqueueEmail({
            kind: "conduct_report",
            to,
            priority: 2,
            dedupeKey: `conduct_report:${incident.id}:${to.toLowerCase()}`,
            ...conductReportEmail({
              event: row.name,
              community: row.community,
              description: input.description,
              where: input.where || null,
              contact: input.contact || null,
              involvesOrganizer: input.involvesOrganizer,
              panelUrl,
              forOwu: to === CONDUCT_EMAIL,
            }),
          });
        }

        return { ok: true as const, to: responders.length > 0 ? ("both" as const) : ("owu" as const) };
      })
    );
  });

/**
 * May the caller read the event's reports? OWU's conduct staff (the platform's incident:confidential)
 * read them; a responder named on the event, still on its team, too. Those that name someone on the
 * team only OWU staff outside that team read. Nobody else, not even the community's admins.
 */
const reader = (eventId: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const [event] = yield* query((db) =>
      db
        .select({
          id: events.id,
          name: events.name,
          startDate: events.startDate,
          communityId: events.communityId,
          responders: events.responders,
        })
        .from(events)
        .where(eq(events.id, eventId))
    );
    if (!event) return yield* eventNotFound;
    const onTeam = Boolean(yield* memberRole(event.communityId, me.id));
    if (yield* allowed("incident:confidential")) return { event, as: "staff" as const, onTeam };
    if (event.responders.includes(me.id) && onTeam) return { event, as: "responder" as const, onTeam };

    return yield* new Forbidden({
      message: "No tenés acceso: los reportes de conducta los leen quienes responden por la conducta del evento y OWU",
    });
  });

/** The event's reports with their notes, newest first, as the caller may see them. */
export const reports = (eventId: string) =>
  Effect.gen(function* () {
    const { event, as, onTeam } = yield* reader(eventId);
    const rows = yield* query((db) =>
      db
        .select()
        .from(incidents)
        .where(
          and(
            eq(incidents.eventId, eventId),
            eq(incidents.source, "public"),
            eq(incidents.category, "conduct"),
            as === "staff" && !onTeam ? undefined : eq(incidents.involvesOrganizer, false)
          )
        )
        .orderBy(desc(incidents.createdAt))
    );
    const notes =
      rows.length === 0
        ? []
        : yield* query((db) =>
            db
              .select({
                id: incidentNotes.id,
                incidentId: incidentNotes.incidentId,
                body: incidentNotes.body,
                author: user.name,
                createdAt: incidentNotes.createdAt,
              })
              .from(incidentNotes)
              .leftJoin(user, eq(user.id, incidentNotes.authorId))
              .where(
                inArray(
                  incidentNotes.incidentId,
                  rows.map((row) => row.id)
                )
              )
              .orderBy(asc(incidentNotes.createdAt))
          );

    return {
      event: { id: event.id, name: event.name, startDate: event.startDate.toISOString() },
      as,
      reports: rows.map((row) => ({
        id: row.id,
        description: row.description ?? "",
        where: row.location,
        contact: row.reporterContact,
        involvesOrganizer: row.involvesOrganizer,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        notes: notes
          .filter((note) => note.incidentId === row.id)
          .map((note) => ({
            id: note.id,
            body: note.body,
            author: note.author,
            createdAt: note.createdAt.toISOString(),
          })),
      })),
    } satisfies ConductReports;
  });

/** One report the caller may read, or a 404 (never a hint it exists). */
const readable = (eventId: string, id: string) =>
  Effect.gen(function* () {
    const { reports: list } = yield* reports(eventId);
    const found = list.find((item) => item.id === id);

    return found ?? (yield* new NotFound({ entity: "incident", message: "Ese reporte no está en este evento" }));
  });

const STATUS_WORDS = { open: "abierto", in_progress: "en curso", resolved: "resuelto" } as const;

/** A note in the report's log: what was done, who talked to whom. */
export const addNote = (input: { eventId: string; id: string; body: string }) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* readable(input.eventId, input.id);
    yield* query((db) =>
      db.insert(incidentNotes).values({ incidentId: input.id, authorId: me.id, body: input.body, kind: "note" })
    );

    return yield* reports(input.eventId);
  });

/** Open, in progress, resolved: the change goes in its log. */
export const setStatus = (input: { eventId: string; id: string; status: keyof typeof STATUS_WORDS }) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const current = yield* readable(input.eventId, input.id);
    if (current.status !== input.status) {
      yield* transaction(
        Effect.gen(function* () {
          yield* query((db) =>
            db
              .update(incidents)
              .set({ status: input.status, resolvedAt: input.status === "resolved" ? new Date() : null })
              .where(eq(incidents.id, input.id))
          );
          yield* query((db) =>
            db.insert(incidentNotes).values({
              incidentId: input.id,
              authorId: me.id,
              body: `cambió el estado a ${STATUS_WORDS[input.status]}`,
              kind: "change",
            })
          );
        })
      );
    }

    return yield* reports(input.eventId);
  });
