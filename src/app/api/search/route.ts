import { getSearchIndex } from "lib/community/search";

// What the ⌘K palette searches, fetched when it first opens instead of riding along in every page.
// Same hourly refresh as the events feed.
export const revalidate = 3600;

export async function GET() {
  return Response.json(await getSearchIndex());
}
