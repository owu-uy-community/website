import epg from "components/Meetups/2024/OpenSpace/helpers/epg_server";

import OpenSpaceClient from "./component";

export default async function OpenSpaceAgendaServer() {
  return <OpenSpaceClient initialEpg={await epg()} />;
}
