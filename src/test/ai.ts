import type { Experimental_DecisionModel, LanguageModel } from "ai";
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

/** A provider that is down: every call fails at once (and is not retried). */
export function downModel() {
  const fail = async (): Promise<never> => {
    throw Object.assign(new Error("Service Unavailable"), { statusCode: 503 });
  };

  return new MockLanguageModelV4({ doStream: fail, doGenerate: fail });
}

type DecisionModelV4 = Extract<Experimental_DecisionModel, { doDecide: unknown }>;
type DecideOptions = Parameters<DecisionModelV4["doDecide"]>[0];

/**
 * A decision model that answers every yes/no question with `probability(instructions)`, and keeps
 * what it was asked in `calls`.
 */
export function decidingModel(probability: (instructions: string) => number = () => 0.1) {
  const calls: DecideOptions[] = [];
  const model: DecisionModelV4 = {
    specificationVersion: "v4",
    provider: "mock",
    modelId: "mock-decisions",
    supportedQuestionTypes: ["boolean", "choice", "score"],
    doDecide: async (options) => {
      calls.push(options);

      return {
        answers: Object.fromEntries(
          Object.entries(options.questions).map(([id, question]) => [
            id,
            { type: "boolean" as const, probability: probability(String(question.instructions)) },
          ])
        ),
        warnings: [],
      };
    },
  };

  return Object.assign(model, { calls });
}

/** A decision provider that is down: every call fails at once. */
export function downDecisionModel() {
  return decidingModel(() => {
    throw Object.assign(new Error("Service Unavailable"), { statusCode: 503 });
  });
}

/** The `ai` override for `by(...)`: the card reader gets `card`, the slot picker `pick`. */
export const models = ({ card, pick }: { card?: LanguageModel; pick?: Experimental_DecisionModel }) => ({
  model: (slug: string): LanguageModel => (slug === CARD_OCR_MODEL.primary ? (card ?? downModel()) : downModel()),
  decisionModel: (): Experimental_DecisionModel => pick ?? downDecisionModel(),
});
