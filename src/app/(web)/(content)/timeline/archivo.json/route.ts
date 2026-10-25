import { cacheLife } from "next/cache";

import { getArchive } from "lib/timeline/data";

/**
 * Every event as the archive's filters need it (~2,800 short rows). The page loads it after it
 * renders, so the HTML doesn't carry the whole history.
 */
async function render() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  return JSON.stringify(getArchive());
}

export async function GET() {
  return new Response(await render(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=86400",
    },
  });
}
