import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SceneExport from "components/OwyStage/SceneExport";
import StageClient from "components/OwyStage/StageClient";
import { parseCanvas } from "lib/owy-stage/canvas";
import { parseLag } from "lib/owy-stage/face-flow";
import { SCENES, isSceneId, type SceneId } from "lib/owy-stage/scenes";

type Params = Promise<{ scene: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { scene } = await params;

  return {
    title: isSceneId(scene) ? `Owy Stage · ${SCENES[scene].title}` : "Owy Stage",
    robots: { index: false, follow: false },
  };
}

/** `?p=<json>`: the scene's params. Anything that doesn't parse leaves the scene on its defaults. */
function queryParams(scene: SceneId, raw: string | string[] | undefined) {
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = SCENES[scene].params.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One pinned scene (a dedicated OBS source, or an admin thumbnail with
 * `?preview=1`). Face and effect events still reach it; scene changes don't.
 * `?export=1` records it to a 1920×1080, 60 fps MP4 (see SceneExport).
 */
export default async function OwyScenePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { scene } = await params;
  const query = await searchParams;
  if (!isSceneId(scene)) notFound();
  const sceneParams = queryParams(scene, query.p);

  if (query.export === "1") return <SceneExport params={sceneParams} scene={scene} />;

  return (
    <StageClient
      bg={query.bg === "transparent" ? "transparent" : "black"}
      canvas={parseCanvas(typeof query.canvas === "string" ? query.canvas : undefined)}
      fixed={scene}
      lag={parseLag(query.lag)}
      params={sceneParams}
      preview={query.preview === "1"}
    />
  );
}
