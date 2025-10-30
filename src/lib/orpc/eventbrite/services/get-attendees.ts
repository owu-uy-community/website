import { EVENTBRITE_API_URL, EVENTBRITE_API_KEY, EVENTBRITE_EVENT_ID } from "app/lib/constants"
import type { EventbriteAttendeesResponse } from "lib/eventbrite/types"
import type { GetAttendeesInput } from "../schemas"

/**
 * Fetch attendees from Eventbrite API
 */
export const getAttendees = async (input: GetAttendeesInput): Promise<EventbriteAttendeesResponse> => {
  // Check if Eventbrite is configured
  if (!EVENTBRITE_API_KEY || !EVENTBRITE_EVENT_ID) {
    throw new Error("Eventbrite not configured. EVENTBRITE_API_KEY and NEXT_PUBLIC_EVENTBRITE_EVENT_ID must be set.")
  }

  // Build query params
  const params = new URLSearchParams({
    page: input.page?.toString() || "1",
    page_size: input.pageSize?.toString() || "50",
  })

  if (input.status) {
    params.append("status", input.status)
  }

  const eventbriteUrl = `${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}/attendees/?${params.toString()}`

  // Fetch from Eventbrite API
  const response = await fetch(eventbriteUrl, {
    headers: {
      Authorization: `Bearer ${EVENTBRITE_API_KEY}`,
      "Content-Type": "application/json",
    },
    next: {
      revalidate: 60, // Cache for 60 seconds
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error_description || "Failed to fetch attendees from Eventbrite")
  }

  return response.json()
}

