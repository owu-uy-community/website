import { entityId } from "esphome-client";
import { loadConfig } from "../config";
import { CompanionDevice } from "../device/esphome";
import { createLogger } from "../log";
import { FACE_STATES } from "../device/esphome";

/**
 * Hardware probe over the native API — no Gemini, no site. Connects to the
 * first device in COMPANION_DEVICES, lists what the firmware exposes, cycles
 * the face, plays the test tone, shows a card and reads the mode switches.
 *
 *   COMPANION_DEVICES='owy-1@owy-companion.local#<api_key>' pnpm companion:probe
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("probe", config.COMPANION_LOG_LEVEL);
  const spec = config.devices[0];
  if (!spec) {
    logger.error("COMPANION_DEVICES vacío (formato: id@host[:port][#psk]).");
    process.exitCode = 1;
    return;
  }

  const device = await CompanionDevice.connect(
    spec,
    {
      onRequestStart: (request) => {
        logger.info(`pipeline start received (wake="${request.wakeWordPhrase ?? ""}") — declining, this is only a probe`);
        device.declineRequest();
      },
      onRequestStop: () => logger.info("pipeline stop received"),
      onAudio: () => {},
    },
    logger
  );

  const info = device.client.deviceInfo();
  logger.info(`device: ${info?.name} · esphome ${info?.esphomeVersion} · mac ${info?.macAddress}`);
  const caps = device.client.capabilities();
  logger.info(`capabilities: ${JSON.stringify(caps)}`);

  const entities = device.client.getEntitiesWithIds();
  logger.info(`${entities.length} entities:`);
  for (const entity of entities) logger.info(`  ${entity.id}  (${entity.name})`);
  const services = device.client.services.list();
  logger.info(`${services.length} actions: ${services.map((s) => s.name).join(", ")}`);

  const required = [
    entityId("select", "face_state"),
    entityId("switch", "staff_mode"),
    entityId("switch", "marketplace_open"),
    entityId("switch", "quiet_mode"),
    entityId("number", "speak_level"),
  ];
  const ids = new Set(entities.map((entity) => entity.id));
  for (const id of required) {
    logger[ids.has(id) ? "info" : "error"](`${ids.has(id) ? "ok " : "MISSING"} ${id}`);
  }

  logger.info(`modes: staff=${device.isStaffMode()} marketplace=${device.isMarketplaceOpen()} quiet=${device.isQuietMode()}`);

  for (const face of FACE_STATES.filter((f) => f !== "offline")) {
    device.setFace(face);
    logger.info(`face → ${face}`);
    await sleep(1500);
  }

  logger.info("speak level sweep");
  for (let i = 0; i <= 10; i++) {
    device.setSpeakLevel(Math.abs(Math.sin(i / 2)), Date.now() + i * 1000);
    await sleep(120);
  }
  device.setSpeakLevel(0, Date.now() + 20_000);

  logger.info("test tone");
  device.client.command(entityId("button", "tono_de_prueba"), {});
  await sleep(1500);

  logger.info("show card");
  device.showCard({ title: "Lambdas en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:30 - 15:55" });
  await sleep(3000);
  device.showText("Probando el companion 🧉");
  await sleep(2000);
  device.setFace("idle");

  logger.info("probe done");
  device.close();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
