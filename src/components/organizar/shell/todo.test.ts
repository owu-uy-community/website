import { describe, expect, test } from "vitest";

import type { OrganizerEvent } from "lib/orpc/events/schemas";
import type { PanelSummary } from "lib/orpc/panel/schemas";

import { milestones, onboarding, todoItems } from "./todo";

// A Friday
const NOW = Date.parse("2029-06-01T12:00:00-03:00");
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const iso = (hours: number) => new Date(NOW + hours * HOUR_MS).toISOString();

const event = (overrides: Partial<OrganizerEvent>): OrganizerEvent => ({
  id: "e",
  slug: "e",
  name: "Meetup",
  status: "published",
  startDate: iso(24 * 10),
  endDate: iso(24 * 10 + 2),
  heldUntil: null,
  dateChosen: true,
  registration: "owu",
  capacity: 60,
  publishedAt: null,
  updatedAt: iso(0),
  ...overrides,
});

/** An established community: an event a month ago, a team of three, two of them active. */
const summary = (overrides: Partial<PanelSummary>): PanelSummary => ({
  community: { status: "activa", pausedUntil: null, recurringSlot: null, hasDescription: true, topics: ["web"] },
  lastEventAt: iso(-24 * 30),
  team: { size: 3, activeOrganizers: 2 },
  closeOut: [],
  seats: {},
  myTasks: [],
  talkInbox: 0,
  ahead: [],
  drafts: [],
  nextSeats: null,
  showUp: { rate: null, events: 0 },
  followers: 0,
  publishedThisYear: 0,
  polls: [],
  invitations: [],
  venueRequests: [],
  conflicts: [],
  activity: [],
  ...overrides,
});

const kinds = (data: PanelSummary) => todoItems(data, "c", NOW).map((item) => item.kind);

