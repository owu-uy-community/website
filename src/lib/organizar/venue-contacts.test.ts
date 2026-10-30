import { describe, expect, test } from "vitest";

import { isStale, staleReason } from "./venue-contacts";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000);
const contact = (overrides = {}) => ({
  consentAt: daysAgo(400),
  lastConfirmedAt: daysAgo(10),
  bouncedAt: null,
  leftAt: null,
  ...overrides,
});

describe(isStale, () => {
  test("a contact confirmed within six months is fresh; past that, stale", () => {
    expect(isStale(contact(), NOW)).toBe(false);
    expect(isStale(contact({ lastConfirmedAt: daysAgo(181) }), NOW)).toBe(false);
    expect(isStale(contact({ lastConfirmedAt: daysAgo(183) }), NOW)).toBe(true);
  });

  test("never confirmed counts from the consent", () => {
    expect(isStale(contact({ lastConfirmedAt: null, consentAt: daysAgo(30) }), NOW)).toBe(false);
    expect(isStale(contact({ lastConfirmedAt: null, consentAt: daysAgo(200) }), NOW)).toBe(true);
  });

  test("a bounce or someone who left is stale however recent the confirmation", () => {
    expect(isStale(contact({ bouncedAt: daysAgo(1) }), NOW)).toBe(true);
    expect(isStale(contact({ leftAt: daysAgo(1) }), NOW)).toBe(true);
    // An organizer's report waits for staff, but already counts as "sin verificar"
    expect(isStale(contact({ leftReportedAt: daysAgo(1) }), NOW)).toBe(true);
  });
});

describe(staleReason, () => {
  test("says why, or nothing for a fresh contact", () => {
    expect(staleReason(contact(), NOW)).toBeNull();
    expect(staleReason(contact({ leftAt: daysAgo(1), bouncedAt: daysAgo(1) }), NOW)).toBe("Ya no está en la empresa");
    expect(staleReason(contact({ bouncedAt: daysAgo(1) }), NOW)).toBe("Rebotó el mail");
    expect(staleReason(contact({ leftReportedAt: daysAgo(1) }), NOW)).toBe(
      "Una comunidad avisó que ya no está: confirmalo"
    );
    expect(staleReason(contact({ lastConfirmedAt: daysAgo(300) }), NOW)).toBe("Sin confirmar hace más de 6 meses");
  });
});
