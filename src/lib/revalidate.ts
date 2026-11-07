import { revalidatePath, revalidateTag } from "next/cache";

/** The cache tag on an event's public board: its rooms, blocks and cards (lib/openspace/public-board). */
export const boardTag = (eventId: string) => `board:${eventId}`;

/**
 * An event's board changed: the next read of its cached board goes to the database. Next applies it
 * when the request ends, so a write inside a transaction is already committed by then. Outside a
 * request (tests, scripts) there's no cache to clear.
 */
export function refreshBoard(eventId: string) {
  try {
    revalidateTag(boardTag(eventId), { expire: 0 });
  } catch {
    // Not in a request: no cache to clear
  }
}

/**
 * Ask Next to rebuild a page on its next visit (seats left, a new date). Outside a request (tests,
 * scripts, the tick) there's nothing to rebuild, so it does nothing.
 */
export function refreshPage(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Not in a request: no cache to clear
  }
}

export const eventPagePath = (communitySlug: string, eventSlug: string) =>
  `/comunidad/${communitySlug}/events/${eventSlug}`;

/** An event was published, edited or cancelled: its page and the lists that show it. */
export function refreshEvent(communitySlug: string, eventSlug: string) {
  for (const path of [eventPagePath(communitySlug, eventSlug), `/comunidad/${communitySlug}`, "/eventos", "/"]) {
    refreshPage(path);
  }
}

/**
 * generateStaticParams under Cache Components must return at least one path. A build without data
 * (CI builds against an empty database) gets a placeholder that renders the 404, so the route still
 * builds; real paths missing from the list render on their first visit and are cached after it.
 */
export const withPlaceholder = <T>(params: T[], placeholder: T): T[] => (params.length > 0 ? params : [placeholder]);
