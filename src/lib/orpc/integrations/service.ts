import { createHash, randomBytes } from "node:crypto";

import { decrypt, encrypt } from "@orpc/server/helpers";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { Effect, Result } from "effect";
import * as z from "zod";

import { EVENTBRITE_API_URL } from "app/lib/constants";

import {
  attendees,
  attendeeSync,
  communities,
  eventPublications,
  events,
  integrationConnections,
  venues,
  type EventPublicationRow,
  type EventRow,
  type IntegrationConnectionRow,
  type PublicationIds,
  type VenueRow,
} from "../../db/schema";
import { appUrl, esc } from "../../email/templates";
import { eventPagePath, refreshPage } from "../../revalidate";
import { query, transaction } from "../db";
import { Invalid, UpstreamFailed } from "../errors";
import { eventbriteTime } from "../eventbrite/service";
import { memberRole, ROLE_RANK } from "../scope";
import { CommunityScope, liveServices } from "../services";
import type { EventIntegration, Integrations } from "./schemas";

/**
 * A community's own Eventbrite account: connected by an admin (OAuth), it publishes the events
 * whose sign-up is on Eventbrite and mirrors their attendees with the community's token.
 */

const OAUTH = process.env.EVENTBRITE_OAUTH_URL ?? "https://www.eventbrite.com/oauth";

const secret = () => {
  const value = process.env.INTEGRATIONS_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("INTEGRATIONS_SECRET (or BETTER_AUTH_SECRET) must be set");

  return value;
};

/** The OAuth app, when this server has one. */
export const eventbriteApp = () => {
  const clientId = process.env.EVENTBRITE_CLIENT_ID;
  const clientSecret = process.env.EVENTBRITE_CLIENT_SECRET;

  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export const callbackUrl = () => appUrl("/api/integrations/eventbrite/callback");

export const authorizeUrl = (clientId: string, state: string) =>
  `${OAUTH}/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: callbackUrl(), state })}`;

// ---------------------------------------------------------------------------
// Talking to Eventbrite with a community's token
// ---------------------------------------------------------------------------

const statusOf = (error: { cause?: unknown }) => (error.cause as { status?: number } | undefined)?.status ?? 0;

const failure = (cause: unknown) =>
  new UpstreamFailed({
    service: "Eventbrite",
    message: cause instanceof Error ? cause.message : "Eventbrite no responde",
    cause,
  });

/** One call to Eventbrite's API; on failure the HTTP status rides along in the cause. */
const api = <T = Record<string, unknown>>(
  token: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Effect.Effect<T, UpstreamFailed> =>
  Effect.tryPromise({
    try: async (signal) => {
      const init: RequestInit = {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      };
      if (body) init.body = JSON.stringify(body);
      const response = await fetch(`${EVENTBRITE_API_URL}${path}`, init);
      const json = (await response.json().catch(() => ({}))) as { error_description?: string };
      if (!response.ok) {
        throw Object.assign(new Error(json.error_description || `Eventbrite respondió ${response.status}`), {
          status: response.status,
        });
      }

      return json as T;
    },
    catch: failure,
  });

const TokenSchema = z.object({ access_token: z.string().min(1) });

/** Swap the code Eventbrite sent back for the account's token (they don't expire). */
const exchange = (app: { clientId: string; clientSecret: string }, code: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${OAUTH}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: app.clientId,
          client_secret: app.clientSecret,
          code,
          redirect_uri: callbackUrl(),
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error(`Eventbrite no aceptó la autorización (${response.status})`);

      return TokenSchema.parse(await response.json()).access_token;
    },
    catch: failure,
  });

const tokenOf = (connection: Pick<IntegrationConnectionRow, "token">) =>
  Effect.promise(() => decrypt(connection.token, secret())).pipe(
    Effect.flatMap((token) =>
      token ? Effect.succeed(token) : Effect.fail(failure(new Error("No pudimos leer el token guardado")))
    )
  );

