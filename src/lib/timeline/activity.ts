import type { ArchiveCommunity, ArchiveRow } from "./data";

/** A community's row in the activity grid: its in-person events per year, from its first year to its last */
export type ActivityRow = Pick<ArchiveCommunity, "slug" | "name" | "status" | "events"> & {
  first: number;
  years: number[];
};

/**
 * The communities chart: communities (not the ecosystem) with three events or more, in the order
 * they were born, the busiest `shown` up front and the rest one click away. A year counts the
 * community's in-person events, as the archive does by default, so a cell and the list it opens
 * agree; an online-only year shows as an empty one within the community's life.
 */
export function communityActivity(rows: ArchiveRow[], communities: ArchiveCommunity[], shown: number) {
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

  const row = ({ slug, name, status, events }: ArchiveCommunity): ActivityRow => {
    const own = byCommunity.get(slug)!;
    const first = Number(own[0].d.slice(0, 4));
    const years = Array.from({ length: Number(own.at(-1)!.d.slice(0, 4)) - first + 1 }, () => 0);
    for (const event of own) if (!event.o) years[Number(event.d.slice(0, 4)) - first] += 1;
    return { slug, name, status, events, first, years };
  };
  return {
    top: lanes.filter((c) => top.has(c.slug)).map(row),
    rest: lanes.filter((c) => !top.has(c.slug)).map(row),
  };
}
