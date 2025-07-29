"use server";

import { EXTERNAL_SERVICES } from "app/lib/constants";

const GOOGLE_SHEETS_URL = EXTERNAL_SERVICES.googleSheets.openSpaceEpg;

export default async function epg() {
  const csv = await fetch(GOOGLE_SHEETS_URL, {
    next: { tags: ["csv"] },
  }).then((res) => res.text());

  const events = csv
    .split("\n")
    .slice(1)
    .flatMap((row) => {
      const [
        inicio,
        fin,
        lobby,
        lobby_speaker,
        centro,
        centro_speaker,
        cueva,
        cueva_speaker,
        ventana,
        ventana_speaker,
        rincon,
        rincon_speaker,
      ] = row.split(",");

      const since = `2024-10-19T${inicio}`;
      const till = `2024-10-19T${fin}`;

      // Array to hold all events
      const eventList = [];

      // Push individual events only if they exist
      if (lobby && lobby !== "/r") {
        eventList.push({
          since,
          till,
          location: "LOBBY",
          title: lobby,
          channelUuid: "1",
          speaker: lobby_speaker,
        });
      }

      if (centro && centro !== "/r") {
        eventList.push({
          since,
          till,
          location: "CENTRO",
          title: centro,
          channelUuid: "2",
          speaker: centro_speaker,
        });
      }

      if (cueva && cueva !== "/r") {
        eventList.push({
          since,
          till,
          location: "CUEVA",
          title: cueva,
          channelUuid: "3",
          speaker: cueva_speaker,
        });
      }

      if (ventana && ventana !== "/r") {
        eventList.push({
          since,
          till,
          location: "VENTANA",
          title: ventana,
          channelUuid: "4",
          speaker: ventana_speaker,
        });
      }

      if (rincon && rincon !== "\r") {
        eventList.push({
          since,
          till,
          location: "RINCÓN",
          title: rincon,
          channelUuid: "5",
          speaker: rincon_speaker,
        });
      }

      return eventList;
    });

  return events;
}
