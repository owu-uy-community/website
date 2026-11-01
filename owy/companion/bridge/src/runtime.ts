import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveActiveEvent } from "../../../agent/lib/board";
import { owuApi, type OwuApi } from "../../../agent/lib/owu-api";
import { HostMic } from "./audio/host-mic";
import { HostSpeaker } from "./audio/host-speaker";
import { DEVICE_SAMPLE_RATE, fromWav } from "./audio/pcm";
import type { BridgeConfig } from "./config";
import { jevClassifier, type Classifier } from "./expression";
import type { DeviceSession } from "./index";
import type { Logger } from "./log";
import { PITCH_CLIPS, gatewayDuplicateFinder, gatewayPitchExtractor, type DuplicateFinder, type PitchExtractor } from "./pitch";
import { gatewayCascade, loadFallbackClips, type Cascade, type FallbackClip, type GatewayCascadeOptions } from "./realtime/cascade";
import { EveLink } from "./realtime/eve-link";
import { parseModelSpecs, resolveRealtimeProvider, type RealtimeProvider } from "./realtime/models";
import { loadPromptBundle, loadVoiceOfOwyPrompt } from "./realtime/prompt";
import { loadOwyToolDefinitions, resolveGridUrl, type OwyToolDefinition } from "./realtime/tools";

/**
 * What every device session shares, loaded once from the config: the realtime
 * tiers, the brain, the cascade, modo pitch, the clips, the Mac's mic. The CLIs
 * (netcheck, clips, text) build their pieces with these same loaders.
 */

/** Everything a device session needs and that is shared across devices. */
export interface SharedRuntime {
  config: BridgeConfig;
  provider: RealtimeProvider;
  definitions: Map<string, OwyToolDefinition>;
  instructions: string;
  gridUrl: string | undefined;
  logger: Logger;
  /** Provider codecs contain turn counters; each device must own its codec. */
  createProvider?: () => RealtimeProvider;
  /** Physical device sessions by id, so a browser can attach as one's laptop audio. */
  sessions?: Map<string, DeviceSession>;
  /**
   * `eve`: the eve Owy answers (agent/channels/companion.ts) and the realtime
   * model only hears/speaks; `local`: the realtime model is the brain with the
   * agent's tools in-process. Absent = `local` (tests, older callers).
   */
  brain?: "eve" | "local";
  eve?: EveLink;
  /** Faces while Owy talks (COMPANION_EXPRESSIONS); `classify` absent = local guesses only. */
  expressions?: { classify?: Classifier };
  /** Modo pitch (the open space's marketplace); absent = a pitch run ends with "sin configurar". */
  pitch?: PitchRuntime;
  /** Realtime models tried after the primary (COMPANION_REALTIME_FALLBACKS); each device owns its codecs. */
  createFallbackProviders?: () => RealtimeProvider[];
  /** The voice loop without a realtime model; absent = a tap with no live model is declined (old behaviour). */
  cascade?: Cascade;
  /** Pre-rendered fallback lines, 16 kHz PCM (`pnpm companion:clips`). */
  fallbackClips?: Partial<Record<FallbackClip, Buffer>>;
  /** Every recorded clip by id → duration (ms): the clips manifest (pitch cues, the talk's lines). */
  clips?: Record<string, number>;
  /** An input of the Mac running the bridge (`mic: host`); absent in Docker and in browser sessions. */
  hostMic?: HostMic;
  /** The Mac's own output (`output: host`, the room's PA); `unavailable` in Docker. */
  hostSpeaker?: HostSpeaker;
  /** eve brain: the local brain's prompt, for when eve does not answer (the realtime model keeps `instructions`). */
  localInstructions?: string;
  /** Until when eve is skipped after failing (ms epoch); shared by every device of this bridge. */
  eveDownUntil?: number;
  /** Publishes on the wall's realtime channel over the bridge's socket (set once it exists); false when down. */
  publishStage?: (event: string, payload: unknown) => boolean;
}

