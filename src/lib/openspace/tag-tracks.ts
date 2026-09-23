import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import { AI_TIMEOUT_MS, describeAiFailure, gatewayFallbacks, SLOT_PICK_MODEL } from "../orpc/ocr/models";
import { FORMATS, isFormatId, isTopicId, TOPIC_IDS, topicsFromText, type TrackTags } from "./topics";

/**
 * Tags an event's talks into the fixed topic vocabulary, so "Para vos" can rank
 * them against what a visitor said they care about.
 *
 * One call for the whole board rather than one per card: the board is a few
 * dozen short strings, and the open space generates them in bursts during the
 * mercado de ideas — per-card calls would mean forty requests in twenty
 * minutes for no better answer.
 *
 * Never throws. A gateway outage on event day falls back to keyword tagging,
 * because a rough ranking is worth more than an error state on someone's phone.
 */

export type TrackTopics = Record<string, TrackTags>;

type Taggable = { id: string; title: string; description?: string };

/** Tagging the same board twice costs money and returns the same answer. */
const cache = new Map<string, TrackTopics>();
const MAX_CACHE_ENTRIES = 32;

/** Cache key: the talks themselves, so a new or edited card invalidates it. */
function fingerprint(tracks: readonly Taggable[]): string {
  return tracks
    .map((track) => `${track.id}:${track.title}:${track.description ?? ""}`)
    .sort()
    .join("|");
}

function keywordTags(tracks: readonly Taggable[]): TrackTopics {
  return Object.fromEntries(
    tracks.map((track) => [
      track.id,
      { topics: topicsFromText(`${track.title} ${track.description ?? ""}`), format: null },
    ])
  );
}

const ResponseSchema = z.object({
  tracks: z.array(z.object({ id: z.string(), topics: z.array(z.string()), format: z.string() })),
});

export async function tagTracks(tracks: readonly Taggable[]): Promise<TrackTopics> {
  if (tracks.length === 0) return {};

  const key = fingerprint(tracks);
  const cached = cache.get(key);
  if (cached) return cached;

  const fallback = keywordTags(tracks);

  try {
    const { output } = await generateText({
      model: SLOT_PICK_MODEL.primary,
      providerOptions: gatewayFallbacks(SLOT_PICK_MODEL),
      temperature: 0,
      timeout: { totalMs: AI_TIMEOUT_MS },
      output: Output.object({ name: "track_topics", schema: ResponseSchema }),
      instructions: [
        "Clasificás charlas de un open space de tecnología en Uruguay.",
        `Etiquetá cada una con 1 a 3 temas de esta lista EXACTA: ${TOPIC_IDS.join(", ")}.`,
        "Usá solo esos identificadores, en minúscula, sin inventar ninguno.",
        "Si una charla no encaja en ninguno, devolvé una lista vacía.",
        `Además clasificá el formato en uno de: ${FORMATS.map((f) => f.id).join(", ")}.`,
        'Una card tipo "¿alguien me cuenta sobre X?" es pregunta, no charla.',
        "Los títulos están escritos a mano y pueden ser informales o ambiguos.",
      ].join(" "),
      prompt: JSON.stringify(
        tracks.map((track) => ({ id: track.id, title: track.title, description: track.description ?? undefined }))
      ),
    });

    const tagged: TrackTopics = { ...fallback };
    for (const row of output.tracks) {
      // Trust the ids we sent, not the ones it echoes back.
      if (!(row.id in fallback)) continue;
      const topics = row.topics.filter(isTopicId).slice(0, 3);
      tagged[row.id] = {
        topics: topics.length > 0 ? topics : fallback[row.id].topics,
        format: isFormatId(row.format) ? row.format : null,
      };
    }

    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(key, tagged);

    return tagged;
  } catch (error) {
    /*
     * Not rethrown, and warn rather than error: the keyword tagger below is a
     * real answer, so nothing is broken — the ranking is just coarser. Without
     * AI_GATEWAY_API_KEY this is the normal local path, and logging it as an
     * error put a red overlay over a page that had rendered fine.
     */
    console.warn(`[OpenSpace] Topic tagging fell back to keywords. ${describeAiFailure(error)}`);

    return fallback;
  }
}
