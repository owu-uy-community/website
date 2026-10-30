/**
 * Organizá's vocabulary. One word per idea across the panel, the public pages and the emails:
 *
 * - **anotados** — people with a seat (status attending). Never "inscriptos" or "van" for the count.
 * - **lugares ocupados** — seats taken: anotados plus their +1s plus seats offered from the waitlist.
 *   Capacity is counted in lugares.
 * - **en espera** — the waitlist. **por aprobar** — waiting for the team's approval.
 * - **entraron** / **hacer entrar** — checked in at the door. "Puerta" is the place, never the act.
 *   Never "acreditar", "check-in" or "llegadas".
 * - **liberaron su lugar** — they cancelled themselves; **dados de baja** — the team cancelled them.
 * - **votar fecha** — date polls between communities. **encuesta** — only the post-event survey.
 * - **difusión** — where an event is announced (owu.uy, Slack, Telegram, Eventbrite, Meetup).
 * - **espacio** — a venue in the directory; **lugar** — where an event happens; **anfitrión** — the host company.
 * - **reserva** — a date hold.
 */

/** "1 comunidad", "3 comunidades", "0 comunidades". */
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Gendered words that agree with a count: "1 persona anotada", "2 personas anotadas". */
export const people = (count: number, adjective: { one: string; many: string }) =>
  `${plural(count, "persona", "personas")} ${count === 1 ? adjective.one : adjective.many}`;

export type Headcount = {
  /** People with a seat */
  attending: number;
  /** Their +1s */
  guests: number;
  /** Seats offered to the waitlist and not yet confirmed */
  offered: number;
  waitlisted: number;
  pending: number;
};

/** The three numbers every surface shows, computed once: lugares, anotados and en espera. */
export function headcount(count: Headcount, capacity: number | null) {
  const seats = count.attending + count.guests + count.offered;

  return {
    seats,
    attending: count.attending,
    waitlisted: count.waitlisted,
    pending: count.pending,
    seatsLabel: capacity ? `${seats} de ${capacity} lugares` : plural(seats, "lugar ocupado", "lugares ocupados"),
    attendingLabel: people(count.attending, { one: "anotada", many: "anotadas" }),
    waitlistLabel: `${count.waitlisted} en espera`,
  };
}
