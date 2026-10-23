import type { OutreachReason } from "../db/schema";
import { ACTIVE_ORGANIZER_DAYS, daysSince, healthOf, MIN_ORGANIZERS } from "./health";
import { plural } from "./words";

/**
 * The staff's outreach queue: why a community needs a hand, computed from its own data. Client-safe.
 */

/** A host contact nobody confirmed for this long (or bounced, or gone) needs re-checking. */
export const CONTACT_STALE_DAYS = 182;
/** A venue request unanswered this long gets a nudge. */
export const REQUEST_WAIT_HOURS = 72;
/** "Hecho" keeps a reason off the queue this long; if it's still true then, it comes back. */
export const DONE_DAYS = 90;
/** "Posponer" */
export const SNOOZE_DAYS = 30;

const DAY = 86_400_000;

export type CommunityFacts = {
  status: string;
  pausedUntil: string | null;
  createdAt: Date | string;
  /** The last published event that already ended */
  lastEventAt: Date | string | null;
  /** A published event ahead, or a live hold */
  hasUpcoming: boolean;
  activeOrganizers: number;
  /** Venues it used or asked, whose host contact went stale */
  staleContacts: { venue: string; since: Date | string | null }[];
  /** Its venue requests waiting longer than REQUEST_WAIT_HOURS */
  waitingRequests: { venue: string; since: Date | string }[];
};

export type OutreachItem = { reason: OutreachReason; since: string | null; why: string };

const iso = (value: Date | string | null) => (value === null ? null : new Date(value).toISOString());

/** Did they do something in the community recently enough to count as an active organizer? */
export const activeAt = (lastActiveAt: Date | string | null, now = Date.now()) =>
  lastActiveAt !== null && now - new Date(lastActiveAt).getTime() <= ACTIVE_ORGANIZER_DAYS * DAY;

/** Is a host contact stale: gone, bouncing, or not confirmed in 6 months (consent counts as one)? */
export const contactStale = (
  contact: { leftAt: Date | null; bouncedAt: Date | null; lastConfirmedAt: Date | null; consentAt: Date },
  now = Date.now()
) =>
  contact.leftAt !== null ||
  contact.bouncedAt !== null ||
  now - (contact.lastConfirmedAt ?? contact.consentAt).getTime() > CONTACT_STALE_DAYS * DAY;

/**
 * Why a community needs a hand now, most urgent first. A declared pause hides it until its date;
 * a community that never had an event counts its quiet days from when it joined.
 */
export function outreachItems(facts: CommunityFacts, now = Date.now()): OutreachItem[] {
  const lastEventAt = facts.lastEventAt ?? facts.createdAt;
  const health = healthOf({ ...facts, lastEventAt }, now);
  if (health === "en-pausa") return [];

  const items: OutreachItem[] = [];
  const quiet = daysSince(lastEventAt, now);
  const since = facts.lastEventAt
    ? `Hace ${quiet} días del último evento`
    : `Sin eventos desde que se sumó, hace ${quiet} días`;
  if (health === "dormida")
    items.push({ reason: "dormida", since: iso(lastEventAt), why: `${since}, y nada en agenda` });
  if (health === "en-riesgo")
    items.push({ reason: "en-riesgo", since: iso(lastEventAt), why: `${since}, y nada en agenda` });
  if (facts.activeOrganizers < MIN_ORGANIZERS) {
    items.push({
      reason: "un-organizador",
      since: null,
      why:
        facts.activeOrganizers === 0
          ? `Nadie del equipo usó el panel en ${ACTIVE_ORGANIZER_DAYS} días`
          : `Solo una persona del equipo usó el panel en ${ACTIVE_ORGANIZER_DAYS} días`,
    });
  }
  if (facts.waitingRequests.length > 0) {
    const oldest = facts.waitingRequests.reduce((a, b) => (new Date(a.since) < new Date(b.since) ? a : b));
    items.push({
      reason: "pedido-sin-respuesta",
      since: iso(oldest.since),
      why: `${plural(facts.waitingRequests.length, "pedido", "pedidos")} de espacio sin respuesta hace más de ${REQUEST_WAIT_HOURS} h (${[...new Set(facts.waitingRequests.map((request) => request.venue))].join(", ")})`,
    });
  }
  if (facts.staleContacts.length > 0) {
    const dated = facts.staleContacts.map((contact) => contact.since).filter((value) => value !== null);
    items.push({
      reason: "contacto-viejo",
      since: dated.length > 0 ? iso(dated.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))) : null,
      why: `Contacto sin verificar en ${[...new Set(facts.staleContacts.map((contact) => contact.venue))].join(", ")}`,
    });
  }

  return items;
}
