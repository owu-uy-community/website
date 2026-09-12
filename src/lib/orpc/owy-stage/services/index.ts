import { eq } from "drizzle-orm";

import { db } from "../../../db";
import { owyStageState } from "../../../db/schema";
import {
  DEFAULT_STAGE_STATE,
  OWY_STAGE_CHANNEL,
  isSceneId,
  parseSceneParams,
  type StageState,
} from "../../../owy-stage/scenes";
import { publishServer } from "../../../realtime/publish";
import type { FireEffectInput, SetFaceInput, SetSceneInput } from "../schemas";

const ROW_ID = "global";

/**
 * What the wall is showing right now (persisted, so a freshly opened OBS
 * browser source starts on the right scene before any broadcast arrives).
 */
export async function getStageState(): Promise<StageState> {
  const [row] = await db.select().from(owyStageState).where(eq(owyStageState.id, ROW_ID)).limit(1);
  if (!row || !isSceneId(row.scene)) return DEFAULT_STAGE_STATE;

  return { scene: row.scene, params: row.params, eventId: row.eventId };
}

/** Persist the active scene (params validated against the scene's schema) and tell every stage. */
export async function setScene(input: SetSceneInput): Promise<StageState> {
  const params = parseSceneParams(input.scene, input.params) as Record<string, unknown>;
  const eventId = input.eventId === undefined ? (await getStageState()).eventId : input.eventId;
  const state: StageState = { scene: input.scene, params, eventId };

  await db
    .insert(owyStageState)
    .values({ id: ROW_ID, ...state })
    .onConflictDoUpdate({ target: owyStageState.id, set: { scene: state.scene, params, eventId } });

  await publishServer(OWY_STAGE_CHANNEL, "scene", state);

  return state;
}

/** One-shot overlay (confetti, flash, caption…) — broadcast only, nothing to persist. */
export async function fireEffect(input: FireEffectInput): Promise<FireEffectInput> {
  await publishServer(OWY_STAGE_CHANNEL, "effect", input);

  return input;
}

/**
 * Owy's face state + running transcript, pushed by the companion bridge (or the
 * admin simulator) so the wall's Owy mirrors whoever is talking to it.
 */
export async function setFace(input: SetFaceInput): Promise<SetFaceInput> {
  await publishServer(OWY_STAGE_CHANNEL, "face", input);

  return input;
}
