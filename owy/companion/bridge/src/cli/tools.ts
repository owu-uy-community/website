import { experimental_getRealtimeToolDefinitions } from "ai";
import { loadConfig } from "../config";
import { createLogger } from "../log";
import { loadPromptBundle } from "../realtime/prompt";
import { buildCompanionToolSet, loadOwyToolDefinitions, type ToolRuntime } from "../realtime/tools";

/**
 * Prints the tool set the voice model would see (names, descriptions and the
 * JSON schemas derived from Owy's zod schemas) plus the size of the system
 * prompt. No model, no device, no site: a quick sanity check after editing
 * agent tools or the prompts.
 *
 *   pnpm companion:tools            # summary
 *   pnpm companion:tools --json     # full realtime tool definitions
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("tools", "warn");
  const runtime: ToolRuntime = {
    deviceId: "inspect",
    isStaff: () => config.COMPANION_STAFF_MODE,
    isMarketplaceOpen: () => config.COMPANION_MARKETPLACE_OPEN,
    proposalCooldownMs: 0,
    logger,
  };

  const [definitions, prompt] = await Promise.all([loadOwyToolDefinitions(), loadPromptBundle()]);
  const tools = buildCompanionToolSet(definitions, runtime);
  const realtime = await experimental_getRealtimeToolDefinitions({ tools });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(realtime, null, 2));
    return;
  }

  console.log(`system prompt: ${prompt.system.length} chars (${prompt.knowledge.length} knowledge files)`);
  console.log(`${realtime.length} tools:`);
  for (const definition of realtime) {
    const params = Object.keys((definition.parameters as { properties?: Record<string, unknown> }).properties ?? {});
    console.log(`  - ${definition.name}(${params.join(", ")})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
