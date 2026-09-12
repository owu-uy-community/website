import { createInterface } from "node:readline";
import { experimental_getRealtimeToolDefinitions } from "ai";
import { loadConfig } from "../config";
import { buildSessionConfig, loadSharedRuntime } from "../index";
import { createLogger } from "../log";
import { NodeRealtimeSession } from "../realtime/session";
import { buildCompanionToolSet, executeToolByName, type ScreenCommand, type ToolRuntime } from "../realtime/tools";

/**
 * Text REPL: the same persona, knowledge and tools as the device, but typed.
 * Gemini Live sessions are single-modality, so this opens a text-output
 * session (no audio, no device) — perfect for checking the marketplace
 * script and staff gating before touching hardware.
 *
 *   COMPANION_STAFF_MODE=1 COMPANION_MARKETPLACE_OPEN=1 pnpm companion:text
 */

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("text", config.COMPANION_LOG_LEVEL);
  const shared = await loadSharedRuntime(config, logger);

  const runtime: ToolRuntime = {
    deviceId: "repl",
    isStaff: () => config.COMPANION_STAFF_MODE,
    isMarketplaceOpen: () => config.COMPANION_MARKETPLACE_OPEN,
    proposalCooldownMs: config.COMPANION_PROPOSAL_COOLDOWN_S * 1000,
    gridUrl: shared.gridUrl,
    onScreen: (command: ScreenCommand) => console.log(`\n[pantalla] ${JSON.stringify(command)}`),
    logger,
  };
  const tools = buildCompanionToolSet(shared.definitions, runtime);
  const sessionConfig = buildSessionConfig({
    provider: shared.provider,
    instructions: shared.instructions,
    voice: config.COMPANION_VOICE,
    tools: await experimental_getRealtimeToolDefinitions({ tools }),
    modality: "text",
  });

  let responding = false;
  const session = new NodeRealtimeSession({
    provider: shared.provider,
    sessionConfig,
    logger: logger.child("gemini"),
    onToolCall: async ({ callId, name, args }) => {
      console.log(`\n[tool] ${name} ${JSON.stringify(args)}`);
      const result = await executeToolByName(tools, name, args, callId);
      console.log(`[tool] ${name} → ${JSON.stringify(result).slice(0, 600)}`);
      return result;
    },
    onEvent: (event) => {
      switch (event.type) {
        case "text-delta":
          if (!responding) {
            process.stdout.write("owy> ");
            responding = true;
          }
          process.stdout.write(event.delta);
          break;
        case "response-done":
          if (responding) process.stdout.write("\n");
          responding = false;
          rl.prompt();
          break;
        case "error":
          console.error(`\n[error] ${event.message}`);
          rl.prompt();
          break;
        default:
          break;
      }
    },
    onClose: () => {
      console.log("\n[sesión cerrada]");
      process.exit(0);
    },
  });

  await session.connect();
  console.log(
    `Owy companion (texto) — modelo ${shared.provider.spec}, staff=${config.COMPANION_STAFF_MODE}, mercado=${config.COMPANION_MARKETPLACE_OPEN}. Escribí y Enter; Ctrl+C para salir.`
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "vos> " });
  rl.prompt();
  rl.on("line", (line) => {
    const text = line.trim();
    if (text.length === 0) {
      rl.prompt();
      return;
    }
    if (text === "/reconnect") {
      void session.reconnect().then(() => rl.prompt());
      return;
    }
    session.sendText(text);
  });
  rl.on("close", () => {
    session.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
