import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import { AI_TIMEOUT_MS, describeAiFailure, gatewayFallbacks, SLOT_PICK_MODEL } from "../orpc/ocr/models";
import { FORMATS, isFormatId, isTopicId, TOPIC_IDS, topicsFromText, type TrackTags } from "./topics";

/**
 * Tags one card into the fixed topic vocabulary, at the moment it is written.
 *
 * Tagging belongs on the write path, not the read path: a card's topics do not
 * change between page loads, so asking a model on every render paid for the
 * same answer repeatedly and put the gateway between a visitor and a page that
 * has nothing to do with AI. Written once here, `/openspace` just reads a column.
 *
 * Never throws. Falls back to keyword tagging, so a card is never left untagged
 * because the gateway was unreachable while staff were at the table.
 */
export async function tagTrack(title: string, description?: string | null): Promise<TrackTags> {
  const fallback: TrackTags = { topics: topicsFromText(`${title} ${description ?? ""}`), format: null };

  try {
    const { output } = await generateText({
      model: SLOT_PICK_MODEL.primary,
      providerOptions: gatewayFallbacks(SLOT_PICK_MODEL),
      temperature: 0,
      timeout: { totalMs: AI_TIMEOUT_MS },
      output: Output.object({
        name: "track_tags",
        schema: z.object({ topics: z.array(z.string()), format: z.string() }),
      }),
      instructions: [
        "Clasificás una charla de un open space de tecnología en Uruguay.",
        `Elegí de 1 a 3 temas de esta lista EXACTA: ${TOPIC_IDS.join(", ")}.`,
        "Usá solo esos identificadores, en minúscula, sin inventar ninguno.",
        "Si no encaja en ninguno, devolvé una lista vacía.",
        `Clasificá también el formato en uno de: ${FORMATS.map((format) => format.id).join(", ")}.`,
        'Una card tipo "¿alguien me cuenta sobre X?" es pregunta, no charla.',
        "Los títulos están escritos a mano y pueden ser informales o ambiguos.",
      ].join(" "),
      prompt: JSON.stringify({ title, description: description ?? undefined }),
    });

    const topics = output.topics.filter(isTopicId).slice(0, 3);

    return {
      topics: topics.length > 0 ? topics : fallback.topics,
      format: isFormatId(output.format) ? output.format : null,
    };
  } catch (error) {
    /*
     * Warn, not error: the keyword tags below are a real answer, so the card is
     * saved either way and only the ranking is coarser.
     */
    console.warn(`[OpenSpace] Tagging "${title}" fell back to keywords. ${describeAiFailure(error)}`);

    return fallback;
  }
}
