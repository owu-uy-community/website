import { and, asc, desc, eq, gt, isNotNull, lt } from "drizzle-orm";
import { Effect } from "effect";

import { dayKey } from "../../community/time";
import {
  communities,
  communityClaims,
  communityOutreach,
  emailDeliveries,
  events,
  user,
  venueContacts,
  venueRequests,
  venues,
  type OutreachReason,
} from "../../db/schema";
import { outreachEmail } from "../../email/community-templates";
import { enqueueEmail } from "../../email/outbox";
import { appUrl } from "../../email/templates";
import {
  activeAt,
  contactStale,
  DONE_DAYS,
  outreachItems,
  REQUEST_WAIT_HOURS,
  SNOOZE_DAYS,
} from "../../organizar/outreach";
import { query } from "../db";
import { Invalid, NotFound } from "../errors";
import { organizerEmails } from "../events/service";
import { calendarFacts, organizerActivity } from "../insights/service";
import { CurrentUser } from "../services";
import type { OutreachQueue, OutreachRow } from "./schemas";

const DAY = 86_400_000;
const EMAIL_KIND = "community_outreach";
/** Most urgent first: a community going quiet before one waiting on a host */
const URGENCY: Record<OutreachReason, number> = {
  dormida: 0,
  "en-riesgo": 1,
  "pedido-sin-respuesta": 2,
  "contacto-viejo": 3,
  "un-organizador": 4,
};

/**
 * The communities that need a hand, one row per reason, minus what staff marked done or snoozed
 * lately. Paused communities stay out until their return date. Plus the claims waiting for staff.
 */
export const queue = Effect.gen(function* () {
  const now = Date.now();
  const yearAgo = new Date(now - 365 * DAY);
  const [list, calendar, team, used, asked, contacts, waiting, handled, claims, emailed, log] = yield* Effect.all([
    query((db) =>
      db
        .select({
          id: communities.id,
          slug: communities.slug,
          name: communities.name,
          status: communities.status,
          pausedUntil: communities.pausedUntil,
          createdAt: communities.createdAt,
        })
        .from(communities)
        .where(eq(communities.isActive, true))
        .orderBy(asc(communities.name))
    ),
    calendarFacts(null),
    organizerActivity(null),
    // The spaces each community used or asked in the last year: their contacts are its contacts
    query((db) =>
      db
        .selectDistinct({ communityId: events.communityId, venueId: events.venueId })
        .from(events)
        .where(and(isNotNull(events.venueId), eq(events.status, "published"), gt(events.startDate, yearAgo)))
    ),
    query((db) =>
      db
        .selectDistinct({ communityId: venueRequests.communityId, venueId: venueRequests.venueId })
        .from(venueRequests)
        .where(gt(venueRequests.createdAt, yearAgo))
    ),
    // ponytail: staleness by hand here (outreach.contactStale); swap for venue-contacts' isStale once it lands
    query((db) =>
      db
        .select({
          venueId: venueContacts.venueId,
          venue: venues.name,
          leftAt: venueContacts.leftAt,
          bouncedAt: venueContacts.bouncedAt,
          lastConfirmedAt: venueContacts.lastConfirmedAt,
          consentAt: venueContacts.consentAt,
        })
        .from(venueContacts)
        .innerJoin(venues, eq(venues.id, venueContacts.venueId))
        .where(eq(venues.status, "active"))
    ),
    query((db) =>
      db
        .select({ communityId: venueRequests.communityId, venue: venues.name, since: venueRequests.createdAt })
        .from(venueRequests)
        .innerJoin(venues, eq(venues.id, venueRequests.venueId))
        .where(
          and(
            eq(venueRequests.status, "pending"),
            lt(venueRequests.createdAt, new Date(now - REQUEST_WAIT_HOURS * 3_600_000))
          )
        )
    ),
    query((db) =>
      db
        .select({ communityId: communityOutreach.communityId, reason: communityOutreach.reason })
        .from(communityOutreach)
        .where(gt(communityOutreach.snoozedUntil, new Date(now)))
    ),
    query((db) =>
      db
        .select({
          id: communityClaims.id,
          community: { id: communities.id, slug: communities.slug, name: communities.name },
          person: user.name,
          createdAt: communityClaims.createdAt,
        })
        .from(communityClaims)
        .innerJoin(communities, eq(communities.id, communityClaims.communityId))
        .innerJoin(user, eq(user.id, communityClaims.userId))
        .where(eq(communityClaims.status, "pending"))
        .orderBy(asc(communityClaims.createdAt))
    ),
    query((db) =>
      db
        .select({ dedupeKey: emailDeliveries.dedupeKey, createdAt: emailDeliveries.createdAt })
        .from(emailDeliveries)
        .where(
          and(eq(emailDeliveries.kind, EMAIL_KIND), gt(emailDeliveries.createdAt, new Date(now - DONE_DAYS * DAY)))
        )
        .orderBy(desc(emailDeliveries.createdAt))
    ),
    query((db) =>
      db
        .select({
          id: communityOutreach.id,
          community: communities.name,
          reason: communityOutreach.reason,
          status: communityOutreach.status,
          by: user.name,
          at: communityOutreach.createdAt,
          until: communityOutreach.snoozedUntil,
        })
        .from(communityOutreach)
        .innerJoin(communities, eq(communities.id, communityOutreach.communityId))
        .leftJoin(user, eq(user.id, communityOutreach.byId))
        .orderBy(desc(communityOutreach.createdAt))
        .limit(15)
    ),
  ]);

  const staleVenues = new Map<string, { venue: string; since: Date | null }>();
  for (const contact of contacts) {
    if (!contactStale(contact, now)) continue;
    staleVenues.set(contact.venueId, {
      venue: contact.venue,
      since: contact.leftAt ?? contact.bouncedAt ?? contact.lastConfirmedAt ?? contact.consentAt,
    });
  }
  const rows: OutreachRow[] = list.flatMap((community) => {
    const people = team.filter((row) => row.communityId === community.id);
    const venueIds = new Set(
      [...used, ...asked].filter((row) => row.communityId === community.id).map((row) => row.venueId)
    );
    const items = outreachItems(
      {
        ...community,
        ...calendar(community.id),
        activeOrganizers: people.filter((row) => activeAt(row.lastActiveAt, now)).length,
        staleContacts: [...venueIds].flatMap((venueId) => (venueId && staleVenues.get(venueId)) || []),
        waitingRequests: waiting.filter((row) => row.communityId === community.id),
      },
      now
    );

    return items
      .filter((item) => !handled.some((row) => row.communityId === community.id && row.reason === item.reason))
      .map((item) => ({
        community: { id: community.id, slug: community.slug, name: community.name },
        ...item,
        team: people.map((row) => ({ name: row.name, role: row.role, active: activeAt(row.lastActiveAt, now) })),
        emailedAt:
          emailed
            .find((row) => row.dedupeKey.startsWith(`${EMAIL_KIND}:${community.id}:${item.reason}:`))
            ?.createdAt.toISOString() ?? null,
      }));
  });

  return {
    rows: rows.toSorted(
      (a, b) =>
        URGENCY[a.reason] - URGENCY[b.reason] ||
        (a.since ?? "9").localeCompare(b.since ?? "9") ||
        a.community.name.localeCompare(b.community.name)
    ),
    claims: claims.map((claim) => ({ ...claim, createdAt: claim.createdAt.toISOString() })),
    log: log.map((row) => ({ ...row, at: row.at.toISOString(), until: row.until?.toISOString() ?? null })),
  } satisfies OutreachQueue;
});

