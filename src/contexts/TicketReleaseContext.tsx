"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// Uruguay timezone is UTC-3
// Using ISO 8601 format with timezone offset ensures this works globally
const URUGUAY_TICKET_RELEASE_DATE = "2025-10-13T13:10:00-03:00"; // 13/10/2025 at 13:10 Uruguay time
const EVENTBRITE_TICKET_URL = "https://www.eventbrite.com/e/la-meetup-iii-tickets-1735441254509";

type TicketReleaseContextType = {
  isReleased: boolean;
  releaseDate: string;
  ticketUrl: string;
};

const TicketReleaseContext = createContext<TicketReleaseContextType | undefined>(undefined);

export function TicketReleaseProvider({ children }: { children: ReactNode }) {
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
    // Using a single interval ensures all components update simultaneously
    const interval = setInterval(checkReleaseStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <TicketReleaseContext.Provider
      value={{
        isReleased,
        releaseDate: URUGUAY_TICKET_RELEASE_DATE,
        ticketUrl: EVENTBRITE_TICKET_URL,
      }}
    >
      {children}
    </TicketReleaseContext.Provider>
  );
}

export function useTicketRelease() {
  const context = useContext(TicketReleaseContext);

  if (context === undefined) {
    throw new Error("useTicketRelease must be used within a TicketReleaseProvider");
  }

  return context;
}
