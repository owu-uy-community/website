"use client";

import { Container3D } from "components/Meetups/2024/Container3D";
import Ticket from "components/Meetups/2024/Ticket";

type TicketHomeProps = {
  sponsors?: readonly {
    readonly name: string;
    readonly image: string;
    readonly website?: string;
  }[];
};

export default function TicketHome({ sponsors }: TicketHomeProps) {
  return (
    <div className="hidden h-full w-full xl:block">
      <div className="flex-0 mx-auto flex max-w-[550px] items-center justify-center">
        <Container3D>
          <Ticket sponsors={sponsors} releaseDate="2025-10-13T13:10:00" />
        </Container3D>
      </div>
    </div>
  );
}
