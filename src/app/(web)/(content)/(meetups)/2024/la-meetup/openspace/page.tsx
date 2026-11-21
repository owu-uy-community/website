import { cacheLife } from "next/cache";
import { Suspense } from "react";

import epg from "components/Meetups/2024/OpenSpace/helpers/epg_server";

import OpenSpaceClient from "./component";

export default async function OpenSpaceAgendaServer() {
  "use cache";
  // A past edition's agenda: it only changes with a deploy
  cacheLife("max");

  // The timeline library reads the clock as it renders, so it renders per visit instead of in the shell
  return (
    <Suspense>
      <OpenSpaceClient initialEpg={await epg()} />
    </Suspense>
  );
}