// ---------------------------------------------------------------------------
// Connecting and disconnecting
// ---------------------------------------------------------------------------

const WEBHOOK_ACTIONS = "order.placed,attendee.updated,attendee.checked_in";

const connectionOf = (communityId: string) =>
  query((db) =>
    db
      .select()
      .from(integrationConnections)
      .where(
        and(eq(integrationConnections.communityId, communityId), eq(integrationConnections.platform, "eventbrite"))
      )
  ).pipe(Effect.map(([row]) => row ?? null));

/**
 * Finish the OAuth dance for a community: the token, its first organization (where events get
 * made), a webhook to a secret path. Connecting again replaces the account and retries what failed.
 */
export const connect = (input: { communityId: string; userId: string; code: string }) =>
  Effect.gen(function* () {
    const app = eventbriteApp();
    if (!app) return yield* new Invalid({ message: "Eventbrite no está configurado en este servidor" });
    const token = yield* exchange(app, input.code);
    const { organizations } = yield* api<{ organizations: { id: string; name: string }[] }>(
      token,
      "GET",
      "/users/me/organizations/"
    );
    const [organization] = organizations;
    if (!organization) {
      return yield* new Invalid({
        message: "Tu cuenta de Eventbrite no tiene ninguna organización donde crear eventos",
      });
    }

    const previous = yield* connectionOf(input.communityId);
    if (previous?.webhookId) yield* dropWebhook(previous);
    const webhookKey = randomBytes(24).toString("base64url");
    // Without a webhook (an http:// dev server, Eventbrite down) the 30 s read keeps the list current
    const hook = yield* Effect.result(
      api<{ id: string }>(token, "POST", `/organizations/${organization.id}/webhooks/`, {
        endpoint_url: appUrl(`/api/eventbrite/hooks/${webhookKey}`),
        actions: WEBHOOK_ACTIONS,
      })
    );
    const values = {
      token: yield* Effect.promise(() => encrypt(token, secret())),
      organizationId: organization.id,
      accountName: organization.name,
      webhookKey,
      webhookId: Result.isSuccess(hook) ? hook.success.id : null,
      status: "active" as const,
      error: null,
      connectedById: input.userId,
    };
    const [connection] = yield* query((db) =>
      db
        .insert(integrationConnections)
        .values({ communityId: input.communityId, platform: "eventbrite", ...values })
        .onConflictDoUpdate({
          target: [integrationConnections.communityId, integrationConnections.platform],
          set: values,
        })
        .returning()
    );
    yield* query((db) =>
      db
        .update(eventPublications)
        .set({ status: "pending", attempts: 0, error: null, nextAttemptAt: new Date() })
        .where(and(eq(eventPublications.connectionId, connection.id), eq(eventPublications.status, "failed")))
    );
    pushQueued = true;

    return { accountName: organization.name };
  });

/** Best effort: a webhook Eventbrite already forgot isn't worth failing over. */
const dropWebhook = (connection: IntegrationConnectionRow) =>
  tokenOf(connection).pipe(
    Effect.flatMap((token) => api(token, "DELETE", `/webhooks/${connection.webhookId}/`)),
    Effect.ignore
  );

/**
 * Disconnect: the token and webhook go, and so does everything mirrored from the account (its
 * terms ask for it): the attendee rows read from Eventbrite and the events' link to it. OWU's own
 * check-ins of those people go with their rows.
 */
