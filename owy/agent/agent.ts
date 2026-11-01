import { defineAgent } from "eve";

import { MODELS } from "./lib/models";

export default defineAgent({
  // Vercel AI Gateway model id (lib/models.ts). On Vercel the deployment authenticates via
  // project OIDC; locally set AI_GATEWAY_API_KEY. The gateway tries the fallbacks, in order,
  // when the brain errors.
  model: MODELS.brain,
  modelOptions: { providerOptions: { gateway: { models: [...MODELS.brainFallbacks] } } },

  // Bound accidental or adversarial sessions (a public community bot gets
  // long threads); eve pauses interactive sessions at these limits.
  limits: {
    sessionUsage: ({ window }) => window.inputTokens >= 500_000 || window.outputTokens >= 50_000,
  },
});
