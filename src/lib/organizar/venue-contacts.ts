/**
 * Whether a space's contact still answers for it. 5 of the 8 hosting contacts in OWU's old canvas
 * had left their companies: a contact nobody confirmed in half a year, whose mail bounced or who
 * left is "sin verificar" until they (or staff) say otherwise. Client-safe: staff's outreach
 * queue and the venue cards read the same rule.
 */

/** No confirmation (an answered request, the yearly check) in this long and a contact needs checking. */
export const STALE_AFTER_DAYS = 182;
/** The "¿Siguen pudiendo recibir meetups?" email goes at most once in this long per contact. */
export const CHECK_EVERY_DAYS = 365;

const DAY_MS = 86_400_000;

export type ContactFreshness = {
  /** When they agreed to receive requests: the first confirmation */
  consentAt: Date | string;
  lastConfirmedAt: Date | string | null;
  bouncedAt: Date | string | null;
  leftAt: Date | string | null;
  /** An organizer reported them gone; staff haven't confirmed it yet */
  leftReportedAt?: Date | string | null;
};

const time = (value: Date | string) => new Date(value).getTime();

/** Still there and reachable: requests go to these. */
export const isActive = (contact: Pick<ContactFreshness, "bouncedAt" | "leftAt">) =>
  !contact.leftAt && !contact.bouncedAt;

/** Gone, bounced, or not confirmed in 6 months: staff should check before anyone counts on them. */
export function isStale(contact: ContactFreshness, now: Date | number = Date.now()) {
  if (!isActive(contact) || contact.leftReportedAt) return true;
  const confirmed = time(contact.lastConfirmedAt ?? contact.consentAt);

  return new Date(now).getTime() - confirmed > STALE_AFTER_DAYS * DAY_MS;
}

/** Why, in words, for staff ("Se fue de la empresa", "Rebotó el mail", "Sin confirmar desde …"). */
export function staleReason(contact: ContactFreshness, now: Date | number = Date.now()) {
  if (contact.leftAt) return "Ya no está en la empresa";
  if (contact.bouncedAt) return "Rebotó el mail";
  if (contact.leftReportedAt) return "Una comunidad avisó que ya no está: confirmalo";
  if (!isStale(contact, now)) return null;

  return "Sin confirmar hace más de 6 meses";
}
