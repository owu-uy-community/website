"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Container3D } from "components/Meetups/2024/Container3D";
import Ticket from "components/Meetups/2024/Ticket";
import { addUtmParams } from "app/lib/utils";

type TicketHomeProps = {
  sponsors?: readonly {
    readonly name: string;
    readonly image: string;
    readonly website?: string;
  }[];
};

export default function TicketHome({ sponsors }: TicketHomeProps) {
  // Uruguay timezone is UTC-3, so 13:10 Uruguay time = 16:10 UTC
  // Using ISO 8601 format with timezone offset for clarity
  const uruguayReleaseDate = "2025-10-13T13:10:00-03:00"; // 13/10/2025 at 13:10 Uruguay time
  const ticketUrl = "https://www.eventbrite.com/e/la-meetup-iii-tickets-1735441254509";

  const [isReleased, setIsReleased] = useState(false);

  useEffect(() => {
    const checkReleaseStatus = () => {
      const now = new Date();
      const releaseDate = new Date(uruguayReleaseDate);
      setIsReleased(now >= releaseDate);
    };

    checkReleaseStatus();
    const interval = setInterval(checkReleaseStatus, 1000);

    return () => clearInterval(interval);
  }, [uruguayReleaseDate]);

  const desktopTicket = (
    <div className="flex-0 mx-auto flex max-w-[550px] items-center justify-center">
      <Container3D>
        <Ticket sponsors={sponsors} releaseDate={uruguayReleaseDate} ticketUrl={ticketUrl} />
      </Container3D>
    </div>
  );

  const mobileTicket = <Ticket sponsors={sponsors} releaseDate={uruguayReleaseDate} ticketUrl={ticketUrl} />;

  return (
    <div className="h-full w-full">
      {/* Desktop 3D version */}
      <div className="hidden sm:block">
        {isReleased ? (
          <Link className="w-full" href={addUtmParams(ticketUrl)} target="_blank">
            {desktopTicket}
          </Link>
        ) : (
          desktopTicket
        )}
      </div>

      {/* Mobile flat version */}
      <div className="block w-full sm:hidden">
        {isReleased ? (
          <Link className="w-full" href={addUtmParams(ticketUrl)} target="_blank">
            {mobileTicket}
          </Link>
        ) : (
          mobileTicket
        )}
      </div>
    </div>
  );
}
