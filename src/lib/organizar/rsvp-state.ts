import { dateParts, dayKey } from "../community/time";
import type { PublicEvent } from "../orpc/events/schemas";
import type { MyRsvp } from "../orpc/rsvps/schemas";

type StateEvent = Pick<
  PublicEvent,
  | "status"
  | "startDate"
  | "endDate"
  | "registration"
  | "registrationUrl"
  | "capacity"
  | "taken"
  | "waitlist"
  | "approval"
  | "rsvpClosesAt"
>;

/**
 * Where someone stands with an event's sign-up, as the RSVP card and the phone bar show it.
 * `cancelado` is their own place given back (they left, or an offer lapsed): they can sign up again.
 */
export type RsvpState =
  | { kind: "abierto" | "lleno-espera" | "cancelado"; cta: string; left: number | null }
  | { kind: "oferta"; until: string }
  | { kind: "espera"; position: number | null }
  | { kind: "externo"; url: string | null; eventbrite: boolean }
  | {
      kind:
        | "anotado"
        | "pendiente"
        | "rechazado"
        | "lleno"
        | "cerrado"
        | "en-curso"
        | "pasado"
        | "evento-cancelado"
        | "libre";
    };

const WAITLIST_CTA = "Anotarme en la lista de espera";

/** The card's state from the event, the viewer's own RSVP (null if none or signed out) and the time. */
export function rsvpState(
  event: StateEvent,
  rsvp: Pick<MyRsvp, "status" | "offerExpiresAt" | "position"> | null,
  now: number
): RsvpState {
  if (event.status === "cancelled") return { kind: "evento-cancelado" };
  if (Date.parse(event.endDate) <= now) return { kind: "pasado" };

  // Their own place first: someone with a seat sees their ticket even once the doors open
  if (rsvp?.status === "attending") return { kind: "anotado" };
  if (rsvp?.status === "offered" && rsvp.offerExpiresAt && Date.parse(rsvp.offerExpiresAt) > now) {
    return { kind: "oferta", until: rsvp.offerExpiresAt };
  }
  if (rsvp?.status === "waitlisted") return { kind: "espera", position: rsvp.position };
  if (rsvp?.status === "pending") return { kind: "pendiente" };
  // A decline is the organizers' call: only they undo it, so no "Anotarme" here
  if (rsvp?.status === "declined") return { kind: "rechazado" };

  if (Date.parse(event.startDate) <= now) return { kind: "en-curso" };
  if (event.registration === "none") return { kind: "libre" };
  if (event.registration !== "owu") {
    return { kind: "externo", url: event.registrationUrl, eventbrite: event.registration === "eventbrite" };
  }
  if (event.rsvpClosesAt && Date.parse(event.rsvpClosesAt) <= now) return { kind: "cerrado" };

  const left = event.capacity === null ? null : Math.max(0, event.capacity - event.taken);
  // With approval every request waits for review, full or not
  const waits = !event.approval && left === 0;
  if (waits && !event.waitlist) return { kind: "lleno" };

  return {
    // Anything else they had is gone (they left, or an offer lapsed): they can sign up again
    kind: rsvp ? "cancelado" : waits ? "lleno-espera" : "abierto",
    cta: event.approval ? "Pedir lugar" : waits ? WAITLIST_CTA : "Anotarme",
    left,
  };
}

/** "antes de las 19:00" today, "antes del jue 12 nov a las 19:00" another day (Montevideo time). */
export function offerDeadline(until: string, now: number) {
  const parts = dateParts(until);

  return dayKey(until) === dayKey(new Date(now))
    ? `antes de las ${parts.time}`
    : `antes del ${parts.weekday} ${parts.day} ${parts.month} a las ${parts.time}`;
}

const seats = (left: number | null) =>
  left === null ? "Gratis" : left === 1 ? "Gratis · queda 1" : `Gratis · quedan ${left}`;

/** The phone bar: a line of where they stand ("Gratis · quedan 12") and the button that opens the card. */
export function rsvpBar(state: RsvpState, now: number): { text: string; action: string } {
  switch (state.kind) {
    case "abierto":
      return { text: seats(state.left), action: state.cta };
    case "lleno-espera":
      return { text: "Gratis · sin lugares", action: "Lista de espera" };
    case "cancelado":
      return { text: "Tu lugar se liberó", action: state.cta === WAITLIST_CTA ? "Lista de espera" : state.cta };
    case "anotado":
      return { text: "Estás anotado", action: "Mi entrada" };
    case "oferta":
      return { text: `Confirmá ${offerDeadline(state.until, now)}`, action: "Confirmar" };
    case "espera":
      return { text: state.position ? `En espera · puesto ${state.position}` : "En lista de espera", action: "Ver" };
    case "pendiente":
      return { text: "Esperando aprobación", action: "Ver" };
    case "rechazado":
      return { text: "No confirmaron tu inscripción", action: "Ver" };
    case "lleno":
      return { text: "Sin lugares", action: "Ver" };
    case "cerrado":
      return { text: "La inscripción cerró", action: "Ver" };
    case "en-curso":
      return { text: "Está pasando ahora", action: "Ver" };
    case "pasado":
      return { text: "Ya pasó", action: "Ver" };
    case "evento-cancelado":
      return { text: "Se canceló", action: "Ver" };
    case "libre":
      return { text: "Entrada libre", action: "Ver" };
    case "externo":
      return { text: state.eventbrite ? "Inscripción en Eventbrite" : "Inscripción externa", action: "Ver" };
  }
}
