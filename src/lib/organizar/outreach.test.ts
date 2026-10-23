import { describe, expect, test } from "vitest";

import { activeAt, contactStale, outreachItems, type CommunityFacts } from "./outreach";

const NOW = Date.parse("2026-10-23T15:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY);

const healthy: CommunityFacts = {
  status: "activa",
  pausedUntil: null,
  createdAt: ago(1000),
  lastEventAt: ago(20),
  hasUpcoming: false,
  activeOrganizers: 2,
  staleContacts: [],
  waitingRequests: [],
};
const reasons = (facts: Partial<CommunityFacts>) =>
  outreachItems({ ...healthy, ...facts }, NOW).map((item) => item.reason);

describe(outreachItems, () => {
  test("quiet for more than 60 days with nothing ahead: at risk; 59 and 60 still fine", () => {
    expect([59, 60, 61].map((days) => reasons({ lastEventAt: ago(days) }))).toStrictEqual([[], [], ["en-riesgo"]]);
  });

  test("more than 180 days: dormant instead of at risk", () => {
    expect([179, 180, 181].map((days) => reasons({ lastEventAt: ago(days) }))).toStrictEqual([
      ["en-riesgo"],
      ["en-riesgo"],
      ["dormida"],
    ]);
  });

  test("something scheduled keeps a quiet community off the queue", () => {
    expect(reasons({ lastEventAt: ago(300), hasUpcoming: true })).toStrictEqual([]);
  });

  test("a community that never had an event counts from when it joined", () => {
    expect(reasons({ lastEventAt: null, createdAt: ago(10) })).toStrictEqual([]);
    expect(outreachItems({ ...healthy, lastEventAt: null, createdAt: ago(90) }, NOW)[0]).toMatchObject({
      reason: "en-riesgo",
      why: "Sin eventos desde que se sumó, hace 90 días, y nada en agenda",
    });
  });

  test("a declared pause hides everything until its date, then it's back", () => {
    const paused = { status: "pausa", lastEventAt: ago(400), activeOrganizers: 0 };

    expect(reasons({ ...paused, pausedUntil: "2026-12-01" })).toStrictEqual([]);
    expect(reasons({ ...paused, pausedUntil: "2026-10-01" })).toStrictEqual(["dormida", "un-organizador"]);
  });

  test("fewer than two active organizers, stale contacts and waiting requests each get a row", () => {
    const items = outreachItems(
      {
        ...healthy,
        activeOrganizers: 1,
        staleContacts: [{ venue: "Casa Anfitriona", since: ago(200) }],
        waitingRequests: [
          { venue: "Oficina Norte", since: ago(4) },
          { venue: "Oficina Sur", since: ago(5) },
        ],
      },
      NOW
    );

    expect(items).toStrictEqual([
      { reason: "un-organizador", since: null, why: "Solo una persona del equipo usó el panel en 90 días" },
      {
        reason: "pedido-sin-respuesta",
        since: ago(5).toISOString(),
        why: "2 pedidos de espacio sin respuesta hace más de 72 h (Oficina Norte, Oficina Sur)",
      },
      { reason: "contacto-viejo", since: ago(200).toISOString(), why: "Contacto sin verificar en Casa Anfitriona" },
    ]);
  });
});

describe(activeAt, () => {
  test("someone who did something in the last 90 days is active", () => {
    expect([89, 90, 91].map((days) => activeAt(ago(days), NOW))).toStrictEqual([true, true, false]);
    expect(activeAt(null, NOW)).toBe(false);
  });
});

describe(contactStale, () => {
  const contact = { leftAt: null, bouncedAt: null, lastConfirmedAt: null, consentAt: ago(30) };

  test("a contact goes stale when gone, bouncing, or unconfirmed for 6 months", () => {
    expect(contactStale(contact, NOW)).toBe(false);
    expect(contactStale({ ...contact, leftAt: ago(1) }, NOW)).toBe(true);
    expect(contactStale({ ...contact, bouncedAt: ago(1) }, NOW)).toBe(true);
    expect(contactStale({ ...contact, consentAt: ago(400), lastConfirmedAt: ago(100) }, NOW)).toBe(false);
    expect(contactStale({ ...contact, consentAt: ago(400), lastConfirmedAt: ago(183) }, NOW)).toBe(true);
  });
});
