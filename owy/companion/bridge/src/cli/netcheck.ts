import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createGateway, experimental_streamSpeech } from "ai";
import { loadConfig } from "../config";
import { buildSessionConfig, isGeminiModel } from "../index";
import { createLogger } from "../log";
import { gatewayCascade } from "../realtime/cascade";
import { parseModelSpecs, resolveRealtimeProvider } from "../realtime/models";
import { NodeRealtimeSession } from "../realtime/session";

/**
 * The venue's network, measured the morning of the event: how long each piece
 * of Owy's voice takes from this laptop, and whether the timeouts fit.
 *
 *   pnpm companion:netcheck
 *
 * Exit code 1 when something fails outright.
 */

interface Row {
  what: string;
  ms: number | null;
  warnMs: number;
  detail: string;
}

const rows: Row[] = [];

async function measure(what: string, warnMs: number, fn: () => Promise<string | void>): Promise<void> {
  const started = Date.now();
  try {
    const detail = (await fn()) ?? "";
    rows.push({ what, ms: Date.now() - started, warnMs, detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rows.push({ what, ms: null, warnMs, detail: message.split("\n")[0].slice(0, 120) });
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("netcheck", "error");
  const keys = { googleApiKey: config.GOOGLE_GENERATIVE_AI_API_KEY, gatewayApiKey: config.AI_GATEWAY_API_KEY };

  await measure("DNS ai-gateway.vercel.sh", 300, async () => (await lookup("ai-gateway.vercel.sh")).address);
  await measure("HTTPS al gateway", 800, async () => {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/models", { signal: AbortSignal.timeout(10_000) });
    return `HTTP ${response.status}`;
  });

  // Each realtime tier on its own: token + handshake, exactly as a device connects.
  for (const spec of [config.COMPANION_REALTIME_MODEL, ...parseModelSpecs(config.COMPANION_REALTIME_FALLBACKS)]) {
    await measure(`realtime ${spec}`, 5000, async () => {
      const provider = resolveRealtimeProvider(spec, keys);
      const session = new NodeRealtimeSession({
        provider,
        sessionConfig: buildSessionConfig({
          provider,
          instructions: "Sos Owy.",
          voice: isGeminiModel(provider.modelId) ? config.COMPANION_VOICE : config.COMPANION_FALLBACK_VOICE,
          tools: [],
          modality: "audio",
        }),
        tokenTimeoutMs: config.COMPANION_TOKEN_TIMEOUT_MS,
        connectTimeoutMs: config.COMPANION_REALTIME_CONNECT_MS,
        logger,
        onToolCall: () => ({}),
      });
      try {
        await session.connect();
      } finally {
        session.close();
      }
    });
  }

  const cascade = gatewayCascade({
    apiKey: config.AI_GATEWAY_API_KEY,
    transcribeModels: parseModelSpecs(config.COMPANION_TRANSCRIBE_MODELS),
    ttsModel: config.COMPANION_TTS_MODEL,
    ttsVoice: config.COMPANION_TTS_VOICE ?? config.COMPANION_VOICE,
    textModel: config.COMPANION_TEXT_MODEL,
    textFallbacks: parseModelSpecs(config.COMPANION_TEXT_FALLBACK_MODELS),
    logger,
  });
  // Owy's own pre-rendered voice is a real Spanish sentence to transcribe.
  const clip = path.resolve(import.meta.dirname, "../../../../../public/companion-audio/clips/pitch-listen.wav");
  await measure("cascada: transcribir 4 s", 3000, async () => {
    const text = await cascade.transcribe(readFileSync(clip), AbortSignal.timeout(15_000));
    return text ? `«${text.slice(0, 60)}»` : "(vacío)";
  });
  await measure("cascada: primer audio TTS", 2000, async () => {
    const result = experimental_streamSpeech({
      model: createGateway(config.AI_GATEWAY_API_KEY ? { apiKey: config.AI_GATEWAY_API_KEY } : {}).speechModel(
        config.COMPANION_TTS_MODEL
      ),
      text: "Hola, soy Owy.",
      voice: config.COMPANION_TTS_VOICE ?? config.COMPANION_VOICE,
      outputFormat: { type: "audio/pcm", rate: 24_000 },
      abortSignal: AbortSignal.timeout(15_000),
    });
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error instanceof Error ? part.error : new Error(String(part.error));
      if (part.type === "audio" && part.audio.length > 0) return `${part.audioFormat.type} ${part.audioFormat.rate ?? ""}`;
    }
    throw new Error("sin audio");
  });

  if (config.COMPANION_EVE_URL) {
    const url = config.COMPANION_EVE_URL;
    await measure(`eve ${url}`, 1500, async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return `HTTP ${response.status}`;
    });
  }
  await measure(`sitio ${config.COMPANION_PUBLIC_SITE_URL}`, 1500, async () => {
    const response = await fetch(config.COMPANION_PUBLIC_SITE_URL, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    return `HTTP ${response.status}`;
  });

  let failed = false;
  console.log("");
  for (const row of rows) {
    const status = row.ms === null ? "FALLA" : row.ms > row.warnMs ? "lento" : "ok";
    if (row.ms === null) failed = true;
    console.log(
      `${status.padEnd(6)} ${row.what.padEnd(48)} ${row.ms === null ? "-".padStart(7) : `${row.ms} ms`.padStart(7)}  ${row.detail}`
    );
  }
  console.log(
    `\nTimeouts actuales: token ${config.COMPANION_TOKEN_TIMEOUT_MS} ms · conexión realtime ${config.COMPANION_REALTIME_CONNECT_MS} ms · ack ${config.COMPANION_ACK_MS} ms`
  );
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
