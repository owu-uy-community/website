import type { Metadata } from "next";

import StageClient from "components/OwyStage/StageClient";

export const metadata: Metadata = {
  title: "Owy Stage",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The live wall: follows whatever the director sets in /admin/owy/scenes.
 * Public on purpose — OBS browser sources carry no session. `?bg=transparent`
 * makes the stage an overlay.
 */
export default async function OwyStagePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  return <StageClient bg={params.bg === "transparent" ? "transparent" : "black"} />;
}
