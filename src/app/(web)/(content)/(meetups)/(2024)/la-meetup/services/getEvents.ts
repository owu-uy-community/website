/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

type Event = {
  id: number;
  name: string;
  title: string;
  datetime: string;
  end_datetime: string;
  event_url: string;
}[];

export default async function getEvents() {
  const eventsResponse = await fetch("https://meetup-bot.marpo60.xyz/json");
  const { meetups: events } = await eventsResponse.json();

  return events as unknown as Event;
}
