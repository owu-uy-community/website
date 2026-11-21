import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";
import { createLogger } from "../log";
import { gatewayCascade } from "../realtime/cascade";
import { EveLink } from "../realtime/eve-link";
import { resolveRealtimeProvider } from "../realtime/models";
import { NodeRealtimeSession } from "../realtime/session";
import { buildSessionConfig, voiceFor } from "../realtime/session-config";
import { cascadeOptions, realtimeKeys, realtimeSpecs } from "../runtime";

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
  const keys = realtimeKeys(config);

  await measure("DNS ai-gateway.vercel.sh", 300, async () => (await lookup("ai-gateway.vercel.sh")).address);
  await measure("HTTPS al gateway", 800, async () => {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/models", { signal: AbortSignal.timeout(10_000) });
    return `HTTP ${response.status}`;
  });

  // Each realtime tier on its own: token + handshake, exactly as a device connects.
  for (const tier of realtimeSpecs(config)) {
    await measure(`realtime ${tier}`, 5000, async () => {
      const provider = resolveRealtimeProvider(tier, keys);
      const session = new NodeRealtimeSession({
        provider,
        sessionConfig: buildSessionConfig({
          provider,
          instructions: "Sos Owy.",
          voice: voiceFor(provider, config),
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
        return provider.voice ? `voz ${provider.voice}` : "";
      } finally {
        session.close();
      }
    });
  }

  // The cascade, one model at a time, through the calls a turn makes (zero data retention included).
  const options = cascadeOptions(config, logger);
  // Owy's own pre-rendered voice is a real Spanish sentence to transcribe.
  const clip = readFileSync(path.resolve(import.meta.dirname, "../../../../../public/companion-audio/clips/pitch-listen.wav"));
  for (const model of options.transcribeModels) {
    await measure(`transcribir ${model}`, 3000, async () => {
      const text = await gatewayCascade({ ...options, transcribeModels: [model] }).transcribe(clip, AbortSignal.timeout(15_000));
      return text ? `«${text.slice(0, 60)}»` : "(vacío)";
    });
  }
  const firstAudio = async (cascade: ReturnType<typeof gatewayCascade>) => {
    for await (const pcm of cascade.speak("Hola, soy Owy. ¿En qué te ayudo?", AbortSignal.timeout(20_000)))
      return `${(pcm.length / 32).toFixed(0)} ms de audio a 16 kHz`;
    throw new Error("sin audio");
  };
  for (const model of options.speechModels)
    await measure(`voz ${model} (${options.speechVoice})`, 3000, () =>
      firstAudio(gatewayCascade({ ...options, speechModels: [model], speechStreamModel: undefined }))
    );
  if (options.speechStreamModel)
    await measure(`voz de respaldo ${options.speechStreamModel}`, 2000, () =>
      firstAudio(gatewayCascade({ ...options, speechModels: [] }))
    );
  for (const model of [options.textModel, ...options.textFallbacks])
    await measure(`texto ${model}`, 3000, async () => {
      const answer = await gatewayCascade({ ...options, textModel: model, textFallbacks: [] }).answer({
        text: "Decime hola en tres palabras.",
        history: [],
        instructions: "Sos Owy. Una frase corta.",
        tools: {},
        signal: AbortSignal.timeout(20_000),
      });
      return `«${answer.slice(0, 60)}»`;
    });

  if (config.COMPANION_EVE_URL) {
    const eve = new EveLink({ url: config.COMPANION_EVE_URL, apiKey: config.OWY_API_KEY ?? null, logger });
    await measure(`eve ${config.COMPANION_EVE_URL}`, 4000, async () => {
      try {
        const result = await eve.turn("netcheck", "Hola, ¿me escuchás? Contestá en una frase.", {
          staff: false,
          marketplaceOpen: false,
          eventName: config.COMPANION_EVENT_NAME,
          signal: AbortSignal.timeout(30_000),
        });
        return `«${result.text.slice(0, 60)}»`;
      } finally {
        await eve.reset("netcheck");
      }
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
