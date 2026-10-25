import type { ArchiveCommunity, ArchiveRow } from "./data";

/** A lane before its dots: whose it is and where its line starts and ends */
export type LaneInfo = Pick<ArchiveCommunity, "slug" | "name" | "status" | "events"> & { first: string; last: string };

/**
 * The lanes chart's lanes: communities (not the ecosystem) with three events or more, in the
 * order they were born, and which of them show up front (the busiest `shown`). The server draws
 * them before the dots arrive and the client after, from this one function, so they match.
 */
export function laneLayout(rows: ArchiveRow[], communities: ArchiveCommunity[], shown: number) {
  const byCommunity = new Map<string, ArchiveRow[]>();
  for (const row of rows) {
    if (row.x || row.k === "hito") continue;
    byCommunity.set(row.c, [...(byCommunity.get(row.c) ?? []), row]);
  }
  const lanes = communities
    .filter((community) => community.layer === "community" && (byCommunity.get(community.slug)?.length ?? 0) >= 3)
    .toSorted((a, b) => (a.first ?? "").localeCompare(b.first ?? ""));
  const top = new Set(
    lanes
      .toSorted((a, b) => byCommunity.get(b.slug)!.length - byCommunity.get(a.slug)!.length)
      .slice(0, shown)
      .map((community) => community.slug)
  );
  const info = (community: ArchiveCommunity): LaneInfo => {
    const own = byCommunity.get(community.slug)!;
    const { slug, name, status, events } = community;
    return { slug, name, status, events, first: own[0].d, last: own.at(-1)!.d };
  };
  return { lanes, top, byCommunity, info };
}
