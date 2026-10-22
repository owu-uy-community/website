import { describe, expect, test } from "vitest";

import type { OrganizerEvent } from "lib/orpc/events/schemas";
import type { PanelSummary } from "lib/orpc/panel/schemas";

import { milestones, todoItems } from "./todo";

const NOW = Date.parse("2029-06-01T12:00:00-03:00");
const HOUR_MS = 3_600_000;
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

const summary = (overrides: Partial<PanelSummary>): PanelSummary => ({
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

describe(todoItems, () => {
  test("nothing ahead and nothing held: reserve a first date", () => {
    expect(todoItems(summary({}), "c", NOW).map((item) => item.kind)).toStrictEqual(["first"]);
    expect(todoItems(undefined, "c", NOW)).toStrictEqual([]);
  });

  test("a hold close to lapsing comes first; a silent host sends you to Espacios, a clash to its day", () => {
    const items = todoItems(
      summary({
        ahead: [event({ id: "next" })],
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
