import { describe, expect, test } from "vitest";

import { offerDeadline, rsvpBar, rsvpState } from "./rsvp-state";

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

describe(offerDeadline, () => {
  test("only the time the same day, the date another day (Montevideo time)", () => {
    expect(offerDeadline("2029-11-20T19:00:00.000Z", NOW)).toBe("antes de las 16:00");
    expect(offerDeadline("2029-11-21T15:00:00.000Z", NOW)).toBe("antes del mié 21 nov a las 12:00");
  });
});
