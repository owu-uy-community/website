/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { EXTERNAL_SERVICES } from "app/lib/constants";

type Event = {
  id: number;
  name: string;
  title: string;
  datetime: string;
  end_datetime: string;
  event_url: string;
}[];

export default async function getEvents() {
  const eventsResponse = await fetch(EXTERNAL_SERVICES.meetupBot, {
    // Revalidate events every hour to check for new events :)
    next: { revalidate: 3600 },
  });
  const { meetups: events } = await eventsResponse.json();

  return events as unknown as Event;
}
