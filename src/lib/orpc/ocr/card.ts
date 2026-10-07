import { Output, streamText, type LanguageModel } from "ai";
import * as z from "zod";

import { UpstreamFailed } from "../errors";
import { AI_TIMEOUT_MS, describeAiFailure, gatewayFallbacks } from "./models";
import type { CardFields, ProcessImageResponse } from "./schemas";

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

type Card = z.infer<typeof CardSchema>;

/** What the staffer gets: the model's reading, plus every field worth a human check. */
function toCardResult(card: Card): ProcessImageResponse {
  return {
    title: card.title ?? "",
    speaker: card.speaker ?? "",
    needsTV: card.requisito === "tv" || card.requisito === "ambos",
    needsWhiteboard: card.requisito === "pizarra" || card.requisito === "ambos",
    requisito: card.requisito,
    revisar: [
      ...card.revisar,
      ...(card.title === null ? (["title"] as const) : []),
      ...(card.speaker === null ? (["speaker"] as const) : []),
      ...(card.requisito === "ilegible" ? (["requisito"] as const) : []),
    ].filter((field, index, all) => all.indexOf(field) === index),
  };
}

export type CardModel = { model: LanguageModel; fallbacks: readonly string[] };

/**
 * Read a photo of a physical card as it streams: `fields` yields the name and
 * title as the model writes them (only when they change), `card` settles with
 * the whole reading. A failed call fails `card` with an `UpstreamFailed` that
 * says why — the stream itself just ends.
 *
 * @param imageData - the photo as a data URL (the camera tab produces one; Owy builds one from
 *   the attachment bytes)
 */
export function streamCard(imageData: string, { model, fallbacks }: CardModel, signal?: AbortSignal) {
  let failure: unknown;
  const reading = streamText({
    model,
    providerOptions: gatewayFallbacks({ fallbacks }),
    temperature: 0,
    // Reading handwriting is perception, not deliberation: extra thinking costs seconds and
    // buys no accuracy on this task.
    reasoning: "low",
    timeout: { totalMs: AI_TIMEOUT_MS },
    abortSignal: signal,
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
            mediaType: mediaTypeOf(imageData),
            data: imageData,
            providerOptions: { openai: { imageDetail: "high" } },
          },
        ],
      },
    ],
    onError: ({ error }) => {
      failure = error;
    },
  });

  async function* fields(): AsyncGenerator<CardFields> {
    let last = "";
    for await (const partial of reading.partialOutputStream) {
      const next = { title: partial.title ?? undefined, speaker: partial.speaker ?? undefined };
      const key = JSON.stringify(next);
      if (key !== last && (next.title || next.speaker)) {
        last = key;
        yield next;
      }
    }
  }

  const card = Promise.resolve(reading.output).then(
    async (output) => {
      const attempts = (await reading.providerMetadata)?.gateway?.modelAttempts;
      if (Array.isArray(attempts) && attempts.length > 1) {
        // Only interesting when the primary model did not serve it: that is the event-day signal
        // that a provider is degraded.
        console.warn("[ocr] gateway fell back to a secondary model:", JSON.stringify(attempts));
      }

      return toCardResult(output);
    },
    (error: unknown) => {
      // The stream only says "no output"; the reason (a rejected account, a rate limit, a
      // timeout) came through onError, and it is what the staffer at the table needs to read.
      throw new UpstreamFailed({
        service: "AI Gateway",
        message: describeAiFailure(failure ?? error),
        cause: failure ?? error,
      });
    }
  );

  // Whoever awaits `card` sees the failure; an abandoned stream must not leave it unhandled.
  void card.catch(() => undefined);

  return { fields, card };
}

/** The whole reading at once, for callers that can't take a stream (Owy, the OCR bench). */
export async function readCard(imageData: string, model: CardModel, signal?: AbortSignal) {
  const { card } = streamCard(imageData, model, signal);

  return card;
}
