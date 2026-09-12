import { loadConfig } from "./config";
import { DeviceSession, loadSharedRuntime } from "./index";
import { createLogger } from "./log";
import { startWebBridge } from "./web/server";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";

/** Process entrypoint: `pnpm companion:dev` / `pnpm companion:start`. */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("bridge", config.COMPANION_LOG_LEVEL);
  if (config.devices.length === 0 && !config.COMPANION_WEB_BRIDGE) {
    logger.error("COMPANION_DEVICES vacío: nada que hacer (formato: id@host[:port][#psk]).");
    process.exitCode = 1;
    return;
  }

  const shared = await loadSharedRuntime(config, logger);
  const web = config.COMPANION_WEB_BRIDGE
    ? await startWebBridge(shared, {
        port: config.COMPANION_WEB_PORT,
        origins: config.COMPANION_WEB_ORIGINS.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        secret: config.COMPANION_BRIDGE_SECRET,
        publicUrl: config.COMPANION_BRIDGE_PUBLIC_URL,
      })
    : null;
  if (web) {
    // Local preview's server-only rendezvous. No provider keys, not served as an
    // asset, rotated at every bridge restart and restricted to this OS user.
    const dir = path.resolve(import.meta.dirname, "../../.eve");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "web-bridge.json");
    await writeFile(file, JSON.stringify({ url: web.url, secret: web.secret }), { mode: 0o600 });
    await chmod(file, 0o600);
    logger.info(`web virtual-device transport ready at ${web.url}; same DeviceSession, prompts and tools`);
  }
  const sessions = config.devices.map((spec) => new DeviceSession(spec, shared));
  await Promise.all(sessions.map((session) => session.start()));

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    logger.info("shutting down");
    await web?.close();
    await Promise.all(sessions.map((session) => session.stop()));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
