import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  // LLM-as-judge for tone/grounding checks. eve ≥ 0.62 grades with evaluation
  // models (`t.judge(...)`, probability scores); the gateway's native evaluator
  // is `typesafe-ai/jev` — a plain language-model id would not select an adapter.
  judge: { model: "typesafe-ai/jev" },
  maxConcurrency: 1,
  timeoutMs: 120_000,
});
