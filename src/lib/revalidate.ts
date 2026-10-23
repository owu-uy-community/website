import { revalidatePath } from "next/cache";

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