export const disconnect = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const connection = yield* connectionOf(communityId);
  if (!connection) return { events: 0 };
  if (connection.webhookId) yield* dropWebhook(connection);

  const linked = (yield* query((db) =>
    db
      .select({ eventId: eventPublications.eventId })
      .from(eventPublications)
      .where(eq(eventPublications.connectionId, connection.id))
  )).map((row) => row.eventId);

  yield* transaction(
    Effect.gen(function* () {
      if (linked.length > 0) {
        yield* query((db) =>
          db.delete(attendees).where(and(inArray(attendees.eventId, linked), eq(attendees.source, "eventbrite")))
        );
        yield* query((db) => db.delete(attendeeSync).where(inArray(attendeeSync.eventId, linked)));
        yield* query((db) =>
          db
            .update(events)
            .set({ eventbriteEventId: null, updatedAt: sql`${events.updatedAt}` })
            .where(inArray(events.id, linked))
        );
      }
      yield* query((db) => db.delete(integrationConnections).where(eq(integrationConnections.id, connection.id)));
    })
  );

  return { events: linked.length };
});

export const list = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const connection = yield* connectionOf(communityId);

  return {
    configured: eventbriteApp() !== null,
    eventbrite: connection
      ? {
          status: connection.status,
          accountName: connection.accountName,
          error: connection.error,
          webhook: connection.webhookId !== null,
          connectedAt: connection.updatedAt.toISOString(),
        }
      : null,
  } satisfies Integrations;
});

/** The account a webhook's secret path belongs to. */
export const connectionByWebhookKey = (key: string) =>
  Effect.gen(function* () {
    const [connection] = yield* query((db) =>
      db.select().from(integrationConnections).where(eq(integrationConnections.webhookKey, key))
    );
    if (!connection || connection.status !== "active") return null;

    return { communityId: connection.communityId, token: yield* tokenOf(connection) };
  });

/** The token to read an event's attendees with: its community's account, if it was published there. */
export const tokenForEvent = (eventId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ connection: integrationConnections })
        .from(eventPublications)
        .innerJoin(integrationConnections, eq(integrationConnections.id, eventPublications.connectionId))
        .where(and(eq(eventPublications.eventId, eventId), eq(integrationConnections.status, "active")))
    );

    return row ? yield* tokenOf(row.connection) : null;
  });

// ---------------------------------------------------------------------------
// Publishing: what the event should look like on Eventbrite, pushed when it changes
// ---------------------------------------------------------------------------

/** Set when something was queued in this instance: the fast path pushes it right after the response. */
let pushQueued = false;

/** An edit waits a minute (autosave sends many); publishing, cancelling and retrying go now. */
const EDIT_DELAY_MS = 60_000;

/**
 * Queue a push for an event whose sign-up is on Eventbrite. Publishing one needs the community's
 * account (`required`); an edit after disconnecting just has nowhere to go.
 */
export const queuePush = (
  event: Pick<EventRow, "id" | "communityId" | "registration" | "status">,
  { now = false, required = false } = {}
) =>
  Effect.gen(function* () {
    if (event.registration !== "eventbrite" || event.status === "draft") return;
    const connection = yield* connectionOf(event.communityId);
    if (!connection || connection.status !== "active") {
      if (!required) return;
      return yield* new Invalid({
        message: connection
          ? "Eventbrite rechazó la conexión: reconectala en Integraciones antes de publicar"
          : "Conectá Eventbrite en Integraciones para publicar ahí",
      });
    }
    const due = { connectionId: connection.id, status: "pending" as const, attempts: 0, error: null };
    const nextAttemptAt = new Date(Date.now() + (now ? 0 : EDIT_DELAY_MS));
    yield* query((db) =>
      db
        .insert(eventPublications)
        .values({ eventId: event.id, platform: "eventbrite", nextAttemptAt, ...due })
        .onConflictDoUpdate({
          target: [eventPublications.eventId, eventPublications.platform],
          // An edit only schedules a push (most change nothing Eventbrite shows); the rest start over
          set: now ? { ...due, nextAttemptAt } : { connectionId: connection.id, nextAttemptAt },
        })
    );
    if (now) pushQueued = true;
  });

/** "Reintentar": push again now, with a fresh set of attempts. */
export const retry = (eventId: string) =>
  query((db) =>
    db
      .update(eventPublications)
      .set({ status: "pending", attempts: 0, error: null, nextAttemptAt: new Date() })
      .where(eq(eventPublications.eventId, eventId))
      .returning({ id: eventPublications.id })
  ).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        pushQueued = true;
      })
    ),
    Effect.map((rows) => ({ queued: rows.length > 0 }))
  );

