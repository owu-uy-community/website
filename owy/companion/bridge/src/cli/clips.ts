import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEVICE_SAMPLE_RATE, GEMINI_OUTPUT_SAMPLE_RATE, Pcm16Resampler, toWav } from "../audio/pcm";
import { loadConfig } from "../config";
import { buildSessionConfig } from "../index";
import { createLogger } from "../log";
import { PITCH_LINES, SCRIPT_PREFIX } from "../pitch";
import { resolveRealtimeProvider } from "../realtime/models";
import { NodeRealtimeSession } from "../realtime/session";

/**
 * Renders the fixed pitch-mode cues in Owy's own voice, once, as static WAV
 * files the laptop browser plays at tap time (no model round trip while a
 * person waits): public/companion-audio/clips/<id>.wav + manifest.json.
 *
 *   pnpm companion:clips
 */
const CLIPS: Record<string, string> = {
  "pitch-listen": PITCH_LINES.listen,
  "pitch-name": PITCH_LINES.askName,
  "pitch-empty": PITCH_LINES.empty,
};

export const CLIPS_DIR = path.resolve(import.meta.dirname, "../../../../../public/companion-audio/clips");

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("clips", config.COMPANION_LOG_LEVEL);
  const provider = resolveRealtimeProvider(config.COMPANION_REALTIME_MODEL, {
    googleApiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
    gatewayApiKey: config.AI_GATEWAY_API_KEY,
  });
  const session = new NodeRealtimeSession({
    provider,
    sessionConfig: buildSessionConfig({
      provider,
      instructions:
        "Sos la voz de Owy, la mascota de OWU: cálida, rioplatense, ritmo tranquilo. Cuando un mensaje empieza con [GUION], decí el texto que sigue textual y completo, sin agregar ni quitar nada.",
      voice: config.COMPANION_VOICE,
      tools: [],
      modality: "audio",
    }),
    logger: logger.child("gemini"),
    onToolCall: () => ({}),
    onEvent: (event) => current?.(event),
  });
  let current: ((event: Parameters<NonNullable<ConstructorParameters<typeof NodeRealtimeSession>[0]["onEvent"]>>[0]) => void) | null = null;
  await session.connect();
  mkdirSync(CLIPS_DIR, { recursive: true });
  const manifest: Record<string, number> = {};

  for (const [id, text] of Object.entries(CLIPS)) {
    const pcm = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const resampler = new Pcm16Resampler(GEMINI_OUTPUT_SAMPLE_RATE, DEVICE_SAMPLE_RATE);
      const timeout = setTimeout(() => reject(new Error(`sin respuesta para ${id}`)), 30_000);
      current = (event) => {
        if (event.type === "audio-delta") chunks.push(resampler.process(Buffer.from(event.delta, "base64")));
        if (event.type === "response-done") {
          clearTimeout(timeout);
          resolve(Buffer.concat(chunks));
        }
        if (event.type === "error") {
          clearTimeout(timeout);
          reject(new Error(event.message));
        }
      };
      session.sendText(SCRIPT_PREFIX + text);
    });
    const ms = Math.round(pcm.length / ((DEVICE_SAMPLE_RATE * 2) / 1000));
    writeFileSync(path.join(CLIPS_DIR, `${id}.wav`), toWav(pcm, DEVICE_SAMPLE_RATE));
    manifest[id] = ms;
    logger.info(`${id}: ${(ms / 1000).toFixed(1)} s — «${text}»`);
  }
  writeFileSync(path.join(CLIPS_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  session.close();
  logger.info(`listo: ${CLIPS_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
