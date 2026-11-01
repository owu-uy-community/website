import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEVICE_SAMPLE_RATE, GEMINI_OUTPUT_SAMPLE_RATE, Pcm16Resampler, toWav } from "../audio/pcm";
import { loadConfig } from "../config";
import { buildSessionConfig } from "../index";
import { createLogger } from "../log";
import { PITCH_LINES, SCRIPT_PREFIX } from "../pitch";
import { FALLBACK_LINES } from "../realtime/cascade";
import { resolveRealtimeProvider } from "../realtime/models";
import { NodeRealtimeSession } from "../realtime/session";

/**
 * Renders the fixed pitch-mode cues in Owy's own voice, once, as static WAV
 * files the laptop browser plays at tap time (no model round trip while a
 * person waits): public/companion-audio/clips/<id>.wav + manifest.json.
 * The fallback lines (`offline`, `retry`) are what the bridge plays through
 * the device when there is no network to synthesize anything.
 *
 *   pnpm companion:clips
 *   pnpm companion:talk-clips [--dry-run]   «Owy, en vivo»: every `say` cue with a `clip` in the talk deck
 *
 * The manifest is merged, so recording one set keeps the other.
 */
const CLIPS: Record<string, string> = {
  "pitch-listen": PITCH_LINES.listen,
  "pitch-name": PITCH_LINES.askName,
  "pitch-empty": PITCH_LINES.empty,
  ...FALLBACK_LINES,
};

export const CLIPS_DIR = path.resolve(import.meta.dirname, "../../../../../public/companion-audio/clips");
/** The talk deck lives in the site; read at runtime (a computed path keeps the site out of owy's type-check). */
const DECK = path.resolve(import.meta.dirname, "../../../../../src/lib/owy-stage/talk/deck.ts");

type DeckCue = { mode: string; text: string; clip?: string };

/** The talk's lines to record: `say` cues with a clip id (`{top}` ones are filled in live and never have one). */
export async function talkLines(): Promise<Record<string, string>> {
  const deck = (await import(pathToFileURL(DECK).href)) as { TALK_SLIDES: { cues?: DeckCue[] }[] };
  return Object.fromEntries(
    deck.TALK_SLIDES.flatMap((slide) => slide.cues ?? [])
      .filter((cue): cue is DeckCue & { clip: string } => cue.mode === "say" && !!cue.clip && !cue.text.includes("{top}"))
      .map((cue) => [cue.clip, cue.text])
  );
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const lines = args.has("--talk") ? await talkLines() : CLIPS;
  if (args.has("--dry-run")) {
    for (const [id, text] of Object.entries(lines)) console.log(`${id}: «${text}»`);
    console.log(`${Object.keys(lines).length} líneas → ${CLIPS_DIR}`);
    return;
  }
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
  const manifestPath = path.join(CLIPS_DIR, "manifest.json");
  const manifest: Record<string, number> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

  for (const [id, text] of Object.entries(lines)) {
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
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  session.close();
  logger.info(`listo: ${CLIPS_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
