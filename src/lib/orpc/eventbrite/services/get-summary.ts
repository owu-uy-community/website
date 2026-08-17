import { EVENTBRITE_API_URL, EVENTBRITE_API_KEY, EVENTBRITE_EVENT_ID } from "app/lib/constants";
import type { EventbriteEvent, EventbriteSummary, EventbriteAttendeesResponse } from "lib/eventbrite/types";

/**
 * Fetch event summary including attendee stats.
 * Returns null when Eventbrite is not configured: that's an expected state
 * (local dev, events without ticketing), not an error — throwing here used to
 * spam the console on every admin page via the sidebar poll.
 */
export const getSummary = async (): Promise<{
  event: {
    id: string;
    name: string;
    start: string;
    end: string;
    capacity?: number;
    status: string;
  };
  summary: EventbriteSummary;
} | null> => {
  if (!EVENTBRITE_API_KEY || !EVENTBRITE_EVENT_ID) {
    return null;
  }

  // Fetch event details and attendees in parallel
  const [eventResponse, attendeesResponse] = await Promise.all([
    fetch(`${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}/`, {
      headers: {
        Authorization: `Bearer ${EVENTBRITE_API_KEY}`,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 300, // Cache for 5 minutes
      },
    }),
    fetch(`${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}/attendees/?page_size=100`, {
      headers: {
        Authorization: `Bearer ${EVENTBRITE_API_KEY}`,
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 60, // Cache for 1 minute
      },
    }),
  ]);

  if (!eventResponse.ok || !attendeesResponse.ok) {
    const errorData = await (eventResponse.ok ? attendeesResponse : eventResponse).json().catch(() => ({}));
    throw new Error(errorData.error_description || "Failed to fetch event summary from Eventbrite");
  }

  const event: EventbriteEvent = await eventResponse.json();
  const attendeesData: EventbriteAttendeesResponse = await attendeesResponse.json();

  // Calculate summary statistics
  const summary: EventbriteSummary = {
    total_attendees: attendeesData.pagination.object_count,
    checked_in: attendeesData.attendees.filter((a) => a.checked_in).length,
    not_checked_in: attendeesData.attendees.filter((a) => !a.checked_in && !a.cancelled && !a.refunded).length,
    cancelled: attendeesData.attendees.filter((a) => a.cancelled).length,
    refunded: attendeesData.attendees.filter((a) => a.refunded).length,
  };

  return {
    event: {
      id: event.id,
      name: event.name.text,
      start: event.start.local,
      end: event.end.local,
      capacity: event.capacity,
      status: event.status,
    },
    summary,
  };
};
