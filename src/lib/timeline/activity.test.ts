import { describe, expect, test } from "vitest";

import { communityActivity } from "./activity";
import type { ArchiveCommunity, ArchiveRow } from "./data";

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
  dates.map((d, i) => ({ s: `${slug}-${d}-${i}`, t: slug, d, k: "meetup", c: slug, ...extra }));

describe(communityActivity, () => {
  const data = [
    ...rows("old", ["2009-06-01"], { k: "hito" }),
    ...rows("old", ["2010-01-01", "2010-05-01", "2012-01-01"]),
    ...rows("busy", ["2014-01-01", "2014-02-01", "2015-01-01", "2016-01-01"]),
    ...rows("busy", ["2020-05-01"], { o: 1 }),
    ...rows("small", ["2013-01-01", "2013-02-01"]),
    ...rows("vendor", ["2012-01-01", "2012-02-01", "2012-03-01"], { x: 1 }),
  ];
  const communities = [
    community("busy", "2014"),
    community("old", "2010"),
    community("small", "2013"),
    community("vendor", "2012", "ecosystem"),
  ];

  test("keeps communities with three events or more, in the order they were born, the busiest up front", () => {
    const { top, rest } = communityActivity(data, communities, 1);
    expect(top.map((c) => c.slug)).toStrictEqual(["busy"]);
    expect(rest.map((c) => c.slug)).toStrictEqual(["old"]);
  });

  test("counts in-person events per year over the community's life, milestones aside", () => {
    const { top, rest } = communityActivity(data, communities, 1);
    expect(rest[0]).toMatchObject({ first: 2010, years: [2, 0, 1] });
    // 2020 was online only: inside its life, with nothing in person
    expect(top[0]).toMatchObject({ first: 2014, years: [2, 1, 1, 0, 0, 0, 0] });
  });
});
