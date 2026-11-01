import { execFileSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { owuApi, owuApiUrl } from "../../../agent/lib/owu-api";
import { loadConfig, loadEnvLocal, type BridgeConfig } from "./config";
import { ControlChannel, realtimeUrl } from "./control/channel";
import { ControlPlane, SettingsStore, STATE_PATH } from "./control/plane";
import { TalkSeat } from "./control/seat";
import { CompanionDevice } from "./device/esphome";
import { DeviceSession, loadSharedRuntime } from "./index";
import { createLogger } from "./log";
import { createStageMirror } from "./stage";
import { COMPANION_CHANNEL, OWY_TALK_CHANNEL, type BridgeStatus } from "./web/contract";
import { startWebBridge } from "./web/server";
import { startSettingsServer } from "./web/settings";

/** The code this bridge runs (git short sha in a checkout; COMPANION_VERSION in an image). */
function version(): string {
  if (process.env.COMPANION_VERSION) return process.env.COMPANION_VERSION.slice(0, 40);
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: import.meta.dirname, encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

/**
 * The config: env (and owy/.env.local), with the bridge settings the panel set on top — the
 * last ones the site gave this bridge, cached on disk. A cached value the schema rejects
 * never keeps the bridge down: it starts on env alone and reports which one failed.
 */
function bootConfig(store: SettingsStore): { config: BridgeConfig; rejected: BridgeStatus["rejected"] } {
  loadEnvLocal();
  const overrides = store.envOverrides();
  try {
    return { config: loadConfig({ ...process.env, ...overrides }), rejected: [] };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    const config = loadConfig({ ...process.env });
    return { config, rejected: Object.keys(overrides).map((env) => ({ target: "bridge", key: env, error: reason })) };
  }
}

/** Process entrypoint: `pnpm companion:serve` (restarts it), `companion:start`, `companion:dev`. */
async function main(): Promise<void> {
  const store = new SettingsStore(STATE_PATH);
  const { config, rejected } = bootConfig(store);
  const logger = createLogger("bridge", config.COMPANION_LOG_LEVEL);
  if (rejected.length) logger.error(`los ajustes guardados no cargan (${rejected[0].error}); arranco con el env`);
  // A bug in one turn costs that turn: log it and keep Owy up. An exception that unwound the stack
  // leaves state nobody can trust: exit, and the supervisor (companion:serve, Docker) restarts us in a second.
  process.on("unhandledRejection", (reason) => logger.error("unhandled rejection (kept running)", reason));
  process.on("uncaughtException", (error) => {
    logger.error("uncaught exception; exiting for a clean restart", error);
    process.exit(1);
  });
  if (config.devices.length === 0 && !config.COMPANION_WEB_BRIDGE) {
    logger.error("COMPANION_DEVICES vacío: nada que hacer (formato: id@host[:port][#psk]).");
    process.exitCode = 1;
    return;
  }

  const shared = await loadSharedRuntime(config, logger);
  shared.sessions = new Map();
  let channel: ControlChannel | null = null;
  shared.publishStage = (event, payload) => channel?.publish("owy-stage", event, payload) ?? false;
  const web = config.COMPANION_WEB_BRIDGE
    ? await startWebBridge(shared, {
        port: config.COMPANION_WEB_PORT,
        host: config.COMPANION_BIND_HOST,
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

  let control: ControlPlane | null = null;
  // Each gadget mirrors its face and captions onto the video wall (/owy/stage).
  const sessions = config.devices.map((device) => {
    // The panel can move a board to another IP (DHCP churn at a venue); its key stays in secrets.yaml.
    const host = store.desired(device.id, "host")?.value;
    const spec = typeof host === "string" && host ? { ...device, host } : device;
    const mirror = createStageMirror({
      api: config.OWY_API_KEY ? owuApi() : null,
      logger: logger.child(spec.id),
      source: spec.id,
      publish: shared.publishStage,
    });
    const session: DeviceSession = new DeviceSession(spec, shared, {
      connectDevice: async (...args) => mirror.wrap(await CompanionDevice.connect(...args)),
      onFace: mirror.face,
      onTranscript: mirror.transcript,
      onExpression: mirror.expression,
      onMouth: mirror.mouth,
      onTool: (event) => mirror.tool(event.status === "running" ? event.name : null),
      onSetting: (key, value, setBy) => control?.deviceSetting(session, key, value, setBy),
      onLinkUp: () => control?.linkUp(session),
      settings: {
        get: (target, key) => control?.value(target, key),
        set: (target, key, value) => control?.change(target, key, value, "voz") ?? { ok: false, error: "sin panel" },
      },
    });
    return session;
  });
  for (const session of sessions) shared.sessions.set(session.id, session);

  let stopping = false;
  const shutdown = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    logger.info("shutting down");
    channel?.stop();
    seat?.stop();
    control?.stop();
    await web?.close();
    await settings?.close();
    await Promise.all(sessions.map((session) => session.stop()));
    shared.hostMic?.close();
    shared.hostSpeaker?.close();
    process.exit(code);
  };

  const api = config.OWY_API_KEY ? owuApi() : null;
  control = new ControlPlane({
    config,
    shared,
    sessions,
    store,
    logger,
    version: version(),
    rejected,
    ...(api ? { report: (input) => api.companion.report(input) } : {}),
    // Not 0: companion:serve and Docker start it again; Ctrl-C (0) stops it for good.
    restart: () => void shutdown(75),
  });
  const plane = control;
  const seat = api ? new TalkSeat({ config, sessions, plane, beat: (status) => api.owyStage.talkStatus(status), logger }) : null;
  channel = config.OWY_API_KEY
    ? new ControlChannel({
        url: config.COMPANION_SITE_WS_URL ?? realtimeUrl(owuApiUrl()),
        apiKey: config.OWY_API_KEY,
        channels: [COMPANION_CHANNEL, OWY_TALK_CHANNEL],
        logger,
        onEvent: (ch, ev, pl) => {
          plane.onEvent(ch, ev, pl);
          seat?.onEvent(ch, ev, pl);
        },
        onOpen: () => plane.reportSoon(0),
      })
    : null;
  if (!channel) logger.warn("sin OWY_API_KEY: el panel del sitio no llega a este bridge (corre con sus ajustes guardados y el env)");

  const settings = await startSettingsServer(sessions, config, logger, shared.hostMic).catch((error) => {
    logger.warn(`settings UI not started: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  if (settings) logger.info(`settings UI at ${settings.url} · oRPC at ${settings.rpcUrl} (audio routing per device)`);

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  control.start();
  seat?.start();
  channel?.start();
  // Each board on its own: one that is off keeps retrying, one with a wrong key fails alone.
  for (const session of sessions)
    void session.start().catch((error: unknown) => logger.error(`${session.id}: no arrancó`, error));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
