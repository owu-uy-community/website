"use server";

import { fetchEpgServer } from "components/Meetups/2024/OpenSpace/helpers/common";

import OpenSpaceClient from "./component";

export default async function OpenSpaceAgendaServer() {
  const epg = await fetchEpgServer();

  return <OpenSpaceClient initialEpg={epg} />;
}
