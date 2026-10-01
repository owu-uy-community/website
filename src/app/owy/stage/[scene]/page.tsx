import type { Metadata } from "next";
import { notFound } from "next/navigation";

import StageClient from "components/OwyStage/StageClient";
import { SCENES, isSceneId } from "lib/owy-stage/scenes";

type Params = Promise<{ scene: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { scene } = await params;

  return {
    title: isSceneId(scene) ? `Owy Stage · ${SCENES[scene].title}` : "Owy Stage",
    robots: { index: false, follow: false },
  };
}

/**
 * One pinned scene (a dedicated OBS source, or an admin thumbnail with
 * `?preview=1`). Face and effect events still reach it; scene changes don't.
 */
export default async function OwyScenePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { scene } = await params;
  const query = await searchParams;
  if (!isSceneId(scene)) notFound();

  return (
    <StageClient
      bg={query.bg === "transparent" ? "transparent" : "black"}
      fixed={scene}
      preview={query.preview === "1"}
    />
  );
}
