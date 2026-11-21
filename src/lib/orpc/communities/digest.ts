import { and, asc, eq, gt, isNull, like, lt, sql } from "drizzle-orm";
import { Effect } from "effect";

import { shortWhen } from "../../community/time";
import {
  communities,
  communityFollowers,
  emailDeliveries,
  emailSuppressions,
  events,
  user,
  venues,
} from "../../db/schema";
import { followerDigestEmail, type DigestEvent } from "../../email/community-templates";
import { enqueueEmail } from "../../email/outbox";
import { appUrl } from "../../email/templates";
import { unsubscribeToken } from "../../links";
import { DIGEST_DAYS, digestDue, isoWeek } from "../../organizar/digest";
import { eventPagePath } from "../../revalidate";
import { query } from "../db";

const KIND = "follower_digest";
/** How many events from the rest of OWU close the digest */
const OTHERS = 3;

/**
 * The weekly digest, for followers who chose it: on Mondays from 09:00, each gets the next two
 * weeks of what their communities published, plus a few more from OWU. One per person and week
 * (the dedupe key), so every tick that Monday may run it, at once too; nothing when there's
 * nothing ahead. `force` skips the Monday check (the cron's ?digest=now, for tests).
 */
export const sendDigests = ({ force = false, now = new Date() }: { force?: boolean; now?: Date } = {}) =>
  Effect.gen(function* () {
    if (!force && !digestDue(now)) return { due: false, queued: 0 };
    const week = isoWeek(now);
    const [follows, done] = yield* Effect.all([
      query((db) =>
        db
          .select({ userId: user.id, email: user.email, communityId: communityFollowers.communityId })
          .from(communityFollowers)
          .innerJoin(user, eq(user.id, communityFollowers.userId))
          .leftJoin(
            emailSuppressions,
            and(eq(emailSuppressions.email, sql`lower(${user.email})`), eq(emailSuppressions.scope, "followers"))
          )
          .where(and(eq(communityFollowers.digest, "weekly"), isNull(emailSuppressions.email)))
      ),
      query((db) =>
        db
          .select({ dedupeKey: emailDeliveries.dedupeKey })
          .from(emailDeliveries)
          .where(and(eq(emailDeliveries.kind, KIND), like(emailDeliveries.dedupeKey, `${KIND}:%:${week}`)))
      ),
    ]);
    const sent = new Set(done.map((row) => row.dedupeKey));
    const people = new Map<string, { email: string; communities: Set<string> }>();
    for (const row of follows) {
      if (sent.has(`${KIND}:${row.userId}:${week}`)) continue;
      const person = people.get(row.userId) ?? { email: row.email, communities: new Set<string>() };
      person.communities.add(row.communityId);
      people.set(row.userId, person);
    }
    if (people.size === 0) return { due: true, queued: 0 };

    const ahead = yield* query((db) =>
      db
        .select({ event: events, community: { name: communities.name, slug: communities.slug }, venue: venues.name })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(
          and(
            eq(events.status, "published"),
            eq(events.isActive, true),
            eq(communities.isActive, true),
            gt(events.startDate, now),
            lt(events.startDate, new Date(now.getTime() + DIGEST_DAYS * 86_400_000))
          )
        )
        .orderBy(asc(events.startDate))
    );
    const item = ({ event, community, venue }: (typeof ahead)[number]): DigestEvent => ({
      community: community.name,
      name: event.name,
      when: shortWhen(event.startDate, event.timezone),
      place: event.mode === "online" ? "Online" : (venue ?? event.placeName ?? "Lugar a confirmar"),
      url: appUrl(eventPagePath(community.slug, event.slug)),
    });

    let queued = 0;
    for (const [userId, person] of people) {
      const mine = ahead.filter((row) => person.communities.has(row.event.communityId));
      if (mine.length === 0) continue;
      const token = yield* Effect.promise(() => unsubscribeToken(person.email.toLowerCase(), "followers"));
      yield* enqueueEmail({
        kind: KIND,
        to: person.email,
        priority: 7,
        dedupeKey: `${KIND}:${userId}:${week}`,
        headers: {
          "List-Unsubscribe": `<${appUrl(`/api/email/unsubscribe?t=${token}`)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        ...followerDigestEmail({
          events: mine.map(item),
          others: ahead
            .filter((row) => !person.communities.has(row.event.communityId))
            .slice(0, OTHERS)
            .map(item),
          unsubscribeUrl: appUrl(`/email/baja?t=${token}`),
          manageUrl: appUrl(`/comunidad/${mine[0].community.slug}`),
        }),
      });
      queued += 1;
    }

    return { due: true, queued };
  });
