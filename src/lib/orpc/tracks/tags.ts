import { generateText, Output, type LanguageModel } from "ai";
import * as z from "zod";

import { FORMATS, isFormatId, isTopicId, TOPIC_IDS, topicsFromText, type TrackTags } from "../../openspace/topics";
import { AI_TIMEOUT_MS, CARD_OCR_MODEL, describeAiFailure, gatewayFallbacks } from "../ocr/models";

/** What a card is tagged with the moment it is written, and the answer whenever the model gives none. */
export const keywordTags = (title: string, description?: string | null): TrackTags => ({
  topics: topicsFromText(`${title} ${description ?? ""}`),
  format: null,
});

const INSTRUCTIONS = [
  "Clasificás una charla de un open space de tecnología en Uruguay.",
  `Elegí de 1 a 3 temas de esta lista EXACTA: ${TOPIC_IDS.join(", ")}.`,
  "Usá solo esos identificadores, en minúscula, sin inventar ninguno.",
  "Si no encaja en ninguno, devolvé una lista vacía.",
  `Clasificá también el formato en uno de: ${FORMATS.map((format) => format.id).join(", ")}.`,
  'Una card tipo "¿alguien me cuenta sobre X?" es pregunta, no charla.',
  "Los títulos están escritos a mano y pueden ser informales o ambiguos.",
].join(" ");

/**
 * Tags one card into the fixed topic vocabulary of «Para vos». It runs after the response
 * (`tagSoon` in service.ts), so a slow gateway never holds a staffer at the table, and the public
 * page only ever reads the stored column.
 *
 * Never throws: on any failure the keyword tags are the answer, so an outage on event day makes
 * the ranking coarser instead of removing it.
 */
export async function tagTrack(model: LanguageModel, title: string, description?: string | null): Promise<TrackTags> {
  const fallback = keywordTags(title, description);

  try {
    const { output } = await generateText({
      model,
      providerOptions: gatewayFallbacks(CARD_OCR_MODEL),
      temperature: 0,
      reasoning: "low",
      timeout: { totalMs: AI_TIMEOUT_MS },
      instructions: INSTRUCTIONS,
      output: Output.object({
        name: "track_tags",
        description: "The talk's topics and format",
        schema: z.object({ topics: z.array(z.string()), format: z.string() }),
      }),
      prompt: JSON.stringify({ title, description: description ?? undefined }),
    });

    const topics = output.topics.filter(isTopicId).slice(0, 3);

    return {
      topics: topics.length > 0 ? topics : fallback.topics,
      format: isFormatId(output.format) ? output.format : null,
    };
  } catch (error) {
    // A warning, not an error: the keyword tags are a real answer, only coarser.
    console.warn(`[tracks] Tagging «${title}» fell back to keywords. ${describeAiFailure(error)}`);

    return fallback;
  }
}
