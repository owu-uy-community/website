import type { Metadata } from "next";

import StageClient from "components/OwyStage/StageClient";
import { parseCanvas } from "lib/owy-stage/canvas";

export const metadata: Metadata = {
  title: "Owy Stage",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The live wall: follows whatever the director sets in /admin/owy/scenes.
 * Public on purpose — OBS browser sources carry no session. `?bg=transparent`
 * makes the stage an overlay; `?canvas=3584x960` (or `ucu`, or `fit`) shapes
 * the frame for a wall that is not 16:9. `?monitor=program|preview` is for the
 * admin's monitors (see StageClient).
 */
export default async function OwyStagePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const monitor = params.monitor === "program" || params.monitor === "preview" ? params.monitor : undefined;

  return (
    <StageClient
      bg={params.bg === "transparent" ? "transparent" : "black"}
      canvas={parseCanvas(typeof params.canvas === "string" ? params.canvas : undefined)}
      monitor={monitor}
    />
  );
}
