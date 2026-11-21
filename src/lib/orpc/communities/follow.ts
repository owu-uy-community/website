import { and, count, eq, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";

import { shortWhen } from "../../community/time";
import { communities, communityFollowers, emailSuppressions, user, venues, type EventRow } from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, followerNewEventEmail } from "../../email/templates";
import { unsubscribeToken } from "../../links";
import { eventPagePath } from "../../revalidate";
import { query } from "../db";

export type Digest = "each" | "weekly";

/** How many follow a community, and whether (and how) the caller does. */
export const state = (communityId: string, userId: string | null) =>
  Effect.gen(function* () {
    const [[total], mine] = yield* Effect.all([
      query((db) =>
        db.select({ value: count() }).from(communityFollowers).where(eq(communityFollowers.communityId, communityId))
      ),
      userId
        ? query((db) =>
            db
              .select({ digest: communityFollowers.digest })
              .from(communityFollowers)
              .where(and(eq(communityFollowers.communityId, communityId), eq(communityFollowers.userId, userId)))
          )
        : Effect.succeed([]),
    ]);

    return { followers: total?.value ?? 0, following: mine.length > 0, digest: mine[0]?.digest ?? null };
  });

/** Follow, or change how: an email per event (default) or the weekly digest. */
export const follow = (communityId: string, userId: string, digest?: Digest) =>
  query((db) => {
    const insert = db.insert(communityFollowers).values({ communityId, userId, ...(digest ? { digest } : {}) });

    return digest
      ? insert.onConflictDoUpdate({
          target: [communityFollowers.communityId, communityFollowers.userId],
          set: { digest },
        })
      : insert.onConflictDoNothing();
  }).pipe(Effect.andThen(state(communityId, userId)));

export const unfollow = (communityId: string, userId: string) =>
  query((db) =>
    db
      .delete(communityFollowers)
      .where(and(eq(communityFollowers.communityId, communityId), eq(communityFollowers.userId, userId)))
  ).pipe(Effect.andThen(state(communityId, userId)));

/**
 * A community published an event: each follower gets one email about it (the dedupe key makes a
 * second publish of the same event send nothing), unless they turned these emails off or get the
 * weekly digest instead.
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
        .leftJoin(
          emailSuppressions,
          and(eq(emailSuppressions.email, sql`lower(${user.email})`), eq(emailSuppressions.scope, "followers"))
        )
        .where(
          and(
            eq(communityFollowers.communityId, event.communityId),
            eq(communityFollowers.digest, "each"),
            isNull(emailSuppressions.email)
          )
        )
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
      const token = yield* Effect.promise(() => unsubscribeToken(follower.email.toLowerCase(), "followers"));
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