describe(todoItems, () => {
  test("nothing ahead and nothing held: reserve the next date", () => {
    expect(kinds(summary({}))).toStrictEqual(["first"]);
    expect(todoItems(undefined, "c", NOW)).toStrictEqual([]);
  });

  test("a hold close to lapsing comes first; a silent host sends you to Espacios, a clash to its day", () => {
    const items = todoItems(
      summary({
        ahead: [event({ id: "next" })],
        seats: { next: 40 },
        drafts: [
          event({ id: "soon", status: "draft", heldUntil: iso(30) }),
          event({ id: "later", status: "draft", heldUntil: iso(24 * 10) }),
          event({ id: "undated", status: "draft", dateChosen: false, name: "Sin fecha" }),
        ],
        venueRequests: [
          {
            id: "r",
            venueName: "Espacio",
            status: "pending",
            createdAt: iso(-50),
            expiresAt: iso(22),
            respondedAt: null,
          },
          {
            id: "a",
            venueName: "Otro",
            status: "accepted",
            createdAt: iso(-5),
            expiresAt: iso(67),
            respondedAt: iso(-1),
          },
        ],
        conflicts: [
          {
            eventId: "next",
            eventName: "Meetup",
            day: "2029-06-11",
            other: { id: "o", communityName: "Parecida", title: null, kind: "hold", start: iso(24 * 10) },
          },
        ],
      }),
      "c",
      NOW
    );

    expect(items.map((item) => item.kind)).toStrictEqual(["renew", "venue", "conflict", "date"]);
    expect(items[0]).toMatchObject({ eventId: "soon", text: expect.stringContaining("vence mañana") });
    expect(items[1]).toMatchObject({
      href: "/organizar/panel/c/espacios",
      text: expect.stringMatching(/^Espacio no contesta hace 50 h/),
    });
    expect(items[2]).toMatchObject({
      href: "/organizar/panel/c/calendario?dia=2029-06-11",
      text: "«Meetup» cae el mismo día que una reserva de Parecida",
    });
  });

  test("my tasks due by tomorrow, the close-out and slow sign-ups each lead to the event", () => {
    const items = todoItems(
      summary({
        ahead: [event({ id: "next", name: "JS Night", startDate: iso(24 * 6 - 3), capacity: 60 })],
        seats: { next: 12 },
        myTasks: [{ id: "t", title: "Pedir las pizzas", eventId: "next", eventName: "JS Night", day: "2029-06-02" }],
        closeOut: [{ id: "past", name: "Meetup de mayo", endDate: iso(-24 * 3) }],
      }),
      "c",
      NOW
    );

    expect(items.map((item) => [item.kind, item.text, item.href])).toStrictEqual([
      ["task", "«Pedir las pizzas» es para mañana (JS Night)", "/organizar/panel/c/eventos/next"],
      [
        "closeout",
        "Cerrá «Meetup de mayo»: quién vino, la encuesta y las gracias (2 min)",
        "/organizar/panel/c/eventos/past",
      ],
      [
        "pacing",
        "«JS Night»: faltan 6 días y van 12 de 60 lugares. Difundilo de nuevo",
        "/organizar/panel/c/eventos/next",
      ],
    ]);
  });

  test("full enough, or without OWU sign-up, there's nothing to push", () => {
    const next = event({ id: "next", startDate: iso(24 * 6) });

    expect(kinds(summary({ ahead: [next], seats: { next: 60 } }))).toStrictEqual([]);
    expect(kinds(summary({ ahead: [{ ...next, registration: "external" }] }))).toStrictEqual([]);
  });

  test("a long silence asks for something light; a declared pause doesn't", () => {
    const quiet = summary({ lastEventAt: iso(-24 * 74) });

    expect(todoItems(quiet, "c", NOW)).toMatchObject([
      { kind: "health", text: "Hace 74 días del último evento. ¿Armamos algo liviano?" },
    ]);
    expect(
      kinds({ ...quiet, community: { ...quiet.community, status: "pausa", pausedUntil: "2029-09-01" } })
    ).toStrictEqual([]);
  });

  test("one active organizer: bring someone else to the team", () => {
    const items = todoItems(
      summary({ ahead: [event({ id: "next" })], seats: { next: 40 }, team: { size: 2, activeOrganizers: 1 } }),
      "c",
      NOW
    );

    expect(items).toMatchObject([
      { kind: "team", href: "/organizar/panel/c/equipo", text: expect.stringContaining("sumá a otra persona") },
    ]);
  });

  test("our usual day with nothing on it in the next six weeks asks what to do with it", () => {
    // The 2nd Thursday: 14 June 2029
    const slot = { weekday: 4, nth: 2, time: "19:00", durationMin: 120 } as const;
    const usual = summary({ community: { ...summary({}).community, recurringSlot: slot } });

    expect(todoItems(usual, "c", NOW)).toMatchObject([
      {
        kind: "slot",
        text: "Tu jueves 14/6 no tiene evento: ¿lo armamos, lo cedemos o hacemos algo liviano?",
        href: "/organizar/panel/c/calendario?dia=2029-06-14&hora=19:00&dur=120",
      },
    ]);

    // Held that day: the next one (12 July) is still within six weeks
    const held = event({ id: "h", status: "draft", startDate: "2029-06-14T22:00:00.000Z", heldUntil: iso(24 * 10) });
    expect(todoItems({ ...usual, drafts: [held] }, "c", NOW)).toMatchObject([
      { kind: "slot", text: expect.stringContaining("jueves 12/7") },
    ]);
  });

  test("a new community gets its checklist, not to-dos about events it never had", () => {
    expect(kinds(summary({ lastEventAt: null, team: { size: 1, activeOrganizers: 0 } }))).toStrictEqual([]);
  });

  test("talks proposed to the community are one item that leads to Charlas", () => {
    const items = todoItems(summary({ talkInbox: 3 }), "c", NOW);

    expect(items.find((item) => item.kind === "talks")).toStrictEqual({
      id: "talks",
      kind: "talks",
      text: "3 charlas propuestas para ustedes",
      href: "/organizar/panel/c/charlas",
    });
    expect(todoItems(summary({ talkInbox: 1 }), "c", NOW).find((item) => item.kind === "talks")?.text).toBe(
      "1 charla propuesta para ustedes"
    );
  });
});

describe(onboarding, () => {
  test("each first step ticks itself from what the community already has", () => {
    const fresh = summary({
      lastEventAt: null,
      community: { status: "activa", pausedUntil: null, recurringSlot: null, hasDescription: true, topics: [] },
      team: { size: 1, activeOrganizers: 1 },
      drafts: [event({ id: "held", status: "draft", heldUntil: new Date(NOW + 3 * DAY_MS).toISOString() })],
    });

    expect(onboarding(fresh, "c", NOW).map((step) => [step.id, step.done])).toStrictEqual([
      ["profile", true],
      ["topics", false],
      ["team", false],
      ["date", true],
    ]);
  });
});

describe(milestones, () => {
  test("holds that lapse, the event and its two reminders, soonest first; nothing already past", () => {
    const list = milestones(
      summary({
        ahead: [event({ id: "next", startDate: iso(24 * 3), endDate: iso(24 * 3 + 2) })],
        drafts: [
          event({ id: "held", status: "draft", heldUntil: iso(12) }),
          event({ id: "gone", status: "draft", heldUntil: iso(-1) }),
        ],
      }),
      NOW
    );

    expect(list.map((item) => item.id)).toStrictEqual([
      "hold-held",
      "reminder-48-next",
      "reminder-2-next",
      "event-next",
    ]);
  });

  test("events without OWU sign-up send no reminders", () => {
    const list = milestones(summary({ ahead: [event({ id: "free", registration: "none" })] }), NOW);

    expect(list.map((item) => item.kind)).toStrictEqual(["event"]);
  });
});
