import { and, count, eq, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";

import { shortWhen } from "../../community/time";
import { communities, communityFollowers, emailSuppressions, user, venues, type EventRow } from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, followerNewEventEmail } from "../../email/templates";
import { signLink } from "../../links";
import { eventPagePath } from "../../revalidate";
import { query } from "../db";

/** How many follow a community, and whether the caller does. */
export const state = (communityId: string, userId: string | null) =>
  Effect.gen(function* () {
    const [[total], mine] = yield* Effect.all([
      query((db) =>
        db.select({ value: count() }).from(communityFollowers).where(eq(communityFollowers.communityId, communityId))
      ),
      userId
        ? query((db) =>
            db
              .select({ userId: communityFollowers.userId })
              .from(communityFollowers)
              .where(and(eq(communityFollowers.communityId, communityId), eq(communityFollowers.userId, userId)))
          )
        : Effect.succeed([]),
    ]);

    return { followers: total?.value ?? 0, following: mine.length > 0 };
  });

export const follow = (communityId: string, userId: string) =>
  query((db) => db.insert(communityFollowers).values({ communityId, userId }).onConflictDoNothing()).pipe(
    Effect.andThen(state(communityId, userId))
  );

export const unfollow = (communityId: string, userId: string) =>
  query((db) =>
    db
      .delete(communityFollowers)
      .where(and(eq(communityFollowers.communityId, communityId), eq(communityFollowers.userId, userId)))
  ).pipe(Effect.andThen(state(communityId, userId)));

/**
 * A community published an event: each follower gets one email about it (the dedupe key makes a
 * second publish of the same event send nothing), unless they turned these emails off.
 */
export const notifyFollowers = (event: EventRow) =>
  Effect.gen(function* () {
    const [community] = yield* query((db) =>
      db
        .select({ name: communities.name, slug: communities.slug })
        .from(communities)
        .where(eq(communities.id, event.communityId))
    );
    if (!community) return 0;
    // ponytail: one insert per follower; batch them if a community reaches thousands
    const followers = yield* query((db) =>
      db
        .select({ id: user.id, email: user.email })
        .from(communityFollowers)
        .innerJoin(user, eq(user.id, communityFollowers.userId))
        .leftJoin(emailSuppressions, eq(emailSuppressions.email, sql`lower(${user.email})`))
        .where(and(eq(communityFollowers.communityId, event.communityId), isNull(emailSuppressions.email)))
    );
    if (followers.length === 0) return 0;

    const [venue] = event.venueId
      ? yield* query((db) =>
          db
            .select({ name: venues.name })
            .from(venues)
            .where(eq(venues.id, event.venueId ?? ""))
        )
      : [];
    const place = event.mode === "online" ? "Online" : (venue?.name ?? event.placeName ?? "Lugar a confirmar");
    const pageUrl = appUrl(eventPagePath(community.slug, event.slug));

    for (const follower of followers) {
      const token = yield* Effect.promise(() => signLink("unsubscribe", follower.email.toLowerCase()));
      yield* enqueueEmail({
        kind: "follower_new_event",
        to: follower.email,
        priority: 6,
        dedupeKey: `follower_new_event:${event.id}:${follower.id}`,
        headers: {
          "List-Unsubscribe": `<${appUrl(`/api/email/unsubscribe?t=${token}`)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        ...followerNewEventEmail({
          community: community.name,
          event: event.name,
          summary: event.summary,
          when: shortWhen(event.startDate),
          place,
          pageUrl,
          profileUrl: appUrl(`/comunidad/${community.slug}`),
          unsubscribeUrl: appUrl(`/email/baja?t=${token}`),
        }),
      });
    }

    return followers.length;
  });
