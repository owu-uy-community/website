import type { LanguageModel } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { CARD_OCR_MODEL } from "lib/orpc/ocr/models";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const finish = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: undefined },
  logprobs: undefined,
  usage,
};

/** A model that streams `text` in the given pieces (structured output is JSON text). */
export function streamingModel(pieces: string[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start" as const, id: "t" },
          ...pieces.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          { type: "text-end" as const, id: "t" },
          finish,
        ],
      }),
    }),
  });
}

/** A model that answers `output` as JSON in one go. */
export function generatingModel(output: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(output) }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

/** A provider that is down: every call fails at once (and is not retried). */
export function downModel() {
  const fail = async (): Promise<never> => {
    throw Object.assign(new Error("Service Unavailable"), { statusCode: 503 });
  };

  return new MockLanguageModelV4({ doStream: fail, doGenerate: fail });
}

/** The `ai` override for `by(...)`: the card reader gets `card`, everything else `pick`. */
export const models = ({ card, pick }: { card?: LanguageModel; pick?: LanguageModel }) => ({
  model: (slug: string): LanguageModel =>
    slug === CARD_OCR_MODEL.primary ? (card ?? downModel()) : (pick ?? downModel()),
});
