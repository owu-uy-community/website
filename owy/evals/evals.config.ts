import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  // LLM-as-judge for tone/grounding checks; routed through the AI Gateway.
  judge: { model: "anthropic/claude-haiku-4-5" },
  maxConcurrency: 1,
  timeoutMs: 120_000,
});
