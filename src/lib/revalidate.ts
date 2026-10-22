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
