import { cacheLife } from "next/cache";

import { getArchiveRows, getTimeline } from "lib/timeline/data";

/**
 * Every event as the archive's filters need it (~2,800 short rows). The page loads it after it
 * renders, so the HTML doesn't carry the whole history.
 */
async function render() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const rows = getArchiveRows();
  // Counted from the rows, so a community's number matches what the filter shows (milestones included)
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.c, (counts.get(row.c) ?? 0) + 1);
  const communities = getTimeline()
    .communities.filter((community) => counts.has(community.slug))
    .map(({ slug, name, status, layer, first, topics }) => ({
      slug,
      name,
      events: counts.get(slug)!,
      status,
      layer,
      first,
      topic: topics[0] ?? "general",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return JSON.stringify({ rows, communities });
}

export async function GET() {
  return new Response(await render(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=86400",
    },
  });
}
