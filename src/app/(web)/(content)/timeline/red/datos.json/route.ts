import { cacheLife } from "next/cache";

import { getGraph } from "lib/timeline/graph";

/**
 * The network, laid out (~2,200 nodes, their edges). The page loads it once it renders, so the HTML
 * doesn't carry it, and the layout runs once per deploy, not in the browser.
 */
async function render() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  return JSON.stringify(getGraph());
}

export async function GET() {
  return new Response(await render(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=86400",
    },
  });
}