export const publicationOf = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const connection = yield* connectionOf(communityId);
    const [publication] = yield* query((db) =>
      db.select().from(eventPublications).where(eq(eventPublications.eventId, eventId))
    );

    return {
      connected: connection?.status === "active",
      publication: publication
        ? {
            status: publication.status,
            externalUrl: publication.externalUrl,
            error: publication.error,
            nextAttemptAt: publication.nextAttemptAt?.toISOString() ?? null,
            updatedAt: publication.updatedAt.toISOString(),
          }
        : null,
    } satisfies EventIntegration;
  });

type Desired = {
  name: string;
  summary: string;
  html: string;
  start: string;
  end: string;
  timezone: string;
  online: boolean;
  capacity: number;
  venue: { name: string; address: string; city: string } | null;
  cancelled: boolean;
};

/** The event as Eventbrite should show it. Its hash decides whether there's anything to push. */
export function desiredOf(event: EventRow, venue: VenueRow | null, pageUrl: string): Desired {
  const paragraphs = (event.description ?? event.summary ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${esc(block).replaceAll("\n", "<br>")}</p>`);
  const place = venue
    ? { name: venue.name, address: venue.address, city: venue.city }
    : event.placeName
      ? { name: event.placeName, address: event.placeAddress ?? "", city: "Montevideo" }
      : null;

  return {
    name: event.name,
    summary: event.summary ?? "",
    html: [...paragraphs, `<p>Más info en OWU: <a href="${esc(pageUrl)}">${esc(pageUrl)}</a></p>`].join(""),
    start: eventbriteTime(event.startDate),
    end: eventbriteTime(event.endDate),
    timezone: event.timezone,
    online: event.mode === "online",
    // ponytail: the wizard requires a cupo for Eventbrite; 100 only covers one removed after publishing
    capacity: event.capacity ?? 100,
    venue: event.mode === "online" ? null : place,
    cancelled: event.status === "cancelled",
  };
}

const hashOf = (desired: Desired) => createHash("sha256").update(JSON.stringify(desired)).digest("hex");

type Target = {
  publication: EventPublicationRow;
  connection: IntegrationConnectionRow;
  event: EventRow;
  venue: VenueRow | null;
  communitySlug: string;
};

/**
 * Make Eventbrite match the event, step by step: venue → event → free ticket class → description →
 * publish. Each id is saved as soon as it exists, so a failure halfway resumes instead of
 * duplicating. A cancelled event is cancelled there; with orders Eventbrite refuses, so it's
 * renamed CANCELADO and its tickets hidden. Returns the hash pushed.
 */
const push = ({ publication, connection, event, venue, communitySlug }: Target) =>
  Effect.gen(function* () {
    const pageUrl = appUrl(eventPagePath(communitySlug, event.slug));
    const want = desiredOf(event, venue, pageUrl);
    const hash = hashOf(want);
    if (hash === publication.pushedHash) return hash;

    const token = yield* tokenOf(connection);
    const ids: PublicationIds = { ...publication.ids };
    let externalId = publication.externalId;
    const keep = (patch: Partial<EventPublicationRow> = {}) =>
      query((db) =>
        db
          .update(eventPublications)
          .set({ ids, ...patch })
          .where(eq(eventPublications.id, publication.id))
      );

    if (want.cancelled) {
      if (!externalId || ids.cancelled) return hash;
      const cancelled = yield* Effect.result(api(token, "POST", `/events/${externalId}/cancel/`));
      if (Result.isFailure(cancelled)) {
        if (statusOf(cancelled.failure) === 401) return yield* cancelled.failure;
        yield* api(token, "POST", `/events/${externalId}/`, {
          event: { name: { html: esc(`CANCELADO · ${want.name}`) } },
        });
        if (ids.ticketClassId) {
          yield* api(token, "POST", `/events/${externalId}/ticket_classes/${ids.ticketClassId}/`, {
            ticket_class: { hidden: true },
          });
        }
      }
      ids.cancelled = true;
      yield* keep();

      return hash;
    }

    if (want.venue) {
      const venueKey = `${want.venue.name}|${want.venue.address}`;
      if (ids.venueKey !== venueKey) {
        const created = yield* api<{ id: string }>(
          token,
          "POST",
          `/organizations/${connection.organizationId}/venues/`,
          {
            venue: {
              name: want.venue.name,
              address: { address_1: want.venue.address || want.venue.name, city: want.venue.city, country: "UY" },
            },
          }
        );
        ids.venueId = created.id;
        ids.venueKey = venueKey;
        yield* keep();
      }
    }

    const body = {
      event: {
        name: { html: esc(want.name) },
        summary: want.summary,
        start: { timezone: want.timezone, utc: want.start },
        end: { timezone: want.timezone, utc: want.end },
        currency: "USD",
        online_event: want.online,
        listed: true,
        capacity: want.capacity,
        ...(want.venue && ids.venueId ? { venue_id: ids.venueId } : {}),
      },
    };
    if (externalId) {
      yield* api(token, "POST", `/events/${externalId}/`, body);
    } else {
      const created = yield* api<{ id: string; url: string }>(
        token,
        "POST",
        `/organizations/${connection.organizationId}/events/`,
        body
      );
      externalId = created.id;
      yield* keep({ externalId, externalUrl: created.url });
      // The mirror, the scanner and the public page's "Inscribirme" follow the event from now on
      yield* query((db) =>
        db
          .update(events)
          .set({ eventbriteEventId: created.id, registrationUrl: created.url, updatedAt: sql`${events.updatedAt}` })
          .where(eq(events.id, event.id))
      );
    }

    if (ids.ticketClassId) {
      yield* api(token, "POST", `/events/${externalId}/ticket_classes/${ids.ticketClassId}/`, {
        ticket_class: { quantity_total: want.capacity },
      });
    } else {
      const ticket = yield* api<{ id: string }>(token, "POST", `/events/${externalId}/ticket_classes/`, {
        ticket_class: { name: "General", free: true, quantity_total: want.capacity },
      });
      ids.ticketClassId = ticket.id;
      yield* keep();
    }

    // Structured content is versioned and insert-only: every change is the whole page, one version up
    const content = yield* api<{ page_version_number?: string | number }>(
      token,
      "GET",
      `/events/${externalId}/structured_content/`
    );
    yield* api(
      token,
      "POST",
      `/events/${externalId}/structured_content/${Number(content.page_version_number ?? 0) + 1}/`,
      {
        modules: [{ type: "text", data: { body: { type: "text", text: want.html, alignment: "left" } } }],
        publish: true,
        purpose: "listing",
      }
    );

    if (!ids.published) {
      yield* api(token, "POST", `/events/${externalId}/publish/`);
      ids.published = true;
      yield* keep();
    }

    return hash;
  });

/** Minutes between attempts; after the last one the publication waits for "Reintentar". */
const BACKOFF_MIN = [1, 5, 30, 120];
/** A claimed push holds its row this long: if the instance dies, the next tick takes it over. */
const LEASE_MS = 5 * 60_000;

const settle = (target: Target, lease: Date) =>
  Effect.gen(function* () {
    const { publication } = target;
    // An edit made while pushing moved `nextAttemptAt` off the lease: leave it queued
    const clear = sql`case when ${eventPublications.nextAttemptAt} = ${lease} then null else ${eventPublications.nextAttemptAt} end`;
    const outcome = yield* Effect.result(push(target));
    if (Result.isSuccess(outcome)) {
      yield* query((db) =>
        db
          .update(eventPublications)
          .set({ status: "published", pushedHash: outcome.success, attempts: 0, error: null, nextAttemptAt: clear })
          .where(eq(eventPublications.id, publication.id))
      );
      if (!publication.externalId) refreshPage(eventPagePath(target.communitySlug, target.event.slug));

      return "pushed" as const;
    }

    const error = outcome.failure;
    if (statusOf(error) === 401) {
      const message = "Eventbrite rechazó la conexión: reconectala en Integraciones";
      yield* query((db) =>
        db
          .update(integrationConnections)
          .set({ status: "error", error: message })
          .where(eq(integrationConnections.id, target.connection.id))
      );
      yield* query((db) =>
        db
          .update(eventPublications)
          .set({ status: "failed", error: message, nextAttemptAt: clear })
          .where(eq(eventPublications.id, publication.id))
      );

      return "failed" as const;
    }

    const attempts = publication.attempts + 1;
    const giveUp = attempts >= BACKOFF_MIN.length;
    yield* query((db) =>
      db
        .update(eventPublications)
        .set({
          status: giveUp ? "failed" : "pending",
          attempts,
          error: error.message.slice(0, 500),
          nextAttemptAt: giveUp ? null : new Date(Date.now() + BACKOFF_MIN[attempts - 1] * 60_000),
        })
        .where(eq(eventPublications.id, publication.id))
    );

    return giveUp ? ("failed" as const) : ("retry" as const);
  });

/**
 * Push every publication that's due, claiming each with a lease (FOR UPDATE SKIP LOCKED), so the
 * tick, the cron and the fast path never push the same one twice at once.
 */
export const pushDue = ({ deadline }: { deadline: number }) =>
  Effect.gen(function* () {
    const tally = { pushed: 0, retry: 0, failed: 0 };
    while (Date.now() < deadline) {
      const lease = new Date(Date.now() + LEASE_MS);
      const claimed = yield* query((db) => {
        const due = db
          .select({ id: eventPublications.id })
          .from(eventPublications)
          .where(lte(eventPublications.nextAttemptAt, new Date()))
          .limit(10)
          .for("update", { skipLocked: true });

        return db
          .update(eventPublications)
          .set({ nextAttemptAt: lease })
          .where(inArray(eventPublications.id, due))
          .returning({ id: eventPublications.id });
      });
      if (claimed.length === 0) break;

      const targets = yield* query((db) =>
        db
          .select({
            publication: eventPublications,
            connection: integrationConnections,
            event: events,
            venue: venues,
            communitySlug: communities.slug,
          })
          .from(eventPublications)
          .innerJoin(integrationConnections, eq(integrationConnections.id, eventPublications.connectionId))
          .innerJoin(events, eq(events.id, eventPublications.eventId))
          .innerJoin(communities, eq(communities.id, events.communityId))
          .leftJoin(venues, eq(venues.id, events.venueId))
          .where(
            inArray(
              eventPublications.id,
              claimed.map((row) => row.id)
            )
          )
      );
      for (const target of targets) tally[yield* settle(target, lease)] += 1;
    }

    return tally;
  });

/** The fast path: a publish or a retry reaches Eventbrite right after the response. */
export async function pushSoon() {
  if (!pushQueued) return;
  pushQueued = false;
  await Effect.runPromiseWith(liveServices)(pushDue({ deadline: Date.now() + 20_000 })).catch((error: unknown) =>
    console.error("[eventbrite] fast push failed", error)
  );
}

/** The community's slug when the user may connect its accounts (its admins and site staff), else null. */
export const adminCommunity = (communityId: string, user: { id: string; role?: string | null }) =>
  Effect.gen(function* () {
    const [community] = yield* query((db) =>
      db.select({ slug: communities.slug }).from(communities).where(eq(communities.id, communityId))
    );
    if (!community) return null;
    if (user.role === "admin") return community.slug;
    const role = yield* memberRole(communityId, user.id);

    return role && ROLE_RANK[role] >= ROLE_RANK.admin ? community.slug : null;
  });
