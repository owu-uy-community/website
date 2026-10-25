import { describe, expect, test } from "vitest";

import { computeStats } from "./stats";
import type { TimelineCommunity, TimelineEvent } from "./types";

const event = (slug: string, start: string, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: slug,
  slug,
  title: slug,
  start,
  kind: "meetup",
  layer: "community",
  community: "ruby",
  sources: [],
  ...extra,
});

const ruby: TimelineCommunity = {
  slug: "ruby",
  name: "Ruby Montevideo",
  kind: "grupo",
  layer: "community",
  status: "activa",
  topics: ["lenguajes"],
  events: 3,
  first: "2012-04-10",
  last: "2013-03-07",
};
const ember: TimelineCommunity = {
  ...ruby,
  slug: "ember",
  name: "Ember",
  topics: ["web"],
  status: "cerrada",
  first: "2013-01-01",
  last: "2013-05-01",
};

describe(computeStats, () => {
  const stats = computeStats(
    [
      event("a", "2012-04-10T19:00:00-03:00", { venue: "Oficina de Pyxis", city: "Montevideo", rsvps: 30 }),
      event("b", "2013-03-07T19:30:00-03:00", { venue: "Pyxis", city: "Punta del Este", rsvps: 10 }),
      event("c", "2013-05", { community: "ember", venue: "Torre Antel", city: "Montevideo" }),
      event("online", "2013-06-01T19:00:00-03:00", { online: true, rsvps: 500 }),
      event("vendor", "2013-07-01T19:00:00-03:00", { layer: "ecosystem", rsvps: 900 }),
    ],
    [ruby, ember]
  );

  test("counts only in-person community events, by year and month", () => {
    expect(stats.from).toBe(2012);
    expect(stats.to).toBe(2013);
    expect(stats.heatmap[1].months[2]).toBe(1);
    expect(stats.heatmap[1].months[4]).toBe(1);
  });

  test("reads weekday and hour off the local time, skipping date-only events", () => {
    expect(stats.timed).toBe(2);
    // 2012-04-10 was a Tuesday, 2013-03-07 a Thursday (Monday first)
    expect(stats.weekdays).toStrictEqual([0, 1, 0, 1, 0, 0, 0]);
    expect(stats.hours.find((h) => h.hour === 19)?.count).toBe(2);
  });

  test("merges venue spellings and maps cities to departments", () => {
    expect(stats.venues[0]).toStrictEqual({ name: "Pyxis", count: 2 });
    expect(stats.venues).toContainEqual({ name: "Torre de las Telecomunicaciones", count: 1 });
    expect(stats.places).toStrictEqual([
      { name: "Montevideo", count: 2 },
      { name: "Maldonado", count: 1 },
    ]);
  });

  test("tracks communities alive, born and closed each year", () => {
    expect(stats.communities).toStrictEqual([
      { year: 2012, active: 1, births: 1, closures: 0 },
      { year: 2013, active: 2, births: 1, closures: 1 },
    ]);
    expect(stats.topics.rows[1]).toStrictEqual({ year: 2013, lenguajes: 1, web: 1 });
  });

  test("ranks the biggest in-person community events", () => {
    expect(stats.biggest.map((b) => b.slug)).toStrictEqual(["a", "b"]);
  });
});
