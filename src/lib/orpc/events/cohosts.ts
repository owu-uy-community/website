import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect, Option } from "effect";

import { shortWhen } from "../../community/time";
import { communities, communityMembers, eventHosts, events, user } from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, cohostInviteEmail } from "../../email/templates";
import { ROLE_RANK } from "../../roles";
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

/**
 * Set who organizes the event with its community. A community the person also organizes (or any,
 * for site staff) joins at once; any other is invited, its organizers get an email, and the event
 * only shows on its profile once it accepts. Removing one takes it off.
 */
export const setCohosts = (event: { id: string; name: string; communityId: string; startDate: Date }, ids: string[]) =>
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
        .select({ id: communities.id, name: communities.name, slug: communities.slug })
        .from(communities)
        .where(and(inArray(communities.id, added), eq(communities.isActive, true)))
    );
    if (found.length !== added.length) return yield* new Invalid({ message: "Esa comunidad no está en OWU" });
    const [host] = yield* query((db) =>
      db.select({ name: communities.name }).from(communities).where(eq(communities.id, event.communityId))
    );
    const userId = Option.isSome(actor) ? actor.value.id : null;
    const staff = Option.isSome(actor) && actor.value.role === "admin";
    const roles = userId
      ? yield* query((db) =>
          db
            .select({ communityId: communityMembers.communityId, role: communityMembers.role })
            .from(communityMembers)
            .where(and(eq(communityMembers.userId, userId), inArray(communityMembers.communityId, added)))
        )
      : [];
    const organizes = (communityId: string) =>
      staff || roles.some((row) => row.communityId === communityId && ROLE_RANK[row.role] >= ROLE_RANK.editor);

    for (const community of found) {
      const accepted = organizes(community.id);
      yield* query((db) =>
        db
          .insert(eventHosts)
          .values({
            eventId: event.id,
            communityId: community.id,
            status: accepted ? "accepted" : "invited",
            invitedById: userId,
          })
          .onConflictDoNothing()
      );
      if (accepted) continue;
      const organizers = yield* query((db) =>
        db
          .select({ email: user.email })
          .from(communityMembers)
          .innerJoin(user, eq(user.id, communityMembers.userId))
          .where(
            and(
              eq(communityMembers.communityId, community.id),
              inArray(communityMembers.role, ["owner", "admin", "editor"])
            )
          )
      );
      for (const organizer of organizers) {
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
    }
  });

const hostCommunity = alias(communities, "host_community");

/** Invitations waiting for the scoped community: events another community wants to organize with it. */
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
        and(eq(eventHosts.communityId, communityId), eq(eventHosts.status, "invited"), ne(events.status, "cancelled"))
      )
      .orderBy(asc(events.startDate))
  );

  return rows.map((row) => ({ ...row, startDate: row.startDate.toISOString() }));
});

/** Accept an invitation (the event shows on the community's profile too) or turn it down. */
export const answer = (input: { hostedEventId: string; accept: boolean }) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const mine = and(
      eq(eventHosts.eventId, input.hostedEventId),
      eq(eventHosts.communityId, communityId),
      eq(eventHosts.status, "invited")
    );
    const changed = input.accept
      ? yield* query((db) =>
          db.update(eventHosts).set({ status: "accepted" }).where(mine).returning({ id: eventHosts.eventId })
        )
      : yield* query((db) => db.delete(eventHosts).where(mine).returning({ id: eventHosts.eventId }));
    if (changed.length === 0) {
      return yield* new Conflict({ reason: "gone", message: "Esa invitación ya no está" });
    }

    return { accepted: input.accept };
  });
