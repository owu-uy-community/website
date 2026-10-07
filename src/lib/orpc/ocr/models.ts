/**
 * Models for the card-capture path, as Vercel AI Gateway slugs (`provider/model`).
 *
 * `ai` resolves a plain slug through the gateway — no provider package needed. Auth is Vercel
 * OIDC on a deployment, `AI_GATEWAY_API_KEY` locally.
 *
 * `fallbacks` is an ordered failover list the gateway walks server-side (in the same request)
 * when every provider for the primary model fails, so a vendor outage on event day degrades
 * instead of going down. `providerMetadata.gateway.modelAttempts` reports which one served.
 *
 * The order is a judgement call over public benchmarks that measured other people's documents,
 * not ours: the Gemini line leads handwritten form-to-JSON extraction, while the models that top
 * the raw-transcription leaderboards all sit above six seconds, which is no use with staff queued
 * at a table. Re-run `scripts/ocr-bench.ts` on real cards before trusting or changing it.
 */

/** Reading handwriting off a photo: picked for structured extraction, not raw transcription. */
export const CARD_OCR_MODEL = {
  primary: "google/gemini-3.8-flash",
  fallbacks: ["google/gemini-3.5-flash-lite", "openai/gpt-5.6-terra"],
} as const;

/**
 * Placing a talk: decision models, not a language model. The only fuzzy judgement left after
 * `buildCandidates` is "is this about the same topic?", which a decision model answers as a yes/no
 * probability in ~0.4 s, where a language model writing a JSON pick took ~1.1–1.4 s for the same
 * placements (measured 2026-10-07 on a labelled board; re-run `pnpm slot:replay --llm` on a real
 * event before changing anything here).
 *
 * jev decides. When it sits on the fence about a topic, the gateway re-runs the whole decision on
 * Luna in the same request (sharper probabilities, ~same speed); d1 answers if a provider errors.
 */
export const SLOT_DECISION_MODEL = {
  primary: "typesafe-ai/jev",
  /** Re-decides when jev is unsure about a topic question. */
  unsure: "openai/gpt-6-luna-decisions",
  /** P(same topic) inside this band counts as unsure. */
  // ponytail: tuned on one labelled board (Luna re-ran ~70% of calls); re-check on real events.
  unsureBand: [0.4, 0.6],
  /** Answers when the primary provider fails. */
  failover: "liquid/d1",
} as const;

/** Decisions answer in well under a second; past this, the first free cell beats waiting. */
export const DECISION_TIMEOUT_MS = 4_000;

/**
 * Hard ceiling per call. The gateway's own failover is much faster than this; the timeout is
 * only here so a hung provider cannot hold a staffer's phone for the function's full duration.
 */
export const AI_TIMEOUT_MS = 20_000;

/** `providerOptions` for a model entry above. */
export function gatewayFallbacks(model: { readonly fallbacks: readonly string[] }) {
  return { gateway: { models: [...model.fallbacks] } };
}

/**
 * Turn a provider or gateway failure into something a staffer at the table can act on.
 *
 * These are not all the same problem: a 403 means someone has to go fix the Vercel account, a 429
 * means wait, a timeout means try again. Swallowing the upstream text is how "AI Gateway requires a
 * valid credit card on file" reached the screen as "verificá la clave de OpenAI" — a key that no
 * longer exists anywhere in this codebase.
 */
export function describeAiFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === "object" && error !== null ? (error as { statusCode?: number }).statusCode : undefined;

  if (status === 401 || status === 403) return `La AI Gateway rechazó el pedido (${status}): ${detail}`;
  if (status === 429) return `La AI Gateway está limitando los pedidos: ${detail}`;

  return `Falló la llamada a la AI: ${detail}`;
}
