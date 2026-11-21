import { entityId } from "esphome-client";
import { loadConfig } from "../config";
import { CompanionDevice } from "../device/esphome";
import { createLogger } from "../log";
import { FACE_STATES } from "../device/esphome";
import { encodeMouth } from "../audio/mouth";
import { sleep } from "../timings";

/**
 * Hardware probe over the native API — no model, no site. Connects to the
 * first device in COMPANION_DEVICES, lists what the firmware exposes, cycles
 * the face, moves the mouth, shows a card and a caption, and counts taps for
 * a few seconds.
 *
 *   COMPANION_DEVICES='owy-knob@192.168.1.56#secrets' pnpm companion:probe
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

  let taps = 0;
  const device = await CompanionDevice.connect(
    spec,
    {
      onTap: () => logger.info(`tap #${++taps}`),
      onRequestStart: () => {},
      onRequestStop: () => {},
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
    entityId("sensor", "taps"),
    entityId("switch", "staff_mode"),
    entityId("switch", "microphone_privacy"),
    entityId("number", "screen_brightness"),
    entityId("sensor", "render_time"),
  ];
  const ids = new Set(entities.map((entity) => entity.id));
  for (const id of required) {
    logger[ids.has(id) ? "info" : "error"](`${ids.has(id) ? "ok " : "MISSING"} ${id}`);
  }
  for (const action of ["show_caption", "show_heard", "express", "mouth_track", "mic_level"])
    logger[services.some((s) => s.name === action) ? "info" : "error"](
      `${services.some((s) => s.name === action) ? "ok " : "MISSING"} action ${action}`
    );
  logger.info(`staff=${device.isStaffMode()} privacy=${String(device.readSetting("privacy"))} brillo=${String(device.readSetting("brightness"))}`);

  for (const face of FACE_STATES.filter((f) => f !== "offline")) {
    device.setFace(face);
    logger.info(`face → ${face}`);
    await sleep(1500);
  }

  // The listening halo follows the Mac's mic: a sweep from quiet to loud.
  device.setFace("listening");
  for (let level = 0; level <= 100; level += 10) {
    device.sendMicLevel?.(level);
    await sleep(120);
  }
  device.showHeard?.("¿qué hay ahora?");

  // The mouth only moves while the face is speaking; a synthetic track opens
  // and closes through every shape (wide → round) for ~1.6 s.
  logger.info("mouth track sweep");
  device.setFace("speaking");
  const sweep = Array.from({ length: 40 }, (_, i) => encodeMouth(Math.abs(Math.sin(i / 3)), Math.sin(i / 7))).join("");
  device.sendMouthTrack?.(sweep, 0);
  device.showCaption?.("Probando la cara, la boca y los subtítulos.");
  await sleep(1800);
  device.setFace("idle");

  logger.info("show card");
  device.showCard({ title: "Lambdas en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:30 - 15:55" });
  await sleep(3000);
  device.showText("Probando el companion 🧉");
  await sleep(2000);
  device.setFace("idle");

  logger.info("tocá la cara: cuento taps por 8 s");
  await sleep(8000);
  logger.info(`probe done (${taps} taps)`);
  device.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