export interface PitchRuntime {
  extract: PitchExtractor;
  api: Pick<OwuApi, "tracks">;
  /** The event the knob proposes into (OWY_EVENT_ID or the active one), resolved on first use. */
  openSpaceId: () => Promise<string>;
  /** Pre-rendered cues by id → duration (ms); empty = Owy says the cues through the model. */
  clips: Record<string, number>;
  /** The same cues as 16 kHz PCM, for the board's own speaker (the browser plays the files). */
  clipPcm?: Record<string, Buffer>;
  /** Is this talk already on the board? (a decision model; absent = never checked, COMPANION_PITCH_DEDUPE=off) */
  dedupe?: DuplicateFinder;
}

function loadExpressions(config: BridgeConfig, logger: Logger): SharedRuntime["expressions"] {
  if (config.COMPANION_EXPRESSIONS === "off") return undefined;
  if (config.COMPANION_EXPRESSIONS === "jev" && config.AI_GATEWAY_API_KEY) {
    logger.info(`expresiones: ${config.COMPANION_EXPRESSION_MODEL} (AI Gateway) + estimación local`);
    return { classify: jevClassifier({ apiKey: config.AI_GATEWAY_API_KEY, model: config.COMPANION_EXPRESSION_MODEL }) };
  }
  if (config.COMPANION_EXPRESSIONS === "jev") logger.warn("expresiones: sin AI_GATEWAY_API_KEY, sólo estimación local");
  return {};
}

const CLIPS_DIR = path.resolve(import.meta.dirname, "../../../../public/companion-audio/clips");
const CLIPS_MANIFEST = path.join(CLIPS_DIR, "manifest.json");

/** The cascade's models as configured (netcheck tries them one by one with the same options). */
export function cascadeOptions(config: BridgeConfig, logger: Logger): GatewayCascadeOptions {
  return {
    apiKey: config.AI_GATEWAY_API_KEY,
    transcribeModels: parseModelSpecs(config.COMPANION_TRANSCRIBE_MODELS),
    // The old single-model variable still wins when someone set it.
    speechModels: parseModelSpecs(config.COMPANION_TTS_MODEL ?? config.COMPANION_TTS_MODELS),
    speechVoice: config.COMPANION_TTS_VOICE ?? config.COMPANION_VOICE,
    speechStreamModel: config.COMPANION_TTS_STREAM_MODEL || undefined,
    textModel: config.COMPANION_TEXT_MODEL,
    textFallbacks: parseModelSpecs(config.COMPANION_TEXT_FALLBACK_MODELS),
    logger: logger.child("cascada"),
  };
}

/** The voice loop without a realtime model: needs the gateway (transcribe, answer, speak). */
export function loadCascade(config: BridgeConfig, logger: Logger): Pick<SharedRuntime, "cascade" | "fallbackClips"> {
  if (config.COMPANION_CASCADE === "off") return {};
  if (!config.AI_GATEWAY_API_KEY) {
    logger.warn("cascada: falta AI_GATEWAY_API_KEY; sin modelo realtime, los toques se rechazan");
    return {};
  }
  return { cascade: gatewayCascade(cascadeOptions(config, logger)), fallbackClips: loadFallbackClips(CLIPS_DIR, logger) };
}

/** Recorded clips by id → ms (`pnpm companion:clips`, `companion:talk-clips`); empty = Owy says every line live. */
function loadClips(logger: Logger): Record<string, number> {
  try {
    return z.record(z.string(), z.number()).parse(JSON.parse(readFileSync(CLIPS_MANIFEST, "utf8")));
  } catch {
    logger.info("sin audios pregrabados (pnpm companion:clips); Owy dice los avisos con el modelo");
    return {};
  }
}

