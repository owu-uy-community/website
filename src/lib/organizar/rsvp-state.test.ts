import { describe, expect, test } from "vitest";

import { canConfirm, offerDeadline, rsvpBar, rsvpState, signupClosesAt } from "./rsvp-state";

const NOW = Date.parse("2029-11-20T15:00:00.000Z");
const event = {
  status: "published" as const,
  startDate: "2029-11-26T22:00:00.000Z",
  endDate: "2029-11-27T00:00:00.000Z",
  registration: "owu" as const,
  registrationUrl: null,
  capacity: 20,
  taken: 8,
  waitlist: true,
  approval: false,
  rsvpClosesAt: null,
};
const rsvp = (status: "attending" | "offered" | "waitlisted" | "pending" | "declined" | "cancelled", extra = {}) => ({
  status,
  offerExpiresAt: null,
  position: null,
  ...extra,
});

describe(rsvpState, () => {
  test("open, full with a waitlist, and full without one", () => {
    expect(rsvpState(event, null, NOW)).toStrictEqual({ kind: "abierto", cta: "Anotarme", left: 12 });
    expect(rsvpState({ ...event, taken: 20 }, null, NOW)).toMatchObject({ kind: "lleno-espera", left: 0 });
    expect(rsvpState({ ...event, taken: 20, waitlist: false }, null, NOW).kind).toBe("lleno");
    expect(rsvpState({ ...event, taken: 20, approval: true }, null, NOW)).toMatchObject({ cta: "Pedir lugar" });
  });

  test("a declined person is told so instead of being offered to sign up again", () => {
    expect(rsvpState(event, rsvp("declined"), NOW).kind).toBe("rechazado");
    expect(rsvpState(event, rsvp("cancelled"), NOW)).toMatchObject({ kind: "cancelado", cta: "Anotarme" });
  });

  test("an offer stands until it lapses, then their place counts as given back", () => {
    const offered = rsvp("offered", { offerExpiresAt: "2029-11-20T19:00:00.000Z" });

    expect(rsvpState(event, offered, NOW)).toStrictEqual({ kind: "oferta", until: "2029-11-20T19:00:00.000Z" });
    expect(rsvpState(event, offered, Date.parse("2029-11-20T19:00:01Z")).kind).toBe("cancelado");
    expect(rsvpState(event, rsvp("waitlisted", { position: 3 }), NOW)).toStrictEqual({ kind: "espera", position: 3 });
  });

  test("closed sign-up, the event under way, over or called off", () => {
    expect(rsvpState({ ...event, rsvpClosesAt: "2029-11-20T12:00:00.000Z" }, null, NOW).kind).toBe("cerrado");
    expect(rsvpState(event, null, Date.parse("2029-11-26T23:00:00Z")).kind).toBe("en-curso");
    expect(rsvpState(event, rsvp("attending"), Date.parse("2029-11-26T23:00:00Z")).kind).toBe("anotado");
    expect(rsvpState(event, rsvp("attending"), Date.parse("2029-11-27T00:00:00Z")).kind).toBe("pasado");
    expect(rsvpState({ ...event, status: "cancelled" }, rsvp("attending"), NOW).kind).toBe("evento-cancelado");
  });

  test("sign-ups close at the start unless the team picked another time", () => {
    const start = Date.parse(event.startDate);

    expect(rsvpState(event, null, start - 1000).kind).toBe("abierto");
    expect(rsvpState(event, null, start).kind).toBe("en-curso");
    // Kept open past the start on purpose: still open until then
    const late = { ...event, rsvpClosesAt: "2029-11-26T23:30:00.000Z" };
    expect(rsvpState(late, null, start + 60_000).kind).toBe("abierto");
    expect(rsvpState(late, null, Date.parse(late.rsvpClosesAt)).kind).toBe("en-curso");
  });

  test("sign-up elsewhere, or none at all", () => {
    expect(rsvpState({ ...event, registration: "eventbrite", registrationUrl: "https://x" }, null, NOW)).toStrictEqual({
      kind: "externo",
      url: "https://x",
      eventbrite: true,
    });
    expect(rsvpState({ ...event, registration: "none" }, null, NOW).kind).toBe("libre");
  });
});

describe(rsvpBar, () => {
  test("says what's left and what the button does", () => {
    expect(rsvpBar(rsvpState(event, null, NOW), NOW)).toStrictEqual({ text: "Gratis · quedan 12", action: "Anotarme" });
    expect(rsvpBar(rsvpState({ ...event, capacity: null }, null, NOW), NOW).text).toBe("Gratis");
    expect(rsvpBar(rsvpState({ ...event, taken: 20 }, rsvp("cancelled"), NOW), NOW).action).toBe("Lista de espera");
  });
});

describe(signupClosesAt, () => {
  test("the team's time, or the start", () => {
    expect(signupClosesAt(event)).toBe(Date.parse(event.startDate));
    expect(signupClosesAt({ ...event, rsvpClosesAt: "2029-11-25T12:00:00.000Z" })).toBe(
      Date.parse("2029-11-25T12:00:00.000Z")
    );
  });
});

describe(canConfirm, () => {
  const start = Date.parse(event.startDate);
  const seated = { status: "attending", confirmedAt: null };

  test("asks people with a seat from 72 h before until the start, once", () => {
    expect(canConfirm(event, seated, start - 73 * 3_600_000)).toBe(false);
    expect(canConfirm(event, seated, start - 72 * 3_600_000)).toBe(true);
    expect(canConfirm(event, { ...seated, confirmedAt: "2029-11-25T00:00:00.000Z" }, start - 3_600_000)).toBe(false);
    expect(canConfirm(event, { status: "waitlisted", confirmedAt: null }, start - 3_600_000)).toBe(false);
    expect(canConfirm(event, seated, start)).toBe(false);
  });
});

describe(offerDeadline, () => {
  test("only the time the same day, the date another day (Montevideo time)", () => {
    expect(offerDeadline("2029-11-20T19:00:00.000Z", NOW)).toBe("antes de las 16:00");
    expect(offerDeadline("2029-11-21T15:00:00.000Z", NOW)).toBe("antes del mié 21 nov a las 12:00");
  });
});
