import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlacedTrackResponse, StickyNote } from "../../../agent/lib/owu-api";
import type { Logger } from "./log";
import type { CompleteDraft, PitchDraft, Placement } from "./pitch-flow";
import type { ScreenCard } from "./realtime/tools";
import type { PitchRuntime } from "./runtime";
import { TIMINGS, within, withTimeout } from "./timings";

/**
 * Modo pitch's side of the board (the site's open-space grid): placing a card
 * once and never twice, asking whether a pitch is already there, and keeping a
 * pitch the bridge could not place for the staff. Nothing here touches a
 * device: DeviceSession hands these to the visitor's PitchFlow.
 */

const isConflict = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "CONFLICT";

/** A 4xx said no for sure; anything else (a timeout, a dropped connection, a 5xx) may or may not have written. */
const isAmbiguous = (error: unknown): boolean => {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  return !(typeof status === "number" && status >= 400 && status < 500);
};

/**
 * One card on the board, never two. A slow write is never raced by a
 * second one: past TIMINGS.placeTimeoutMs the bridge looks for the card and keeps
 * waiting on the same request. Only a request that is over and failed
 * ambiguously (dropped connection, 5xx) is tried again, once, after
 * looking for its card — so a bad network costs neither the pitch nor a duplicate.
 */
export async function placePitch(
  runtime: PitchRuntime,
  draft: CompleteDraft,
  since: number,
  { log, authorize }: { log: Logger; authorize?: (tool: string) => string | null }
): Promise<Placement> {
  const denial = authorize?.("create_track");
  if (denial) return { denied: denial };
  const openSpaceId = await runtime.openSpaceId();
  const input = {
    openSpaceId,
    title: draft.title,
    speaker: draft.speaker ?? undefined,
    description: draft.description ?? undefined,
    needsTV: draft.needsTV,
    needsWhiteboard: draft.needsWhiteboard,
    source: "companion",
  };
  const found = async (): Promise<ScreenCard | null> => {
    const note = await findPlaced(runtime, openSpaceId, draft.title, since, log);
    if (!note) return null;
    log.info(`pitch: la charla «${note.title}» ya estaba en la grilla (${note.room} ${note.timeSlot})`);
    return { title: note.title, speaker: note.speaker, room: note.room, timeSlot: note.timeSlot };
  };
  const request = runtime.api.tracks.createPlaced(input);
  let outcome = await within(request, TIMINGS.placeTimeoutMs);
  if ("late" in outcome) {
    log.warn(`pitch: la grilla tarda más de ${TIMINGS.placeTimeoutMs / 1000} s; me fijo si la charla ya quedó y sigo esperando`);
    const card = await found();
    if (card) return card;
    outcome = await within(request, TIMINGS.placeTimeoutMs);
    if ("late" in outcome) throw new Error(`la grilla no contestó en ${(2 * TIMINGS.placeTimeoutMs) / 1000} s`);
  }
  let placed: PlacedTrackResponse;
  if ("error" in outcome) {
    const error = outcome.error;
    if (isConflict(error)) return "full";
    if (!isAmbiguous(error)) throw error;
    log.warn("pitch: la grilla no contestó claro; me fijo si la charla quedó antes de reintentar", error);
    const card = await found();
    if (card) return card;
    try {
      placed = await withTimeout(runtime.api.tracks.createPlaced(input), TIMINGS.placeTimeoutMs);
    } catch (retryError) {
      if (isConflict(retryError)) return "full";
      throw retryError;
    }
  } else placed = outcome.value;
  const card: ScreenCard = {
    title: placed.note.title,
    speaker: placed.note.speaker ?? undefined,
    room: placed.note.room ?? placed.placement.room,
    timeSlot: placed.note.timeSlot ?? placed.placement.timeSlot,
  };
  log.info(`pitch: charla creada «${card.title}» → ${card.room} ${card.timeSlot} (${placed.placement.reasoning})`);
  return card;
}

/** The card on the board that is this same talk (asked while Owy may still be asking for the name). */
export async function findDuplicatePitch(
  runtime: PitchRuntime,
  draft: CompleteDraft,
  signal: AbortSignal,
  log: Logger
): Promise<ScreenCard | null> {
  if (!runtime.dedupe) return null;
  const started = Date.now();
  const notes = await withTimeout(runtime.api.tracks.list({ openSpaceId: await runtime.openSpaceId() }), TIMINGS.placeTimeoutMs);
  const index = await runtime.dedupe.find(
    { title: draft.title, description: draft.description, transcript: draft.transcript },
    notes,
    signal
  );
  log.info(`pitch: ¿ya está en la grilla? ${index === null ? "no" : `sí, «${notes[index].title}»`} (${notes.length} cards, ${Date.now() - started} ms)`);
  if (index === null) return null;
  const note = notes[index];
  return { title: note.title, speaker: note.speaker ?? undefined, room: note.room, timeSlot: note.timeSlot };
}

/** The talk this flow created, if the write landed after all. */
async function findPlaced(runtime: PitchRuntime, openSpaceId: string, title: string, since: number, log: Logger): Promise<StickyNote | null> {
  const want = title.trim().toLowerCase();
  try {
    const notes = await withTimeout(runtime.api.tracks.list({ openSpaceId }), TIMINGS.placeTimeoutMs);
    return (
      notes.find(
        (note) =>
          note.title.trim().toLowerCase() === want && (!note.createdAt || Date.parse(note.createdAt) >= since - 60_000)
      ) ?? null
    );
  } catch (error) {
    log.warn("pitch: tampoco pude leer la grilla", error);
    return null;
  }
}

/** A pitch the bridge could not place, kept for the staff (COMPANION_LOG_DIR only: a visitor's voice stays nowhere else). */
export function savePitchFailure(
  dir: string | undefined,
  deviceId: string,
  reason: string,
  draft: PitchDraft | null,
  wav: Buffer,
  log: Logger
): void {
  if (!dir) return;
  const base = path.join(dir, "pitch-failures", `${new Date().toISOString().replace(/[:.]/g, "-")}-${deviceId}`);
  void mkdir(path.dirname(base), { recursive: true })
    .then(() =>
      Promise.all([
        writeFile(`${base}.wav`, wav),
        writeFile(`${base}.json`, JSON.stringify({ reason, device: deviceId, draft }, null, 2)),
      ])
    )
    .then(() => log.warn(`pitch: guardado para el staff en ${base}.wav`))
    .catch((error: unknown) => log.warn("pitch: no pude guardar el pitch fallido", error));
}