const communityOf = (communityId: string) =>
  query((db) =>
    db
      .select({ id: communities.id, slug: communities.slug, name: communities.name })
      .from(communities)
      .where(eq(communities.id, communityId))
  ).pipe(
    Effect.flatMap(([row]) =>
      row ? Effect.succeed(row) : Effect.fail(new NotFound({ entity: "community", message: "Esa comunidad no existe" }))
    )
  );

/**
 * The templated email for a reason, to the community's editors and up, signed by the staff member
 * (replies go to them). Once a day per reason and person: a second click sends nothing new.
 */
export const email = (input: { communityId: string; reason: OutreachReason }) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const community = yield* communityOf(input.communityId);
    const row = (yield* queue).rows.find(
      (item) => item.community.id === input.communityId && item.reason === input.reason
    );
    if (!row)
      return yield* new Invalid({ message: "Esa comunidad ya no necesita una mano por esto: recargá la lista" });
    const [recipients, [staff]] = yield* Effect.all([
      organizerEmails(input.communityId),
      query((db) => db.select({ email: user.email }).from(user).where(eq(user.id, me.id))),
    ]);
    if (recipients.length === 0) {
      return yield* new Invalid({
        message: "La comunidad no tiene a nadie con rol de editor o más: escribile por Slack",
      });
    }
    const day = dayKey(new Date());
    const message = outreachEmail({
      community: community.name,
      reason: input.reason,
      why: row.why,
      staffName: me.name,
      panelUrl: appUrl(`/organizar/panel/${community.slug}`),
    });
    for (const to of recipients) {
      yield* enqueueEmail({
        kind: EMAIL_KIND,
        to,
        priority: 6,
        dedupeKey: `${EMAIL_KIND}:${input.communityId}:${input.reason}:${day}:${to.toLowerCase()}`,
        headers: staff ? { "Reply-To": staff.email } : {},
        ...message,
      });
    }

    return { sent: recipients.length };
  });

/** "Hecho" (off the queue for 90 days) or "Posponer" (30), with who did it: the queue's log. */
export const mark = (input: {
  communityId: string;
  reason: OutreachReason;
  status: "done" | "snoozed";
  note: string;
}) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* communityOf(input.communityId);
    const days = input.status === "done" ? DONE_DAYS : SNOOZE_DAYS;
    const [row] = yield* query((db) =>
      db
        .insert(communityOutreach)
        .values({ ...input, byId: me.id, snoozedUntil: new Date(Date.now() + days * DAY) })
        .returning({ id: communityOutreach.id, until: communityOutreach.snoozedUntil })
    );

    return { id: row.id, until: row.until?.toISOString() ?? null };
  });

/** Take back a "Hecho" or "Posponer": the row is back on the queue. */
export const undo = (id: string) =>
  query((db) =>
    db.delete(communityOutreach).where(eq(communityOutreach.id, id)).returning({ id: communityOutreach.id })
  ).pipe(
    Effect.flatMap(([row]) =>
      row
        ? Effect.succeed({ ok: true as const })
        : Effect.fail(new NotFound({ entity: "outreach", message: "Ya no está" }))
    )
  );
