import { defineAgent } from "eve";

export default defineAgent({
  // Vercel AI Gateway model id. On Vercel the deployment authenticates via
  // project OIDC; locally set AI_GATEWAY_API_KEY. Swap the string to change model.
  model: "anthropic/claude-sonnet-5",

  // Bound accidental or adversarial sessions (a public community bot gets
  // long threads); eve pauses interactive sessions at these limits.
  limits: {
    maxInputTokensPerSession: 500_000,
    maxOutputTokensPerSession: 50_000,
  },
});
