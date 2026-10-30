import { and, asc, count, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect, Option } from "effect";

import { shortWhen } from "../../community/time";
import { communities, communityMembers, eventHosts, events, user } from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, cohostInviteEmail } from "../../email/templates";
import { eventPagePath, refreshPage } from "../../revalidate";
import { can } from "../../authz/principal";
import { query } from "../db";
import { Conflict, Invalid } from "../errors";
import { CommunityScope, CurrentUser } from "../services";

/** At most this many other communities on one event */
export const MAX_COHOSTS = 3;

/** The communities organizing an event with its own, as its organizers see them. */
export const cohostsOf = (eventId: string) =>
  query((db) =>
    db
      .select({ id: communities.id, name: communities.name, slug: communities.slug, status: eventHosts.status })
      .from(eventHosts)
      .innerJoin(communities, eq(communities.id, eventHosts.communityId))
      .where(eq(eventHosts.eventId, eventId))
      .orderBy(asc(communities.name))
  );

/** Those that accepted: what the public page and the profiles show. */
export const acceptedCohosts = (eventId: string) =>
  query((db) =>
    db
      .select({ name: communities.name, slug: communities.slug })
      .from(eventHosts)
      .innerJoin(communities, eq(communities.id, eventHosts.communityId))
      .where(and(eq(eventHosts.eventId, eventId), eq(eventHosts.status, "accepted")))
      .orderBy(asc(communities.name))
  );

/** Pending invitations one community can have open with another at a time */
const MAX_PENDING = 5;

type CohostEvent = { id: string; name: string; communityId: string; startDate: Date; status: string };

/**
 * Set who organizes the event with its community. A community the person also organizes (or any,
 * for site staff) joins at once; any other is invited, and the event only shows on its profile
 * once it accepts. Invitations go out when the event is published (so they carry its final name
 * and date), or right away for an event already published. A community that said no stays that
 * way until it's removed and asked again. Removing one takes it off.
 */
export const setCohosts = (event: CohostEvent, ids: string[]) =>
  Effect.gen(function* () {
    const wanted = [...new Set(ids)].filter((id) => id !== event.communityId);
    if (wanted.length > MAX_COHOSTS) {
      return yield* new Invalid({ message: `Hasta ${MAX_COHOSTS} comunidades coorganizadoras` });
    }
    const actor = yield* Effect.serviceOption(CurrentUser);
    const current = (yield* cohostsOf(event.id)).map((row) => row.id);
    const removed = current.filter((id) => !wanted.includes(id));
    const added = wanted.filter((id) => !current.includes(id));
    if (removed.length > 0) {
      yield* query((db) =>
        db.delete(eventHosts).where(and(eq(eventHosts.eventId, event.id), inArray(eventHosts.communityId, removed)))
      );
    }
    if (added.length === 0) return;

    const found = yield* query((db) =>
      db
        .select({ id: communities.id })
        .from(communities)
        .where(and(inArray(communities.id, added), eq(communities.isActive, true)))
    );
    if (found.length !== added.length) return yield* new Invalid({ message: "Esa comunidad no está en OWU" });
    // Co-hosting is accepted on the spot when the editor may co-host for that community too
    const principal = Option.isSome(actor) ? actor.value.principal : null;
    const decided = yield* Effect.promise(() =>
      Promise.all(added.map((communityId) => can(principal, "event:cohost", communityId)))
    );
    const organizes = (communityId: string) => decided[added.indexOf(communityId)];

    for (const communityId of added) {
      const accepted = organizes(communityId);
      if (!accepted) {
        // An invitation per event, but not a flood of them from one community to another
        const [{ pending }] = yield* query((db) =>
          db
            .select({ pending: count() })
            .from(eventHosts)
            .innerJoin(events, eq(events.id, eventHosts.eventId))
            .where(
              and(
                eq(eventHosts.communityId, communityId),
                eq(eventHosts.status, "invited"),
                eq(events.communityId, event.communityId)
              )
            )
        );
        if (pending >= MAX_PENDING) {
          return yield* new Conflict({
            reason: "too_many_invites",
            message: "Esa comunidad tiene varias invitaciones tuyas sin responder: esperá a que contesten",
          });
        }
      }
      yield* query((db) =>
        db
          .insert(eventHosts)
          .values({
            eventId: event.id,
            communityId,
            status: accepted ? "accepted" : "invited",
            invitedById: Option.isSome(actor) ? actor.value.id : null,
          })
          .onConflictDoNothing()
      );
    }
    if (event.status === "published") yield* inviteCohosts(event);
  });