/** 16 kHz mono PCM of each recorded clip on disk, by id (the board's speaker plays these; missing ones are skipped). */
export function loadClipPcm(dir: string, ids: string[]): Record<string, Buffer> {
  const clips: Record<string, Buffer> = {};
  for (const id of ids) {
    try {
      const wav = fromWav(readFileSync(path.join(dir, `${id}.wav`)));
      if (wav.sampleRate === DEVICE_SAMPLE_RATE && wav.channels === 1) clips[id] = wav.pcm;
    } catch {
      // Not recorded yet (`pnpm companion:clips`): Owy says that line live.
    }
  }
  return clips;
}

/** Modo pitch needs the gateway (audio → card) and the site (the board); without either, pitches end in words only. */
function loadPitch(
  config: BridgeConfig,
  logger: Logger,
  clips: Record<string, number>,
  cascade: Cascade | undefined
): SharedRuntime["pitch"] {
  if (!config.AI_GATEWAY_API_KEY || !config.OWY_API_KEY) {
    logger.warn("modo pitch: falta AI_GATEWAY_API_KEY u OWY_API_KEY; los pitches no se van a cargar");
    return undefined;
  }
  let openSpaceId: Promise<string> | null = null;
  const clipPcm = loadClipPcm(CLIPS_DIR, Object.values(PITCH_CLIPS));
  logger.info(`modo pitch: avisos grabados ${Object.keys(clipPcm).join(", ") || "ninguno (los dice el modelo)"}`);
  return {
    extract: gatewayPitchExtractor({
      apiKey: config.AI_GATEWAY_API_KEY,
      model: config.COMPANION_PITCH_MODEL,
      fallbacks: parseModelSpecs(config.COMPANION_PITCH_FALLBACK_MODELS),
      thinking: config.COMPANION_PITCH_THINKING,
      hedgeModel: config.COMPANION_PITCH_HEDGE_MODEL || undefined,
      hedgeAfterMs: config.COMPANION_PITCH_HEDGE_MS,
      eventName: config.COMPANION_EVENT_NAME,
      // The audio model down: the cascade's transcription, then the text model on the words.
      ...(cascade
        ? {
            transcribe: (wav: Buffer, signal: AbortSignal) => cascade.transcribe(wav, signal),
            textModel: config.COMPANION_TEXT_MODEL,
            textFallbacks: parseModelSpecs(config.COMPANION_TEXT_FALLBACK_MODELS),
          }
        : {}),
      logger: logger.child("pitch"),
    }),
    clipPcm,
    dedupe: config.COMPANION_PITCH_DEDUPE === "on" ? gatewayDuplicateFinder({ apiKey: config.AI_GATEWAY_API_KEY }) : undefined,
    api: owuApi(),
    // A talk's demo grid (COMPANION_PITCH_EVENT_ID) wins over OWY_EVENT_ID; eve keeps its own event for questions.
    openSpaceId: () =>
      (openSpaceId ??= resolveActiveEvent(config.COMPANION_PITCH_EVENT_ID)
        .then((event) => event.id)
        .catch((error: unknown) => {
          openSpaceId = null;
          throw error;
        })),
    clips,
  };
}

/** Keys for the realtime providers (direct Google, or the AI Gateway). */
export const realtimeKeys = (config: BridgeConfig) => ({
  googleApiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
  gatewayApiKey: config.AI_GATEWAY_API_KEY,
});

