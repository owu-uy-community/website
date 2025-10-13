"use client";

import Link from "next/link";
import { Container3D } from "components/Meetups/2024/Container3D";
import Ticket from "components/Meetups/2024/Ticket";
import { addUtmParams } from "app/lib/utils";
import { useTicketRelease } from "hooks/useTicketRelease";

type TicketHomeProps = {
  sponsors?: readonly {
    readonly name: string;
    readonly image: string;
    readonly website?: string;
  }[];
};

export default function TicketHome({ sponsors }: TicketHomeProps) {
  // Use centralized ticket release logic
  const { isReleased, releaseDate: uruguayReleaseDate, ticketUrl } = useTicketRelease();

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
