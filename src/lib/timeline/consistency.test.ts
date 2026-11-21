import { describe, expect, test } from "vitest";

import { filterRows } from "app/(web)/(content)/timeline/filter-state";

import { getArchive, getStats, getTimeline, isCommunityEvent } from "./data";
import { getGraph } from "./graph";
import { getPhotoCommunities } from "./photos";
import { getTimelineStats } from "./stats";
import { getVenues } from "./venues";

/*
 * Numbers a reader can compare across pages, on the real dataset (content/timeline): a sync or a
 * change that makes two of them disagree fails here, not in a reviewer's screenshot.
 */

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const DEFAULT = {
  q: "",
  comunidad: [],
  tipo: [],
  tema: "",
  ciudad: "",
  desde: null,
  hasta: null,
  fotos: false,
  online: false,
  ecosistema: false,
  orden: "antiguos",
  evento: "",
} as const;

describe("the timeline's numbers agree across pages", () => {
  const stats = getStats();
  const numbers = getTimelineStats();
  const { venues } = getVenues();
  const graph = getGraph();
  const archive = getArchive();
  const communities = new Map(archive.communities.map((c) => [c.slug, c]));
  const archiveEvents = (state: Partial<Record<keyof typeof DEFAULT, unknown>>) =>
    filterRows(archive.rows, { ...DEFAULT, ...state } as Parameters<typeof filterRows>[1], communities).filter(
      (row) => row.k !== "hito"
    );
  const nodes = (kind: string) => graph.nodes.filter((node) => node.t === kind);

  test('"En números" and the archive count the same in-person community events', () => {
    const inPerson = getTimeline().events.filter((e) => isCommunityEvent(e) && !e.online).length;
    expect(sum(numbers.heatmap.flatMap((row) => row.months))).toBe(inPerson);
    expect(archiveEvents({})).toHaveLength(inPerson);
  });

  test('"¿Dónde?" is /timeline/lugares\' first twelve, and the network has the same places', () => {
    expect(numbers.venues.map(({ name, count }) => [name, count])).toStrictEqual(
      venues.slice(0, 12).map((venue) => [venue.name, venue.events.length])
    );
    expect(
      nodes("v")
        .map((node) => node.n)
        .toSorted((a, b) => b - a)
    ).toStrictEqual(venues.map((venue) => venue.events.length).toSorted((a, b) => b - a));
  });

  test("the network has the hero's communities, each with its card's count", () => {
    expect(nodes("c")).toHaveLength(stats.communities);
    for (const node of nodes("c")) expect(node.n).toBe(communities.get(node.k.slice(2))?.events);
  });

  test("a community's card counts what its archive lists", () => {
    for (const community of archive.communities)
      expect(archiveEvents({ comunidad: [community.slug], online: true, ecosistema: true })).toHaveLength(
        community.events
      );
  });

  test("the hero's photos are /timeline/fotos' communities' photos", () => {
    const own = getPhotoCommunities().filter((community) => community.layer === "community");
    expect(sum(own.map((community) => community.photos))).toBe(stats.photos);
  });
});
