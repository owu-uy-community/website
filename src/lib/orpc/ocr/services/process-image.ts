import { generateText, Output } from "ai";
import { z } from "zod";
import type { ProcessImageInput, ProcessImageResponse } from "../schemas";
import { AI_TIMEOUT_MS, CARD_OCR_MODEL, gatewayFallbacks } from "../models";

/**
 * The card is a fixed pre-print, so describing it exactly is free accuracy: the model never has
 * to infer the layout, only read what was written on it.
 *
 * Every rule here earns its place. Enumerating the three REQUISITOS options in the schema (rather
 * than describing them in prose) and making "nothing marked" a first-class answer are the two
 * biggest levers measured in the handwritten-forms literature — the characteristic failure is a
 * model inferring a selection from the layout alone. Nullable fields plus `revisar` give it a way
 * to admit it cannot read something; without that affordance models invent a plausible name
 * instead.
 */
const INSTRUCTIONS = `You read handwritten talk-proposal cards from an open-space event of the Uruguayan agile community ("agile uy"). Everything handwritten is in Rioplatense Spanish: names, and talk titles that mix Spanish with English tech terms.

THE CARD (a fixed pre-printed landscape template, black frame, three stacked sections):
1. "NOMBRE" — printed label, bold, upper-left, followed by a ruled line. The handwriting on or next to that line is WHO GIVES THE TALK.
2. "CHARLA" — printed label, bold, followed by a ruled line. The handwriting on or next to that line is the TALK TITLE.
3. "REQUISITOS" — printed label, followed by exactly three black circular icons, left to right:
   a. a retro TV set with antenna  -> "tv"
   b. a whiteboard on a stand with a marker tray -> "pizarra"
   c. the word "NO" -> "ninguno"
   Each of those three icons has an EMPTY WHITE CIRCLE WITH A THICK BLACK OUTLINE overlapping its
   upper-right corner. That circle is the checkbox.
4. Bottom-right: the "agile uy" logo. It is pre-printed. Ignore it completely.

READING THE CHECKBOXES:
- A checkbox counts as marked only when it contains pen or marker strokes (an X, a tick, a fill, a
  scribble) or is visibly ringed or pointed at.
- A clean white circle is UNMARKED. The solid black disc of the icon itself is printed artwork, not
  a mark — never read it as one.
- Usually exactly one is marked. If the "NO" checkbox is marked, answer "ninguno". If none of the
  three is marked, answer "ninguno" as well. Never infer a selection from the layout, from the
  topic of the talk, or from which icon looks darkest. Only ink counts.
- Answer "ambos" only if both the TV and the whiteboard checkboxes carry marks.
- Answer "ilegible" only when there is clearly something written in that section but you cannot
  tell which checkbox it belongs to.

TRANSCRIBING:
- Copy the handwriting verbatim. Keep Spanish spelling, accents and ñ. Do not translate, do not
  rephrase, do not expand abbreviations, do not "correct" a name or a title to something more
  plausible. Fix only obvious capitalisation.
- NOMBRE is the speaker and CHARLA is the title. Never swap them.
- The photo comes from a phone at the venue: expect rotation, skew, shadows, glare and a hand
  holding the card.
- If a line is blank or you genuinely cannot read it, return null for that field. A null is far
  more useful to the staffer than an invented name. List every field you are unsure about in
  "revisar" — including ones you did fill in.`;

const CardSchema = z.object({
  transcripcion: z
    .string()
    .describe("Every handwritten stroke on the card, verbatim, before deciding which field is which"),
  speaker: z.string().nullable().describe("The handwriting on the NOMBRE line, or null if blank/unreadable"),
  title: z.string().nullable().describe("The handwriting on the CHARLA line, or null if blank/unreadable"),
  requisito: z
    .enum(["tv", "pizarra", "ambos", "ninguno", "ilegible"])
    .describe("Which REQUISITOS checkbox carries a handwritten mark"),
  revisar: z
    .array(z.enum(["speaker", "title", "requisito"]))
    .describe("Fields a human should double-check because the handwriting was not clear"),
});

/** `data:image/png;base64,…` → `image/png`. Anything else: let the provider sniff the bytes. */
function mediaTypeOf(dataUrl: string): string {
  return dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "image";
}

/**
 * Extract the talk information from a photo of a physical card.
 *
 * @param imageData - the photo as a data URL (the camera tab produces one; Owy builds one from
 *   the attachment bytes)
 */
export async function processImage(
  input: ProcessImageInput,
  /** Overridden by `scripts/ocr-bench.ts` to score one model at a time. */
  model: { readonly primary: string; readonly fallbacks: readonly string[] } = CARD_OCR_MODEL
): Promise<ProcessImageResponse> {
  try {
    const { output, providerMetadata } = await generateText({
      model: model.primary,
      providerOptions: gatewayFallbacks(model),
      temperature: 0,
      // Reading handwriting is perception, not deliberation: extra thinking costs seconds and
      // buys no accuracy on this task.
      reasoning: "low",
      timeout: { totalMs: AI_TIMEOUT_MS },
      instructions: INSTRUCTIONS,
      output: Output.object({
        name: "open_space_card",
        description: "Fields read off a handwritten open-space talk card",
        schema: CardSchema,
      }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this card." },
            {
              type: "file",
              mediaType: mediaTypeOf(input.imageData),
              data: input.imageData,
              providerOptions: { openai: { imageDetail: "high" } },
            },
          ],
        },
      ],
    });

    const attempts = providerMetadata?.gateway?.modelAttempts;

    if (Array.isArray(attempts) && attempts.length > 1) {
      // Only interesting when the primary model did not serve it: that is the event-day signal
      // that a provider is degraded.
      console.warn("[ocr] gateway fell back to a secondary model:", JSON.stringify(attempts));
    }

    return {
      title: output.title ?? "",
      speaker: output.speaker ?? "",
      needsTV: output.requisito === "tv" || output.requisito === "ambos",
      needsWhiteboard: output.requisito === "pizarra" || output.requisito === "ambos",
      requisito: output.requisito,
      revisar: [
        ...output.revisar,
        ...(output.title === null ? (["title"] as const) : []),
        ...(output.speaker === null ? (["speaker"] as const) : []),
        ...(output.requisito === "ilegible" ? (["requisito"] as const) : []),
      ].filter((field, index, all) => all.indexOf(field) === index),
    };
  } catch (error) {
    console.error("Error in processImage:", error);
    throw new Error("Failed to process image with OCR");
  }
}