/** The primary realtime tier and its fallbacks as configured (`spec#voice`), the primary first. */
export function realtimeSpecs(config: BridgeConfig): string[] {
  const primary = config.COMPANION_REALTIME_MODEL;
  const bare = (spec: string) => spec.replace(/#.*$/, "");
  return [primary, ...parseModelSpecs(config.COMPANION_REALTIME_FALLBACKS).filter((spec) => bare(spec) !== bare(primary))];
}

export async function loadSharedRuntime(config: BridgeConfig, logger: Logger): Promise<SharedRuntime> {
  const keys = realtimeKeys(config);
  const createProvider = () => resolveRealtimeProvider(config.COMPANION_REALTIME_MODEL, keys);
  const provider = createProvider();
  const fallbackSpecs = realtimeSpecs(config).slice(1);
  const createFallbackProviders = () =>
    fallbackSpecs.flatMap((spec) => {
      try {
        return [resolveRealtimeProvider(spec, keys)];
      } catch (error) {
        logger.warn(`respaldo realtime ${spec} ignorado: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    });
  const fallback = { createFallbackProviders, ...loadCascade(config, logger) };
  logger.info(
    `respaldos: ${fallbackSpecs.join(", ") || "ninguno"}; cascada ${fallback.cascade ? "lista" : "apagada"}${
      fallback.cascade ? ` (avisos pregrabados: ${Object.keys(fallback.fallbackClips ?? {}).join(", ") || "ninguno"})` : ""
    }`
  );

  let gridUrl: string | undefined;
  try {
    gridUrl = await resolveGridUrl(config.COMPANION_PUBLIC_SITE_URL);
  } catch (error) {
    logger.warn("could not resolve the public grid URL (site API unreachable?)", error);
  }

  const brain = config.COMPANION_BRAIN ?? (config.COMPANION_EVE_URL ? "eve" : "local");
  const expressions = loadExpressions(config, logger);
  const clips = loadClips(logger);
  const pitch = loadPitch(config, logger, clips, fallback.cascade);
  const hostMic = new HostMic({
    logger: logger.child("mic"),
    ffmpeg: config.COMPANION_FFMPEG,
    name: config.COMPANION_HOST_MIC,
    channel: config.COMPANION_HOST_MIC_CHANNEL,
    gainDb: config.COMPANION_HOST_MIC_GAIN_DB,
  });
  const hostSpeaker = new HostSpeaker({
    logger: logger.child("parlante"),
    ffmpeg: config.COMPANION_FFMPEG,
    name: config.COMPANION_HOST_SPEAKER,
    latencyMs: config.COMPANION_HOST_SPEAKER_LATENCY_MS,
    tailMs: config.COMPANION_HOST_SPEAKER_TAIL_MS,
  });
  if (brain === "eve") {
    if (!config.COMPANION_EVE_URL) throw new Error("COMPANION_BRAIN=eve necesita COMPANION_EVE_URL");
    const eve = new EveLink({
      url: config.COMPANION_EVE_URL,
      apiKey: config.OWY_API_KEY ?? null,
      logger: logger.child("eve"),
    });
    // The local brain stands by: when eve does not answer, the text model answers with every tool.
    const [instructions, definitions, local] = await Promise.all([
      loadVoiceOfOwyPrompt({ eventName: config.COMPANION_EVENT_NAME }),
      loadOwyToolDefinitions(),
      loadPromptBundle({ gridUrl }),
    ]);
    logger.info(
      `model ${provider.spec} (voz); cerebro: eve en ${config.COMPANION_EVE_URL}, local de respaldo con ${definitions.size} tools; grid ${gridUrl ?? "-"}`
    );
    return {
      config,
      provider,
      createProvider,
      definitions,
      instructions,
      localInstructions: local.system,
      gridUrl,
      logger,
      brain,
      eve,
      expressions,
      pitch,
      clips,
      hostMic,
      hostSpeaker,
      ...fallback,
    };
  }

  const [definitions, prompt] = await Promise.all([loadOwyToolDefinitions(), loadPromptBundle({ gridUrl })]);
  logger.info(`model ${provider.spec}; cerebro local con ${definitions.size} owy tools; grid ${gridUrl ?? "-"}`);
  return {
    config,
    provider,
    createProvider,
    definitions,
    instructions: prompt.system,
    gridUrl,
    logger,
    brain,
    expressions,
    pitch,
    clips,
    hostMic,
    hostSpeaker,
    ...fallback,
  };
}