/**
 * Email the organizers of every community still invited to a published event. Each organizer
 * hears about each event once (the dedupe key).
 */
export const inviteCohosts = (event: CohostEvent) =>
  Effect.gen(function* () {
    const invited = yield* query((db) =>
      db
        .select({ id: communities.id, name: communities.name, slug: communities.slug })
        .from(eventHosts)
        .innerJoin(communities, eq(communities.id, eventHosts.communityId))
        .where(and(eq(eventHosts.eventId, event.id), eq(eventHosts.status, "invited")))
    );
    if (invited.length === 0) return;
    const [host] = yield* query((db) =>
      db.select({ name: communities.name }).from(communities).where(eq(communities.id, event.communityId))
    );
    const organizers = yield* query((db) =>
      db
        .select({ communityId: communityMembers.communityId, email: user.email })
        .from(communityMembers)
        .innerJoin(user, eq(user.id, communityMembers.userId))
        .where(
          and(
            inArray(
              communityMembers.communityId,
              invited.map((row) => row.id)
            ),
            inArray(communityMembers.role, ["owner", "admin", "editor"])
          )
        )
    );
    for (const organizer of organizers) {
      const community = invited.find((row) => row.id === organizer.communityId);
      if (!community) continue;
      yield* enqueueEmail({
        kind: "cohost_invite",
        to: organizer.email,
        priority: 4,
        dedupeKey: `cohost_invite:${event.id}:${community.id}:${organizer.email}`,
        ...cohostInviteEmail({
          host: host?.name ?? "Una comunidad",
          community: community.name,
          event: event.name,
          when: shortWhen(event.startDate),
          panelUrl: appUrl(`/organizar/panel/${community.slug}`),
        }),
      });
    }
  });

const hostCommunity = alias(communities, "host_community");

/** Invitations waiting for the scoped community: published events another community wants to organize with it. */
export const invitations = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const rows = yield* query((db) =>
    db
      .select({
        eventId: events.id,
        name: events.name,
        startDate: events.startDate,
        host: hostCommunity.name,
      })
      .from(eventHosts)
      .innerJoin(events, eq(events.id, eventHosts.eventId))
      .innerJoin(hostCommunity, eq(hostCommunity.id, events.communityId))
      .where(
        and(eq(eventHosts.communityId, communityId), eq(eventHosts.status, "invited"), eq(events.status, "published"))
      )
      .orderBy(asc(events.startDate))
  );

  return rows.map((row) => ({ ...row, startDate: row.startDate.toISOString() }));
});

/**
 * Accept an invitation to a published event (it shows on the community's profile too) or say no:
 * a "no" stays, so the host's next edit doesn't ask again.
 */
export const answer = (input: { hostedEventId: string; accept: boolean }) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [row] = yield* query((db) =>
      db
        .select({ eventSlug: events.slug, hostSlug: hostCommunity.slug, slug: communities.slug })
        .from(eventHosts)
        .innerJoin(events, eq(events.id, eventHosts.eventId))
        .innerJoin(hostCommunity, eq(hostCommunity.id, events.communityId))
        .innerJoin(communities, eq(communities.id, eventHosts.communityId))
        .where(
          and(
            eq(eventHosts.eventId, input.hostedEventId),
            eq(eventHosts.communityId, communityId),
            eq(eventHosts.status, "invited"),
            eq(events.status, "published")
          )
        )
    );
    if (!row) return yield* new Conflict({ reason: "gone", message: "Esa invitación ya no está" });
    yield* query((db) =>
      db
        .update(eventHosts)
        .set({ status: input.accept ? "accepted" : "declined" })
        .where(and(eq(eventHosts.eventId, input.hostedEventId), eq(eventHosts.communityId, communityId)))
    );
    if (input.accept) {
      refreshPage(`/comunidad/${row.slug}`);
      refreshPage(`/comunidad/${row.hostSlug}`);
      refreshPage(eventPagePath(row.hostSlug, row.eventSlug));
    }

    return { accepted: input.accept };
  });
