import { Effect } from "effect";
import * as z from "zod";

import { EVENTBRITE_API_URL } from "app/lib/constants";

import { NotFound, UpstreamFailed } from "../errors";
import { EventbriteEventSchema } from "./schemas";

/**
 * Linking an event to Eventbrite: look the id up before it is saved, so a typo shows up in the
 * settings page instead of as an empty attendee list on the day.
 */

export const VerifyEventbriteSchema = z.object({
  eventbriteEventId: z.string().regex(/^\d{1,20}$/, "El número de evento de Eventbrite son solo dígitos"),
});

export const EventbriteVerificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Local start on Eventbrite's own clock ("2026-11-07T14:30:00"). */
  start: z.string(),
  status: z.string(),
  /** Active tickets (attending): cancelled and refunded ones don't count. */
  tickets: z.number(),
});

export type EventbriteVerification = z.infer<typeof EventbriteVerificationSchema>;

/** One attendee per page is enough: the total comes in the pagination. */
const AttendeeCountSchema = z.object({ pagination: z.object({ object_count: z.number() }) });

/** GET from Eventbrite, telling "no such event" and "no access" apart from an outage. */
const lookup = <S extends z.ZodType>(
  url: string,
  schema: S,
  key: string
): Effect.Effect<z.output<S>, NotFound | UpstreamFailed> =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      return {
        status: response.status,
        body: response.ok ? (schema.parse(await response.json()) as z.output<S>) : null,
      };
    },
    catch: (cause) => new UpstreamFailed({ service: "Eventbrite", message: "No pudimos hablar con Eventbrite", cause }),
  }).pipe(
    Effect.flatMap(({ status, body }): Effect.Effect<z.output<S>, NotFound | UpstreamFailed> => {
      if (body !== null) return Effect.succeed(body);
      if (status === 404) {
        return Effect.fail(
          new NotFound({ entity: "eventbrite_event", message: "Eventbrite no tiene ningún evento con ese número" })
        );
      }

      return Effect.fail(
        new UpstreamFailed({
          service: "Eventbrite",
          message:
            status === 401
              ? "Eventbrite rechazó la clave de la API (EVENTBRITE_API_KEY)"
              : // A valid key whose account isn't in the event's organization: the event reads, its attendees don't.
                status === 403
                ? "La clave de Eventbrite es de una cuenta que no está en la organización de ese evento: no puede ver sus asistentes"
                : `Eventbrite respondió ${status}; probá de nuevo en un rato`,
        })
      );
    })
  );

/** The event's name and active tickets. The key is read at call time, so it follows the server's config. */
export const verifyEvent = (
  eventbriteEventId: string
): Effect.Effect<EventbriteVerification, UpstreamFailed | NotFound> =>
  Effect.gen(function* () {
    const key = process.env.EVENTBRITE_API_KEY;
    if (!key) {
      return yield* new UpstreamFailed({
        service: "Eventbrite",
        message: "Eventbrite no está configurado en este servidor: falta EVENTBRITE_API_KEY",
      });
    }
    const base = `${EVENTBRITE_API_URL}/events/${eventbriteEventId}`;
    const [event, attendees] = yield* Effect.all(
      [
        lookup(`${base}/`, EventbriteEventSchema, key),
        lookup(`${base}/attendees/?status=attending`, AttendeeCountSchema, key),
      ],
      { concurrency: "unbounded" }
    );

    return {
      id: event.id,
      name: event.name.text,
      start: event.start.local,
      status: event.status,
      tickets: attendees.pagination.object_count,
    };
  });
