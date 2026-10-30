import { cacheLife } from "next/cache";

import { getSearchIndex, type SearchItem } from "lib/community/search";

// What the ⌘K palette searches, fetched when it first opens instead of riding along in every page.
// Same hourly refresh as the events feed.
async function index(): Promise<SearchItem[]> {
  "use cache";
  cacheLife("hours");

  return getSearchIndex();
}

export async function GET() {
  return Response.json(await index());
}
