import { describe, expect, test } from "vitest";

import { CONF_DATES } from "app/lib/constants";

import { ticketsAt } from "./router";

describe(ticketsAt, () => {
  const release = Date.parse(CONF_DATES.ticketsRelease);

  test("is 14 Oct 2026, 11:00 in Uruguay (14:00 UTC)", () => {
    expect(new Date(release).toISOString()).toBe("2026-10-14T14:00:00.000Z");
  });

  test("withholds the link until the release", () => {
    expect(ticketsAt(release - 1).url).toBeNull();
  });

  test("hands out the link from the release on", () => {
    expect(ticketsAt(release).url).toMatch(/^https:\/\/www\.eventbrite\.com\.ar\/e\//);
  });
});
