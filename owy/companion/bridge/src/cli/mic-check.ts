import { writeFileSync } from "node:fs";
import { HostMic, type HostMicChannel } from "../audio/host-mic";
import { loadConfig } from "../config";
import { createLogger } from "../log";

/**
 * The venue pre-flight for the Mac's own mic (the `host` route): lists the
 * inputs ffmpeg sees, records a few seconds from one and says how loud it was.
 *
 *   pnpm companion:mic-check                       # the inputs
 *   pnpm companion:mic-check DJI [--channel L|R|mix] [--seconds 5]
 *
 * Silence everywhere = the terminal has no Microphone permission (System
 * Settings → Privacy & Security → Microphone) or the receiver is muted.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args.splice(at, 2)[1] : undefined;
  };
  const channel = (flag("channel") ?? "mix") as HostMicChannel;
  const seconds = Number(flag("seconds") ?? 5);
  const name = args[0];
  const config = loadConfig();
  const logger = createLogger("mic", config.COMPANION_LOG_LEVEL);
  const mic = new HostMic({ logger, ffmpeg: config.COMPANION_FFMPEG, channel });
  const inputs = await mic.devices(true);
  if (mic.status().health === "unavailable") throw new Error(mic.status().detail);
  console.log(`Entradas que ve ffmpeg:\n${inputs.map((input) => `  · ${input}`).join("\n") || "  (ninguna)"}`);
  if (!name) return console.log("\nPara grabar, pasá el nombre o una parte: pnpm companion:mic-check DJI");
  mic.select(name, channel);
  console.log(`\nGrabando ${seconds} s de «${mic.status().name ?? "el integrado"}» (${channel})… hablá.`);
  const result = await mic.probe(seconds * 1000);
  mic.close();
  const file = "/tmp/owy-mic-check.wav";
  writeFileSync(file, result.wav);
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  console.log(`estado ${result.health} · pico ${pct(result.peak)} · promedio ${pct(result.rms)} · ${result.seconds.toFixed(1)} s → ${file}`);
  if (result.seconds === 0) console.log("No llegó audio: mirá el estado de arriba (¿ffmpeg pudo abrir la entrada?).");
  else if (result.peak === 0) console.log("Silencio digital: permiso de Micrófono para esta terminal, o el receptor está muteado/apagado.");
  else if (result.peak < 0.02) console.log("Casi nada: ¿es la entrada correcta? ¿el transmisor está lejos o con poca ganancia?");
  // The modo-pitch VAD counts a 20 ms frame as speech over COMPANION_PITCH_VAD_RMS.
  else console.log(`El umbral de voz del pitch es ${pct(config.COMPANION_PITCH_VAD_RMS)} de RMS: el promedio de una frase debería pasarlo.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
