import { useState, useEffect } from "react";

// Uruguay timezone is UTC-3
// Using ISO 8601 format with timezone offset ensures this works globally
const URUGUAY_TICKET_RELEASE_DATE = "2025-10-13T13:10:00-03:00"; // 13/10/2025 at 13:10 Uruguay time
const EVENTBRITE_TICKET_URL = "https://www.eventbrite.com/e/la-meetup-iii-tickets-1735441254509";

export function useTicketRelease() {
  const [isReleased, setIsReleased] = useState(false);

  useEffect(() => {
    const checkReleaseStatus = () => {
      const now = new Date();
      const releaseDate = new Date(URUGUAY_TICKET_RELEASE_DATE);
      setIsReleased(now >= releaseDate);
    };

    // Check immediately
    checkReleaseStatus();

    // Then check every second to ensure real-time updates
    const interval = setInterval(checkReleaseStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    isReleased,
    releaseDate: URUGUAY_TICKET_RELEASE_DATE,
    ticketUrl: EVENTBRITE_TICKET_URL,
  };
}
