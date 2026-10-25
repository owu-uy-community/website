import { describe, expect, test } from "vitest";

import type { ArchiveCommunity, ArchiveRow } from "./data";
import { laneLayout } from "./lanes";

const community = (slug: string, first: string, layer: ArchiveCommunity["layer"] = "community"): ArchiveCommunity => ({
  slug,
  name: slug,
  status: "activa",
  layer,
  first,
  events: 0,
  topic: "general",
});
const rows = (slug: string, dates: string[], extra: Partial<ArchiveRow> = {}): ArchiveRow[] =>
  dates.map((d, i) => ({ s: `${slug}-${i}`, t: slug, d, k: "meetup", c: slug, ...extra }));

describe(laneLayout, () => {
  const data = [
    ...rows("old", ["2010-01-01", "2011-01-01", "2012-01-01"]),
    ...rows("busy", ["2014-01-01", "2014-02-01", "2015-01-01", "2016-01-01", "2020-05-01"]),
    ...rows("small", ["2013-01-01", "2013-02-01"]),
    ...rows("vendor", ["2012-01-01", "2012-02-01", "2012-03-01"], { x: 1 }),
    ...rows("old", ["2009-06-01"], { k: "hito" }),
  ];
  const communities = [
    community("busy", "2014"),
    community("old", "2010"),
    community("small", "2013"),
    community("vendor", "2012", "ecosystem"),
  ];

  test("keeps communities with three events or more, in the order they were born", () => {
    const { lanes } = laneLayout(data, communities, 10);
    expect(lanes.map((c) => c.slug)).toStrictEqual(["old", "busy"]);
  });

  test("puts the busiest up front and spans each line from its first event to its last (milestones aside)", () => {
    const { lanes, top, info } = laneLayout(data, communities, 1);
    expect([...top]).toStrictEqual(["busy"]);
    expect(info(lanes[0])).toMatchObject({ slug: "old", first: "2010-01-01", last: "2012-01-01" });
  });
});
