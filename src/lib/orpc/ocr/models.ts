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

/** Picking a slot: text-only and tiny, so the fastest model wins. */
export const SLOT_PICK_MODEL = {
  primary: "google/gemini-3.5-flash-lite",
  fallbacks: ["google/gemini-3.8-flash", "openai/gpt-5.6-terra"],
} as const;

/**
 * Hard ceiling per call. The gateway's own failover is much faster than this; the timeout is
 * only here so a hung provider cannot hold a staffer's phone for the function's full duration.
 */
export const AI_TIMEOUT_MS = 20_000;

/** `providerOptions` for a model entry above. */
export function gatewayFallbacks(model: { readonly fallbacks: readonly string[] }) {
  return { gateway: { models: [...model.fallbacks] } };
}
