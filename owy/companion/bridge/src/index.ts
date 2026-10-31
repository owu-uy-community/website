import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  experimental_getRealtimeToolDefinitions,
  tool,
  type Experimental_RealtimeServerEvent as RealtimeServerEvent,
  type Experimental_RealtimeSessionConfig as RealtimeSessionConfig,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { VoiceAssistantEvent, type VoiceAssistantAudioData, type VoiceAssistantRequest } from "esphome-client";
import {
  DEVICE_SAMPLE_RATE,
  FrameChunker,
  GEMINI_OUTPUT_SAMPLE_RATE,
  PacedSpeaker,
  Pcm16Resampler,
  bytesForMs,
  rmsLevel,
} from "./audio/pcm";
import { MouthTrack } from "./audio/mouth";
import { ExpressionDirector, jevClassifier, type Classifier } from "./expression";
import { audioRoute, type AudioRoute } from "./audio/route";
import { loadConfig, type BridgeConfig, type DeviceSpec } from "./config";
import { CompanionDevice } from "./device/esphome";
import type { DeviceHandlers } from "./device/esphome";
import type { AudioPeer, DeviceTransport } from "./device/transport";
import { AsyncLocalStorage } from "node:async_hooks";
import { VoiceTurn, type VoiceLink } from "./device/pipeline";
import { faceForPhase } from "./face";
import { createLogger, type Logger } from "./log";
import { FALLBACK_LINES, gatewayCascade, loadFallbackClips, type Cascade, type FallbackClip } from "./realtime/cascade";
import { EveLink } from "./realtime/eve-link";
import { parseModelSpecs, resolveRealtimeProvider, type RealtimeProvider } from "./realtime/models";
import { resolveActiveEvent } from "../../../agent/lib/board";
import { owuApi, type OwuApi, type PlacedTrackResponse } from "../../../agent/lib/owu-api";
import {
  PITCH_LIMITS,
  PITCH_LINES,
  PitchRecorder,
  SCRIPT_PREFIX,
  announcementText,
  gatewayPitchExtractor,
  isPitchRun,
  type PitchCard,
  type PitchExtractor,
  type PitchKind,
} from "./pitch";
import { loadPromptBundle, loadVoiceOfOwyPrompt } from "./realtime/prompt";
import { NodeRealtimeSession, type SessionStatus } from "./realtime/session";
import {
  buildCompanionToolSet,
  executeToolByName,
  loadOwyToolDefinitions,
  resolveGridUrl,
  type FaceState,
  type OwyToolDefinition,
  type ScreenCard,
  type ScreenCommand,
  type ToolRuntime,
} from "./realtime/tools";

/**
 * owy companion bridge — one process per venue laptop.
 *
 * For every configured device it keeps one ESPHome native-API connection and
 * one Gemini Live session, and turns each device-initiated voice run into a
 * realtime conversation turn. See `companion/README.md` for the runbook.
 */

const OUTPUT_FRAME_BYTES = bytesForMs(32, DEVICE_SAMPLE_RATE); // 1024 B, the device's own chunk size

/**
 * How a turn is answered. Fixed when the tap is accepted (a socket that comes
 * up mid-utterance serves the next turn, never two answers to one), except that
 * a realtime turn whose socket dies moves to the cascade once.
 *   realtime: the primary realtime model · fallback: a backup realtime model
 *   cascade: recorded + transcribed + answered + spoken by plain gateway calls
 *   offline: not even that worked; a pre-rendered line · pitch: modo pitch
 */
export type TurnPath = "realtime" | "fallback" | "cascade" | "offline" | "pitch";

/** A connect already under way gets this long before a physical tap is answered through the cascade instead. */
const ACCEPT_WAIT_MS = 1_500;
/** Transcribe + eve/text model + first TTS audio, with room for a slow network. */
const CASCADE_THINKING_MS = 45_000;
/** The gateway caps a realtime session at 25 min; renew it between turns well before. */
const ROTATE_AFTER_MS = 20 * 60_000;
const KEEP_WARM_EVERY_MS = 30_000;
/** A voice turn's own recorder: a pause this long ends the utterance (the realtime model has its own VAD). */
const TURN_LIMITS = { silenceMs: 900, maxMs: 30_000, minSpeechMs: 300 };
/** Provider errors that are noise, not a broken turn (an OpenAI commit after its server VAD already committed, etc.). */
const BENIGN_ERROR_CODES = new Set([
  "input_audio_buffer_commit_empty",
  "conversation_already_has_active_response",
  "response_cancel_not_active",
]);
/** Cascade TTS has no transcript marks: roughly how fast Owy speaks, to cue faces per sentence. */
// ponytail: fixed speaking rate; use TTS word timings if a provider streams them.
const SPOKEN_CHARS_PER_SECOND = 14;

interface CascadeRun {
  turn: VoiceTurn;
  epoch: number;
  abort: AbortController;
  /** The answer is on its way (submitted once: a pause, the device's end of audio, or eve finishing). */
  submitted: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gemini Live (direct) takes the device's 16 kHz as-is; the AI Gateway's realtime endpoint wants 24 kHz PCM16. */
export function sessionInputRate(provider: RealtimeProvider | undefined): number {
  return provider?.provider === "gateway" ? GEMINI_OUTPUT_SAMPLE_RATE : DEVICE_SAMPLE_RATE;
}

export function buildSessionConfig(options: {
  provider: RealtimeProvider;
  instructions: string;
  voice: string;
  tools: RealtimeSessionConfig["tools"];
  modality: "audio" | "text";
}): RealtimeSessionConfig {
  const base: RealtimeSessionConfig = {
    instructions: options.instructions,
    outputModalities: [options.modality],
    inputAudioFormat: { type: "audio/pcm", rate: sessionInputRate(options.provider) },
    outputAudioFormat: { type: "audio/pcm", rate: GEMINI_OUTPUT_SAMPLE_RATE },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: options.tools,
  };
  if (options.modality === "audio") base.voice = options.voice;

  const googleOptions = geminiLiveOptions(options.provider.modelId);
  if (options.provider.provider === "google") {
    // Non-`google` keys are merged verbatim into the Gemini `setup` message.
    base.providerOptions = {
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 600 } },
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: {},
      ...(googleOptions ? { google: googleOptions } : {}),
    };
  } else if (isGeminiModel(options.provider.modelId)) {
    // The gateway rejects `turnDetection` and Gemini-native setup keys for Gemini Live
    // (its own activity detection applies); `providerOptions.google` does pass through.
    if (googleOptions) base.providerOptions = { google: googleOptions };
  } else {
    base.turnDetection = { type: "server-vad", silenceDurationMs: 600 };
  }
  return base;
}

/** `google/gemini-3.8-live` through the gateway, or a bare Gemini id on the direct provider. */
export function isGeminiModel(modelId: string | undefined): boolean {
  return /(^|\/)gemini-/.test(modelId ?? "");
}

/** Gemini 3.8 Live only speaks audio (`outputModalities: ["text"]` is rejected); transcripts carry the text. */
export function isAudioOnlyModel(modelId: string | undefined): boolean {
  return /^gemini-\d+\.\d+-live/.test(modelId?.split("/").at(-1) ?? "");
}

/**
 * Gemini 3.8 Live defaults to asynchronous (`NON_BLOCKING`) tool calls; the
 * bridge's turn machine expects the classic blocking flow (call → output →
 * spoken answer), so pin `BLOCKING` on the latency-optimised model. The
 * extended-thinking variant only accepts `NON_BLOCKING`, so it is left alone
 * (the provider adds its mandatory `thinkingLevel: "low"` by itself).
 */
export function geminiLiveOptions(modelId: string | undefined): { defaultToolBehavior: "BLOCKING" } | undefined {
  const name = modelId?.split("/").at(-1) ?? "";
  return /^gemini-\d+\.\d+-live$/.test(name) ? { defaultToolBehavior: "BLOCKING" } : undefined;
}

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
}

export interface PitchRuntime {
  extract: PitchExtractor;
  api: Pick<OwuApi, "tracks">;
  /** The event the knob proposes into (OWY_EVENT_ID or the active one), resolved on first use. */
  openSpaceId: () => Promise<string>;
  /** Pre-rendered cues by id → duration (ms); empty = Owy says the cues through the model. */
  clips: Record<string, number>;
}

/** A pitch being recorded: never streamed to the model, transcribed as a whole once the person taps again. */
interface PitchRun {
  kind: PitchKind;
  recorder: PitchRecorder;
  abort: AbortController;
  epoch: number;
  turn: VoiceTurn;
}

/**
 * The knob's voice link when a browser is attached as its laptop audio: every
 * pipeline event reaches both, `accepted` opens the browser mic, and model
 * audio goes to whichever side owns the output this turn. Readiness stays the
 * physical device's (its mic must have released the bus before TTS).
 */
class PeerLink implements VoiceLink {
  constructor(
    private readonly device: DeviceTransport,
    private readonly peer: AudioPeer,
    private readonly output: () => AudioRoute
  ) {}
  sendEvent(event: Parameters<VoiceLink["sendEvent"]>[0], data?: Parameters<VoiceLink["sendEvent"]>[1]): void {
    this.device.sendEvent(event, data);
    this.peer.sendEvent(event, data);
  }
  sendAudio(audio: Buffer, end = false): void {
    if (this.output() === "laptop") this.peer.sendAudio(audio, end);
    else this.device.sendAudio(audio, end);
  }
  isPlaybackReady(): boolean {
    return this.device.isPlaybackReady();
  }
}

export interface DeviceSessionOptions {
  connectDevice?: (spec: DeviceSpec, handlers: DeviceHandlers, logger: Logger) => Promise<DeviceTransport>;
  /** Browser authority is server-issued; never inherit physical staff env overrides. */
  isStaff?: () => boolean;
  isMarketplaceOpen?: () => boolean;
  proposalHistory?: Map<string, number>;
  authorizeTool?: (name: string) => string | null;
  onTranscript?: (who: "input" | "output", text: string) => void;
  /**
   * Connect the realtime model in the background instead of before start()
   * resolves. Browsers: a tab attaching as a device's laptop audio never uses
   * its own model session, and a 10–20 s gateway connect must not hold `ready`;
   * a browser turn still waits for it (onRequestStart → ensureSession).
   */
  lazyRealtime?: boolean;
  /** Turn-phase face changes (listening/thinking/speaking/idle) — what the firmware derives on its own. */
  onFace?: (state: FaceState) => void;
  /** The feeling cued for the sentence being spoken (the wall mirrors it). */
  onExpression?: (name: string, strength: number) => void;
  onTool?: (event: {
    name: string;
    status: "running" | "done" | "denied" | "error";
    ms?: number;
    detail?: string;
  }) => void;
}

export class DeviceSession {
  private device: DeviceTransport | null = null;
  private stopped = false;
  private readonly toolEpoch = new AsyncLocalStorage<number>();
  private session: NodeRealtimeSession | null = null;
  private tools: ToolSet = {};
  private turn: VoiceTurn | null = null;
  private requestEpoch = 0;
  private conversationId: string = randomUUID();
  /** This turn's microphone, kept until the turn ends: what the cascade answers when the realtime model fails it. */
  private recorder: PitchRecorder | null = null;
  private path: TurnPath = "realtime";
  private lastPath: TurnPath | null = null;
  /** Last sign of life from the realtime model this turn (an event, or a tool it called finishing); 0 = none yet. */
  private lastModelAt = 0;
  /** When the person last paused (the turn recorder's VAD). */
  private pausedAt = 0;
  /** Tools the realtime model is waiting on (eve thinking is not the socket going quiet). */
  private toolsRunning = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private cascadeRun: CascadeRun | null = null;
  private keepWarm: NodeJS.Timeout | null = null;
  /** The device's native-API link is up (keep-warm only works for a board that can tap). */
  private linkUp = false;
  /** Tools the model ran this turn: a turn that already acted is never replayed on another road. */
  private toolsRan = 0;
  private turnStartedAt = 0;
  private listenEndedAt = 0;
  private firstAudioAt = 0;
  /** Input transcript per item: google ≥4.0.84 sends the utterance so far (replace), others deltas (append). */
  private readonly inputItems = new Map<string, string>();

  private readonly resampler = new Pcm16Resampler(GEMINI_OUTPUT_SAMPLE_RATE, DEVICE_SAMPLE_RATE);
  private readonly micResampler: Pcm16Resampler;
  private readonly chunker = new FrameChunker(OUTPUT_FRAME_BYTES);
  private pacer: PacedSpeaker | null = null;
  private mouth: MouthTrack | null = null;
  /** One per turn: which face each sentence gets, cued as it becomes audible. */
  private expressions: ExpressionDirector | null = null;
  private queuedBytes = 0;
  private playedBytes = 0;
  /** Transcript of this turn's earlier responses (a tool response, then the spoken one). */
  private spokenText = "";
  private inputTranscript = "";
  /** Shared with the cascade's local brain (its tool calls are authorized like the realtime model's). */
  private runtime: ToolRuntime | null = null;
  private outputTranscript = "";
  private discardedResponseId: string | null = null;
  private sawAudioThisTurn = false;
  private micPeak = 0;
  private micBytes = 0;
  private captionTimer: NodeJS.Timeout | null = null;
  /** eve brain: the answer being written by the agent (captions) and its final text (spoken by the model). */
  private eveAbort: AbortController | null = null;
  private eveAnswer: string | null = null;
  private eveDraft = "";
  private eveIdleTimer: NodeJS.Timeout | null = null;
  // Per-turn audio routing (device selects win over env defaults).
  private micSource: AudioRoute = "device";
  private audioOutput: AudioRoute = "device";
  private peer: AudioPeer | null = null;
  private micOpenAt = 0;
  /** Settings UI choice for boards without routing selects. */
  private routeOverride: { mic?: AudioRoute; output?: AudioRoute } = {};
  /** Modo pitch: the run being recorded, and the card waiting for its speaker's name. */
  private pitch: PitchRun | null = null;
  private pendingName: { trackId: string; card: ScreenCard; prompted: boolean; timer: NodeJS.Timeout | null } | null =
    null;
  /** A line the realtime model must say verbatim this turn (the bridge's words, not the visitor's). */
  private script: string | null = null;
  /** Settings UI choice for boards without the pitch switches. */
  private pitchOverride: { mode?: boolean; reacts?: boolean } = {};
  private readonly log: Logger;
  private readonly provider: RealtimeProvider;

  constructor(
    private readonly spec: DeviceSpec,
    private readonly shared: SharedRuntime,
    private readonly options: DeviceSessionOptions = {}
  ) {
    this.log = shared.logger.child(spec.id);
    this.provider = shared.createProvider?.() ?? shared.provider;
    this.micResampler = new Pcm16Resampler(DEVICE_SAMPLE_RATE, sessionInputRate(this.provider));
  }

  async start(): Promise<void> {
    const runtime: ToolRuntime = {
      deviceId: this.spec.id,
      isStaff: () =>
        this.options.isStaff?.() ?? (this.device?.isStaffMode() || this.shared.config.COMPANION_STAFF_MODE),
      isMarketplaceOpen: () =>
        this.options.isMarketplaceOpen?.() ??
        (this.device?.isMarketplaceOpen() || this.shared.config.COMPANION_MARKETPLACE_OPEN),
      proposalCooldownMs: this.shared.config.COMPANION_PROPOSAL_COOLDOWN_S * 1000,
      proposalHistory: this.options.proposalHistory,
      gridUrl: this.shared.gridUrl,
      onScreen: (command) => this.showOnScreen(command),
      getVolume: () => this.device?.getVolume() ?? null,
      setVolume: (pct) => {
        if (this.toolIsCurrent()) this.device?.setVolume(pct);
      },
      logger: this.log,
    };
    this.runtime = runtime;
    if (this.shared.brain === "eve" && this.shared.eve) {
      // Ears and mouth only: device-local tools + the line to the eve Owy.
      const local = buildCompanionToolSet(new Map(), runtime);
      this.tools = {
        set_volume: local.set_volume,
        show_on_screen: local.show_on_screen,
        hablar_con_owy: this.eveTool(this.shared.eve, runtime),
      };
    } else {
      this.tools = buildCompanionToolSet(this.shared.definitions, runtime);
    }

    const toolDefinitions = await experimental_getRealtimeToolDefinitions({ tools: this.tools });
    const config = this.shared.config;
    const configFor = (provider: RealtimeProvider) =>
      buildSessionConfig({
        provider,
        instructions: this.shared.instructions,
        // Gemini voice names do not exist on other vendors.
        voice: isGeminiModel(provider.modelId) ? config.COMPANION_VOICE : config.COMPANION_FALLBACK_VOICE,
        tools: toolDefinitions,
        modality: "audio",
      });
    // The mic resampler is per device, so every tier must take the primary's input rate.
    const fallbacks = (this.shared.createFallbackProviders?.() ?? [])
      .filter((provider) => {
        const same = sessionInputRate(provider) === sessionInputRate(this.provider);
        if (!same) this.log.warn(`respaldo ${provider.spec} descartado: otra tasa de micrófono que ${this.provider.spec}`);
        return same;
      })
      .map((provider) => ({ provider, sessionConfig: configFor(provider) }));

    this.session = new NodeRealtimeSession({
      provider: this.provider,
      sessionConfig: configFor(this.provider),
      fallbacks,
      tokenTimeoutMs: config.COMPANION_TOKEN_TIMEOUT_MS,
      connectTimeoutMs: config.COMPANION_REALTIME_CONNECT_MS,
      logger: this.log.child("gemini"),
      onToolCall: ({ callId, name, args }) => this.executeTool(callId, name, args),
      onEvent: (event) => this.onModelEvent(event),
      // Only a socket that was connected reports here; failed attempts just move to the next tier.
      onClose: ({ code, reason }) => this.onRealtimeDropped(`socket cerrado ${code ?? "?"}${reason ? ` ${reason}` : ""}`),
      onError: (error) => this.onRealtimeDropped(error.message),
    });

    this.device = await (this.options.connectDevice ?? CompanionDevice.connect)(
      this.spec,
      {
        onRequestStart: (request) => this.onRequestStart(request),
        onRequestStop: () => this.onRequestStop(),
        onAudio: (chunk) => this.onDeviceAudio(chunk),
        onPitchSubmit: () => this.submitPitch("submit"),
        onConnected: () => {
          this.linkUp = true;
          this.device?.setFace("idle");
        },
        onDisconnected: () => {
          this.linkUp = false;
          this.requestEpoch++;
          this.cancelCascade();
          this.pacer?.stop();
          this.pacer = null;
          this.turn?.finish();
          this.session?.resetConversation();
        },
      },
      this.shared.logger
    );

    if (this.stopped) {
      this.device.close();
      this.session.close();
      return;
    }

    this.linkUp = true;
    if (this.options.lazyRealtime) void this.ensureSession();
    else {
      await this.ensureSession();
      // Physical Owys keep a warm session: the gateway closes idle ones at 5 min and caps them at 25.
      this.keepWarm = setInterval(() => this.warmTick(), KEEP_WARM_EVERY_MS);
    }
    if (this.stopped) return;
    this.device.setFace("idle");
    this.log.info("ready");
  }

  /** Between turns: reconnect a dropped session, renew an old one. */
  private warmTick(): void {
    const session = this.session;
    if (this.stopped || !session || !this.linkUp || (this.turn && !this.turn.finished)) return;
    if (session.status === "connecting") return;
    const age = session.connectedAt ? Date.now() - session.connectedAt : 0;
    if (age > ROTATE_AFTER_MS) this.log.info(`realtime: renuevo la sesión (${Math.round(age / 60_000)} min)`);
    if (!session.isConnected || session.goAwayPending || age > ROTATE_AFTER_MS) void this.ensureSession(age > ROTATE_AFTER_MS);
  }

  /** A live, connected realtime session that will not go away mid-turn. */
  private realtimeLive(): boolean {
    return !!this.session?.isConnected && !this.session.goAwayPending;
  }

  private async ensureSession(renew = false): Promise<void> {
    if (this.stopped) return;
    const session = this.session;
    if (!session) return;
    // A tap can land while the boot-time connect is still in flight: wait for it.
    if (session.status === "connecting") await session.whenSettled();
    if (session.isConnected && !session.goAwayPending && !renew) return;
    try {
      if (session.status === "disconnected" || session.status === "error") await session.connect();
      else await session.reconnect();
    } catch (error) {
      this.log.error("could not (re)connect the realtime session", error);
    }
  }

  // ── Device → bridge ─────────────────────────────────────────────────────

  private async onRequestStart(request: VoiceAssistantRequest): Promise<void> {
    if (this.stopped) return;
    const device = this.device;
    if (!device) return;
    const epoch = ++this.requestEpoch;

    // The device has already moved to a new run: close ours without telling it.
    if (this.turn && !this.turn.finished) this.turn.finish({ notify: false });
    this.cancelPitch();
    this.cancelCascade();
    // Modo pitch: recording needs no model; warm it meanwhile for the announcement.
    const kind: PitchKind | null = isPitchRun(request) ? (this.pendingName ? "name" : "pitch") : null;
    let path: TurnPath = "pitch";
    if (kind) void this.ensureSession();
    else {
      // Never hold a tap on the model when the cascade can answer: a connect already
      // under way gets a moment, then the turn starts either way. Browsers (and
      // bridges without the cascade) still wait for their session, as before.
      const session = this.session;
      if (!this.shared.cascade || this.options.lazyRealtime) await this.ensureSession();
      else if (session?.status === "connecting") await Promise.race([session.whenSettled(), sleep(ACCEPT_WAIT_MS)]);
      if (epoch !== this.requestEpoch) return;
      const live = this.realtimeLive();
      if (!live && !this.shared.cascade) {
        this.log.warn("declining pipeline: no realtime session");
        device.declineRequest();
        device.setFace("error");
        return;
      }
      // Test fakes have no provider and no tiers: they count as the primary.
      if (live) path = (this.session?.tierSpec ?? this.provider?.spec) === this.provider?.spec ? "realtime" : "fallback";
      else {
        path = "cascade";
        this.log.warn(`sin sesión realtime (${this.session?.status ?? "ninguna"}): este turno va por la cascada`);
        // Warm for the next turn; this one is already answered without it.
        void this.ensureSession();
      }
    }

    if (request.conversationId) this.conversationId = request.conversationId;
    this.path = path;
    this.lastModelAt = this.pausedAt = 0;
    this.stopWatchdog();
    this.toolsRan = this.toolsRunning = 0;
    this.turnStartedAt = Date.now();
    this.listenEndedAt = this.firstAudioAt = 0;
    this.inputItems.clear();
    this.inputTranscript = "";
    this.outputTranscript = "";
    this.discardedResponseId = null;
    this.sawAudioThisTurn = false;
    this.micPeak = 0;
    this.micBytes = 0;
    this.clearCaptionTimer();
    this.resampler.reset();
    this.micResampler.reset();
    this.chunker.flush();
    this.pacer?.stop();
    this.pacer = null;

    this.chooseRoutes();
    this.micOpenAt = Date.now();
    this.queuedBytes = this.playedBytes = 0;
    this.spokenText = "";
    this.expressions?.close();
    this.expressions = this.createExpressions(device);
    const peer = this.peer;
    device.acceptRequest();
    if (peer) peer.mirrorAccept();
    this.turn = new VoiceTurn({
      link: peer ? new PeerLink(device, peer, () => this.audioOutput) : device,
      logger: this.log,
      conversationId: this.conversationId,
      // A pitch gives the person time to start and the bridge time to transcribe and place it.
      timers: kind
        ? { noSpeechMs: 15_000, thinkingMs: 60_000 }
        : path === "cascade"
          ? { thinkingMs: CASCADE_THINKING_MS }
          : undefined,
      onPhase: (phase) => {
        this.options.onFace?.(faceForPhase(phase));
        if (phase === "thinking") this.listenEndedAt = Date.now();
        if (phase === "finished") {
          this.pacer?.stop();
          this.pacer = null;
          this.expressions?.close();
          this.expressions = null;
          this.script = null;
          if (this.pitch?.turn === this.turn) this.cancelPitch();
          if (this.cascadeRun?.turn === this.turn) this.cancelCascade();
          this.recorder?.stop();
          this.recorder = null;
          this.stopWatchdog();
          this.logTurn();
          this.promptPendingName();
          // RUN_END precedes physical playback completion. Firmware owns
          // the return to idle and the wake-word indicator.
        }
      },
      onNoSpeech: () => {
        this.log.info(`no escuché nada — mic pico=${this.micPeak.toFixed(3)}, ${this.micBytes} B enviados a Gemini`);
        // End the open window silently. Committing silence can manufacture a
        // late response; reset the transport/context for the next visitor.
        this.session?.resetConversation();
        this.conversationId = randomUUID();
        // Warm an empty session while idle so the next wake/chime is not
        // followed by a cold model handshake that could clip the first words.
        void this.ensureSession();
      },
      onFailure: () => {
        // Gemini does not implement response-cancel. A fresh transport
        // prevents a late reply/tool call from being attached to a new turn.
        this.session?.resetConversation();
        this.conversationId = randomUUID();
        // eve keeps working on a turn nobody waits for, and the next POST would find it busy.
        this.cancelEveTurn();
        if (!this.options.lazyRealtime) void this.ensureSession();
      },
    });
    this.turn.start();
    if (kind) this.startPitch(kind, this.turn, epoch);
    else this.startTurnRecorder(this.turn, epoch);
  }

  // ── Fallbacks: the turn's recorder, the realtime watchdog, the cascade ───

  /**
   * Every voice turn is also recorded here (it costs a buffer): when the realtime
   * model fails the turn, the cascade answers from this audio. On the cascade path
   * its speech detection is what drives the device (STT_VAD_START, end of utterance).
   */
  private startTurnRecorder(turn: VoiceTurn, epoch: number): void {
    if (!this.shared.cascade) return;
    if (this.path === "cascade") this.cascadeRun = { turn, epoch, abort: new AbortController(), submitted: false };
    const recorder = new PitchRecorder({
      limits: TURN_LIMITS,
      rmsThreshold: this.shared.config?.COMPANION_PITCH_VAD_RMS,
      repeatSilence: true,
      onSpeechStart: () => {
        // No model VAD on the cascade: the device's idle guard cancels at 9 s without this.
        if (this.recorder === recorder && this.path === "cascade") turn.markSpeechStarted();
      },
      onDone: () => {
        if (this.recorder === recorder) this.onTurnPause(turn);
      },
    });
    this.recorder = recorder;
    recorder.start();
    if (this.path !== "cascade") this.watchdog = setInterval(() => this.checkRealtime(turn), 250);
  }

  /** The person paused (or hit the cap). */
  private onTurnPause(turn: VoiceTurn): void {
    if (turn !== this.turn || turn.finished || turn.phase !== "listening") return;
    if (this.path === "cascade") return this.submitCascade();
    this.pausedAt = Date.now();
  }

  /**
   * A half-open socket or a stalled gateway looks connected and says nothing.
   * A live model reacts soon after the person pauses (VAD, transcript, a tool
   * call, audio) and starts answering soon after the turn is handed over; when
   * it does not, the turn moves to the cascade. A tool it waits on (eve) stops
   * the clock: thinking is not silence.
   */
  private checkRealtime(turn: VoiceTurn): void {
    if (turn !== this.turn || turn.finished || this.path === "cascade" || turn.phase === "speaking" || turn.deferred)
      return this.stopWatchdog();
    if (this.toolsRunning > 0) return;
    const ack = this.shared.config?.COMPANION_ACK_MS ?? 2500;
    const now = Date.now();
    const quiet = now - Math.max(this.lastModelAt, this.pausedAt, this.listenEndedAt);
    if (turn.phase === "listening") {
      if (this.recorder?.pausedAfterSpeech && quiet >= ack) this.degrade(turn, "el modelo no reaccionó a la pausa");
      // Someone talking for a long while with not one transcript or VAD event: the socket is gone.
      else if (this.lastModelAt && now - this.lastModelAt >= 6 * ack) this.degrade(turn, "el modelo dejó de dar señales");
    } else if (turn.phase === "thinking" && quiet >= 2 * ack) this.degrade(turn, "el modelo no empezó a contestar");
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  /** A live socket broke (closed, errored) or went silent. */
  private onRealtimeDropped(reason: string): void {
    const turn = this.turn;
    if (!turn || turn.finished || this.path === "cascade") {
      // Between turns: reconnect now so the next tap finds a warm session.
      if (!this.options.lazyRealtime && !this.stopped && this.linkUp) void this.ensureSession();
      return;
    }
    if (turn.phase === "speaking" || turn.deferred || this.pacer) return this.finishSpokenSoFar(turn, reason);
    if (this.pitch?.turn === turn) {
      if (turn.phase === "thinking") turn.fail("server_error", "Se cortó la conexión con el modelo");
      return;
    }
    this.degrade(turn, reason);
  }

  /** Owy was already talking when the socket died: end on what arrived, with the full answer as a caption. */
  private finishSpokenSoFar(turn: VoiceTurn, reason: string): void {
    this.log.warn(`se cortó el modelo mientras Owy hablaba (${reason}); termino con lo que llegó`);
    this.stopWatchdog();
    if (this.eveAnswer) this.pushCaption(this.eveAnswer);
    this.eveAnswer = null;
    this.finishSpeaking(turn, this.outputTranscript.trim());
    this.session?.resetConversation();
    if (!this.options.lazyRealtime) void this.ensureSession();
  }

  /** Moves a realtime turn whose model failed it onto the cascade (once). */
  private degrade(turn: VoiceTurn, reason: string): void {
    if (turn !== this.turn || turn.finished || this.path === "cascade") return;
    this.stopWatchdog();
    // Late replies from the broken session must not reach this turn; warm a new one for the next.
    this.session?.resetConversation();
    void this.ensureSession();
    if (!this.shared.cascade) return turn.fail("server_error", "Se cortó la conexión con el modelo");
    this.log.warn(`la sesión realtime falló a mitad del turno (${reason}); sigue la cascada`);
    this.path = "cascade";
    const run: CascadeRun = { turn, epoch: this.requestEpoch, abort: new AbortController(), submitted: false };
    this.cascadeRun = run;
    if (turn.phase === "listening") {
      // The person may still be talking: answer once they pause.
      if (this.recorder?.pausedAfterSpeech) this.submitCascade();
      else if (this.recorder?.heardSpeech) turn.markSpeechStarted();
      return;
    }
    // Thinking: the model already took the words.
    turn.extendThinking(CASCADE_THINKING_MS);
    // eve answers without the socket; `hablar_con_owy` speaks its text through the cascade.
    if (this.eveAbort) return;
    if (this.eveAnswer) {
      run.submitted = true;
      const answer = this.eveAnswer;
      this.eveAnswer = null;
      void this.speakText(turn, answer, run.abort.signal, () => this.cascadeIsCurrent(run));
      return;
    }
    // A turn that already acted (a card created…) is never replayed.
    if (this.toolsRan > 0) {
      run.submitted = true;
      void this.speakFallback(run, "retry");
      return;
    }
    this.submitCascade();
  }

  /** The utterance is complete: transcribe, answer and speak it without a realtime model. */
  private submitCascade(): void {
    const run = this.cascadeRun;
    const turn = this.turn;
    const recorder = this.recorder;
    if (!run || !turn || run.turn !== turn || run.submitted || turn.finished) return;
    if (!recorder?.heardSpeech) {
      // Nothing was said: end quietly, like the no-speech window.
      turn.finish();
      return;
    }
    run.submitted = true;
    recorder.stop();
    if (turn.phase === "listening") turn.endListening("");
    turn.extendThinking(CASCADE_THINKING_MS);
    void this.runCascade(run, recorder.wav()).catch((error: unknown) => {
      this.log.error("cascada falló", error);
      if (this.cascadeIsCurrent(run)) void this.speakFallback(run, "offline");
    });
  }

  private async runCascade(run: CascadeRun, wav: Buffer): Promise<void> {
    const cascade = this.shared.cascade;
    if (!cascade) return;
    const signal = run.abort.signal;
    let text: string;
    try {
      text = await cascade.transcribe(wav, signal);
    } catch (error) {
      if (!this.cascadeIsCurrent(run)) return;
      this.log.warn("cascada: no pude transcribir", error);
      return this.speakFallback(run, "offline");
    }
    if (!this.cascadeIsCurrent(run)) return;
    if (!text) return this.speakFallback(run, "retry");
    this.log.info(`escuché (cascada): "${text}"`);
    this.inputTranscript = text;
    this.options.onTranscript?.("input", text);
    this.expressions?.react(text);
    run.turn.heard(text);

    let answer: string;
    try {
      answer =
        this.shared.brain === "eve" && this.shared.eve
          ? await this.askEve(text, signal)
          : await cascade.answer({ text, instructions: this.shared.instructions, tools: this.cascadeTools(), signal });
    } catch (error) {
      if (!this.cascadeIsCurrent(run)) return;
      this.log.warn("cascada: no hubo respuesta", error);
      return this.speakFallback(run, "offline");
    }
    if (!this.cascadeIsCurrent(run)) return;
    if (!answer) return this.speakFallback(run, "retry");
    await this.speakText(run.turn, answer, signal, () => this.cascadeIsCurrent(run));
  }

  /** The local brain's tools, authorized exactly like the realtime model's calls (browser grants deny writes). */
  private cascadeTools(): ToolSet {
    return Object.fromEntries(
      Object.entries(this.tools).map(([name, definition]) => {
        const execute = definition.execute;
        if (!execute) return [name, definition];
        return [
          name,
          {
            ...definition,
            execute: async (input: unknown, options: Parameters<typeof execute>[1]) => {
              const denial = this.options.authorizeTool?.(name);
              if (denial) return { ok: false, denied: true, error: denial };
              this.toolsRan++;
              this.log.info(`tool ${name} (cascada) ${JSON.stringify(input)}`);
              return execute(input as never, options);
            },
          },
        ];
      })
    ) as ToolSet;
  }

  /** Streams TTS of `text` through the normal speaking path; the text goes on screen if there is no voice. */
  private async speakText(turn: VoiceTurn, text: string, signal: AbortSignal, isCurrent: () => boolean): Promise<void> {
    const cascade = this.shared.cascade;
    if (!isCurrent()) return;
    this.pushCaption(text);
    this.options.onTranscript?.("output", text);
    this.expressions?.write(text, true);
    let started = false;
    try {
      if (!cascade) throw new Error("sin cascada");
      for await (const pcm of cascade.speak(text, signal)) {
        if (!isCurrent()) return;
        if (!started) {
          started = true;
          this.startSpeaking(turn, text);
        }
        for (const frame of this.chunker.push(pcm)) this.pacer?.push(frame);
        this.queuedBytes += pcm.length;
        const chars = Math.round((this.queuedBytes / (DEVICE_SAMPLE_RATE * 2)) * SPOKEN_CHARS_PER_SECOND);
        this.expressions?.queued(this.queuedBytes, Math.min(text.length, chars));
      }
    } catch (error) {
      if (!isCurrent()) return;
      this.log.warn("cascada: sin voz; la respuesta va como texto", error);
      if (!started) return this.showAndFinish(turn, text);
    }
    if (!isCurrent()) return;
    if (!started) return this.showAndFinish(turn, text);
    this.expressions?.queued(this.queuedBytes, text.length);
    this.finishSpeaking(turn, text);
  }

  /** A pre-rendered line when there is one (no network needed), the voice otherwise, the screen at worst. */
  private async speakFallback(run: CascadeRun, clip: FallbackClip): Promise<void> {
    if (!this.cascadeIsCurrent(run)) return;
    const line = FALLBACK_LINES[clip];
    const pcm = this.shared.fallbackClips?.[clip];
    if (clip === "offline") this.path = "offline";
    const showGrid = () => {
      if (clip === "offline" && this.shared.gridUrl) this.device?.showQr(this.shared.gridUrl, "La grilla, en tu celu");
    };
    if (pcm) {
      this.pushCaption(line);
      this.startSpeaking(run.turn, line);
      for (const frame of this.chunker.push(pcm)) this.pacer?.push(frame);
      this.finishSpeaking(run.turn, line, showGrid);
      return;
    }
    if (clip !== "offline") return this.speakText(run.turn, line, run.abort.signal, () => this.cascadeIsCurrent(run));
    this.showAndFinish(run.turn, line);
    showGrid();
  }

  /** No voice at all: the words go on the screen and the run ends cleanly (no error face). */
  private showAndFinish(turn: VoiceTurn, text: string): void {
    if (!this.device?.showCaption) this.device?.showText(text);
    turn.finish();
  }

  /** Last audio is queued: close the turn once the pacer has played it. */
  private finishSpeaking(turn: VoiceTurn, speech: string, after?: () => void): void {
    const tail = this.chunker.flush();
    if (tail) this.pacer?.push(tail);
    const pacer = this.pacer;
    const end = () => {
      turn.endSpeaking({ continueConversation: false, speech });
      this.mouth?.flush();
      this.mouth = null;
      if (this.pacer === pacer) this.pacer = null;
      after?.();
    };
    if (pacer) pacer.finish(end);
    else end();
  }

  private cascadeIsCurrent(run: CascadeRun): boolean {
    return (
      !this.stopped &&
      this.cascadeRun === run &&
      run.epoch === this.requestEpoch &&
      this.turn === run.turn &&
      !run.turn.finished &&
      !run.abort.signal.aborted
    );
  }

  private cancelCascade(): void {
    this.cascadeRun?.abort.abort();
    this.cascadeRun = null;
  }

  /** One line per turn: which road answered and how fast (the netem matrix reads these). */
  private logTurn(): void {
    if (!this.turnStartedAt) return;
    this.lastPath = this.path;
    const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
    const ttfa = this.firstAudioAt && this.listenEndedAt ? seconds(this.firstAudioAt - this.listenEndedAt) : "-";
    this.log.info(`turn path=${this.path} ttfa=${ttfa} total=${seconds(Date.now() - this.turnStartedAt)}`);
    this.turnStartedAt = 0;
  }

  /** For the settings UI: which realtime tier is up and how the last turn was answered. */
  voiceStatus(): { tier: string | null; realtime: SessionStatus; lastPath: TurnPath | null } {
    return {
      tier: this.session?.isConnected ? this.session.tierSpec : null,
      realtime: this.session?.status ?? "disconnected",
      lastPath: this.lastPath,
    };
  }

  // ── Audio routing ───────────────────────────────────────────────────────

  get id(): string {
    return this.spec.id;
  }

  get connected(): boolean {
    return this.device !== null;
  }

  /** Current routing and where it comes from (device selects, settings UI, or env). */
  audioRouting(): { mic: AudioRoute; output: AudioRoute; source: "device" | "override" | "env" } {
    const config: Partial<BridgeConfig> = this.shared.config ?? {}; // test fakes omit config
    const fromDevice = this.device?.getMicSource?.() ?? null;
    if (fromDevice !== null)
      return { mic: fromDevice, output: this.device?.getAudioOutput?.() ?? "device", source: "device" };
    const overridden = this.routeOverride.mic !== undefined || this.routeOverride.output !== undefined;
    return {
      mic: this.routeOverride.mic ?? audioRoute(config.COMPANION_MIC_SOURCE),
      output: this.routeOverride.output ?? audioRoute(config.COMPANION_AUDIO_OUTPUT),
      source: overridden ? "override" : "env",
    };
  }

  /** From the settings UI: writes the device select when the board has one, otherwise remembers it here. */
  setAudioRouting(which: "mic" | "output", route: AudioRoute): void {
    if (this.device?.getMicSource?.() !== null && this.device?.setAudioRoute) this.device.setAudioRoute(which, route);
    else this.routeOverride[which] = route;
  }

  /** Device selects (mic_source / audio_output) first, env defaults otherwise; laptop needs an attached browser. */
  private chooseRoutes(): void {
    const routing = this.audioRouting();
    let mic = routing.mic;
    let output = routing.output;
    if ((mic === "laptop" || output === "laptop") && !this.peer) {
      this.log.warn("laptop audio requested but no browser is attached to this device; using the device");
      mic = output = "device";
    }
    if (mic !== this.micSource || output !== this.audioOutput)
      this.log.info(`audio routing: mic=${mic} output=${output}`);
    this.micSource = mic;
    this.audioOutput = output;
  }

  get hasPeer(): boolean {
    return this.peer !== null;
  }

  /** A browser (workbench) becomes this device's laptop audio until it detaches or disconnects. */
  attachPeer(peer: AudioPeer & { attach(deviceId: string, sink: (pcm16k: Buffer) => void): void }): void {
    this.peer = peer;
    peer.attach(this.spec.id, (pcm) => {
      if (this.micSource === "laptop") this.onMicPcm(pcm);
    });
    this.log.info("browser attached as laptop audio");
  }

  detachPeer(peer: AudioPeer): void {
    if (this.peer !== peer) return;
    this.peer = null;
    this.log.info("browser detached; back to device audio");
  }

  /** 16 kHz mono PCM from whichever microphone owns this turn. */
  private onMicPcm(pcm16k: Buffer): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "listening") return;
    this.micPeak = Math.max(this.micPeak, rmsLevel(pcm16k));
    this.micBytes += pcm16k.length;
    // A pitch is recorded here, never streamed: the model's end-of-speech detection would cut it.
    if (this.pitch?.turn === turn) {
      this.pitch.recorder.push(pcm16k);
      return;
    }
    this.recorder?.push(pcm16k);
    if (this.path !== "cascade") this.session?.sendAudio(this.micResampler.process(pcm16k));
  }

  private async onRequestStop(): Promise<void> {
    this.cancelEveTurn();
    this.cancelPitch();
    this.cancelCascade();
    this.requestEpoch++;
    // Tap while speaking (or wake-word "stop"): drop the rest of this reply.
    const turn = this.turn;
    if (turn && !turn.finished) {
      this.discardedResponseId = this.currentResponseId;
      this.pacer?.stop();
      this.pacer = null;
      turn.finish();
      this.session?.resetConversation();
      this.conversationId = randomUUID();
      // The next tap should find a warm session, not a cold handshake.
      if (!this.options.lazyRealtime) void this.ensureSession();
    }
    this.device?.setFace("idle");
  }

  private onDeviceAudio(chunk: VoiceAssistantAudioData): void {
    const turn = this.turn;
    if (!turn || turn.phase !== "listening") return;
    // With the laptop mic the device still streams its own capture; ignore it.
    // The first frames after the mic opens carry the tail of the "listening"
    // haptic (motor and mic share the enclosure): drop them, they are not speech.
    if (
      chunk.data.length > 0 &&
      this.micSource === "device" &&
      Date.now() >= this.micOpenAt + (this.device?.micSettleMs ?? 0)
    )
      this.onMicPcm(chunk.data);
    if (chunk.end) {
      // The browser's "Terminé el pitch" is the second tap.
      if (this.pitch?.turn === turn) {
        this.submitPitch("submit");
        return;
      }
      if (this.path === "cascade") {
        this.submitCascade();
        return;
      }
      this.session?.commitAudio();
      turn.endListening(this.inputTranscript.trim());
    }
  }

  // ── Modo pitch ──────────────────────────────────────────────────────────

  /** Both switches as the settings UI shows them: the device's, the settings override, or the env fallback. */
  pitchSettings(): { mode: boolean; reacts: boolean; source: "device" | "override" | "env" } {
    const config: Partial<BridgeConfig> = this.shared.config ?? {}; // test fakes omit config
    const fromDevice = this.device?.isPitchMode?.() ?? null;
    if (fromDevice !== null) {
      return { mode: fromDevice, reacts: this.device?.isPitchReacts?.() ?? false, source: "device" };
    }
    const overridden = this.pitchOverride.mode !== undefined || this.pitchOverride.reacts !== undefined;
    return {
      mode: this.pitchOverride.mode ?? config.COMPANION_PITCH_MODE ?? false,
      reacts: this.pitchOverride.reacts ?? config.COMPANION_PITCH_REACTS ?? false,
      source: overridden ? "override" : "env",
    };
  }

  /** From the settings UI: writes the device switch when the board has one, otherwise remembers it here. */
  setPitchSetting(which: "mode" | "reacts", on: boolean): void {
    const device = this.device;
    if (device?.isPitchMode && device.setSwitch && device.isPitchMode() !== null) {
      device.setSwitch(which === "mode" ? "pitch_mode" : "pitch_reacts", on);
    } else this.pitchOverride[which] = on;
  }

  private startPitch(kind: PitchKind, turn: VoiceTurn, epoch: number): void {
    const config: Partial<BridgeConfig> = this.shared.config ?? {};
    const limits =
      kind === "pitch"
        ? {
            ...PITCH_LIMITS.pitch,
            silenceMs: (config.COMPANION_PITCH_SILENCE_S ?? 10) * 1000,
            maxMs: (config.COMPANION_PITCH_MAX_S ?? 120) * 1000,
          }
        : PITCH_LIMITS.name;
    // Owy says it is listening from the laptop; the room mic hears that too, so recording waits it out.
    const cueMs = kind === "pitch" ? this.playClip("pitch-listen") : 0;
    const recorder = new PitchRecorder({
      kind,
      limits,
      rmsThreshold: config.COMPANION_PITCH_VAD_RMS,
      ignoreMs: cueMs > 0 ? cueMs + 400 : 0,
      onSpeechStart: () => {
        if (this.pitch?.recorder === recorder) turn.markSpeechStarted();
      },
      onDone: (reason) => this.submitPitch(reason),
    });
    this.pitch = { kind, recorder, abort: new AbortController(), epoch, turn };
    recorder.start();
    this.log.info(`pitch: grabando (${kind}${cueMs > 0 ? `, aviso de ${cueMs} ms` : ""})`);
  }

  /** Plays a pre-rendered cue where this turn's audio goes; 0 when nothing can play it. */
  private playClip(id: string): number {
    const ms = this.shared.pitch?.clips[id] ?? 0;
    const sink = this.audioOutput === "laptop" ? this.peer : this.device;
    if (ms <= 0 || !sink?.playClip) return 0;
    sink.playClip(id);
    return ms;
  }

  private cancelPitch(): void {
    const pitch = this.pitch;
    if (!pitch) return;
    pitch.recorder.stop();
    pitch.abort.abort();
    this.pitch = null;
  }

  private pitchIsCurrent(p: PitchRun): boolean {
    return (
      this.pitch === p &&
      p.epoch === this.requestEpoch &&
      this.turn === p.turn &&
      !p.turn.finished &&
      !p.abort.signal.aborted
    );
  }

  /** The second tap, or the recorder's own end: the pitch is complete; transcribe and place it. */
  private submitPitch(reason: "submit" | "silence" | "cap"): void {
    const pitch = this.pitch;
    if (!pitch || pitch.turn.phase !== "listening") return;
    pitch.recorder.stop();
    // The second tap's buzz lands in the last frames.
    if (reason === "submit") pitch.recorder.trimTailMs(300);
    this.log.info(
      `pitch: grabación terminada (${reason}, ${(pitch.recorder.durationMs / 1000).toFixed(1)} s, habló ${(pitch.recorder.speechMs / 1000).toFixed(1)} s)`
    );
    pitch.turn.endListening("");
    void this.runPitch(pitch).catch((error) => this.log.error("pitch failed", error));
  }

  private async runPitch(p: PitchRun): Promise<void> {
    const runtime = this.shared.pitch;
    if (!runtime) {
      this.log.warn("pitch: falta AI_GATEWAY_API_KEY u OWY_API_KEY; no se carga nada");
      return this.speakScript(PITCH_LINES.unconfigured, p);
    }
    if (p.recorder.speechMs < p.recorder.limits.minSpeechMs) return this.speakCue("pitch-empty", PITCH_LINES.empty, p);
    // The announcement needs the model: a fresh conversation, connected while we transcribe.
    this.session?.resetConversation();
    this.conversationId = randomUUID();
    const warm = this.ensureSession();
    if (p.kind === "name") return this.finishName(p, runtime, warm);

    let card: PitchCard;
    try {
      card = await runtime.extract.card(p.recorder.wav(), p.abort.signal);
    } catch (error) {
      if (!this.pitchIsCurrent(p)) return;
      this.log.error("pitch: no pude transcribir", error);
      await warm;
      return this.speakScript(PITCH_LINES.failed, p);
    }
    if (!this.pitchIsCurrent(p)) return;
    const transcript = card.transcript.trim();
    this.log.info(
      `pitch: "${transcript}" → ${JSON.stringify({ isPitch: card.isPitch, title: card.title, speaker: card.speaker, needsTV: card.needsTV, needsWhiteboard: card.needsWhiteboard, topics: card.topics })}`
    );
    if (!card.isPitch || !transcript || !card.title) {
      await warm;
      return this.speakCue("pitch-empty", PITCH_LINES.empty, p);
    }
    this.options.onTranscript?.("input", transcript);
    this.expressions?.react(transcript);
    // The knob's « heard » pill shows the transcript.
    this.device?.sendEvent(VoiceAssistantEvent.STT_END, [{ name: "text", value: transcript.slice(0, 480) }]);

    const denial = this.options.authorizeTool?.("create_track");
    if (denial) {
      await warm;
      return this.speakScript(denial, p);
    }
    const title = card.title;
    const reaction = this.pitchReaction(transcript, { ...card, title }, p.abort.signal);
    let placed: PlacedTrackResponse;
    try {
      placed = await runtime.api.tracks.createPlaced({
        openSpaceId: await runtime.openSpaceId(),
        title,
        speaker: card.speaker ?? undefined,
        description: card.description ?? undefined,
        needsTV: card.needsTV,
        needsWhiteboard: card.needsWhiteboard,
        source: "companion",
      });
    } catch (error) {
      if (!this.pitchIsCurrent(p)) return;
      this.log.error("pitch: no pude crear la charla", error);
      await warm;
      const full = typeof error === "object" && error !== null && "code" in error && error.code === "CONFLICT";
      return this.speakScript(full ? PITCH_LINES.full : PITCH_LINES.failed, p);
    }
    if (!this.pitchIsCurrent(p)) return;
    const note = placed.note;
    const screen: ScreenCard = {
      title: note.title,
      speaker: note.speaker ?? undefined,
      room: note.room ?? placed.placement.room,
      timeSlot: note.timeSlot ?? placed.placement.timeSlot,
    };
    this.log.info(
      `pitch: charla creada «${screen.title}» → ${screen.room} ${screen.timeSlot} (${placed.placement.reasoning})`
    );
    this.device?.showCard(screen);
    const askName = !note.speaker;
    if (askName) this.pendingName = { trackId: note.id, card: screen, prompted: false, timer: null };
    const extra = await reaction;
    await warm;
    await this.speakScript(`${announcementText(screen, { askName })}${extra ? ` ${extra}` : ""}`, p);
  }

  /** "Owy reacciona": one or two sentences from the eve brain about the pitch, or nothing. */
  private pitchReaction(
    transcript: string,
    card: {
      title: string;
      speaker: string | null;
      needsTV: boolean;
      needsWhiteboard: boolean;
      description: string | null;
      topics: string[];
    },
    signal: AbortSignal
  ): Promise<string> {
    const eve = this.shared.eve;
    if (!this.pitchReacts() || this.shared.brain !== "eve" || !eve) return Promise.resolve("");
    const writes = !this.options.authorizeTool || this.options.authorizeTool("create_track") === null;
    const staff = this.options.isStaff?.() ?? (this.device?.isStaffMode() || !!this.shared.config?.COMPANION_STAFF_MODE);
    return eve
      .turn(this.spec.id, transcript.slice(0, 3500), {
        kind: "pitch",
        pitch: card,
        staff: writes && staff,
        marketplaceOpen: false,
        eventName: this.shared.config?.COMPANION_EVENT_NAME,
        timeoutMs: 8_000,
        signal,
      })
      .then((result) => result.text.trim())
      .catch((error: unknown) => {
        this.log.warn("pitch: eve no reaccionó a tiempo", error);
        return "";
      });
  }

  private pitchReacts(): boolean {
    return this.pitchSettings().reacts;
  }

  /** The name step: the person answered "¿Cómo te llamás?"; the card gets its speaker. */
  private async finishName(p: PitchRun, runtime: PitchRuntime, warm: Promise<void>): Promise<void> {
    const pending = this.pendingName;
    let name: string | null = null;
    try {
      name = (await runtime.extract.name(p.recorder.wav(), p.abort.signal)).name?.trim() || null;
    } catch (error) {
      this.log.warn("pitch: no pude entender el nombre", error);
    }
    if (!this.pitchIsCurrent(p)) return;
    this.clearPendingName();
    if (!pending) return this.speakCue("pitch-empty", PITCH_LINES.empty, p);
    if (!name) {
      await warm;
      return this.speakScript(PITCH_LINES.noName, p);
    }
    try {
      await runtime.api.tracks.update({ id: pending.trackId, data: { speaker: name } });
    } catch (error) {
      if (!this.pitchIsCurrent(p)) return;
      this.log.warn("pitch: no pude guardar el nombre", error);
      await warm;
      return this.speakScript(`Gracias, ${name}. No pude anotar tu nombre, pero la charla ya está en la grilla.`, p);
    }
    if (!this.pitchIsCurrent(p)) return;
    this.log.info(`pitch: «${pending.card.title}» es de ${name}`);
    this.device?.showCard({ ...pending.card, speaker: name });
    await warm;
    await this.speakScript(`Listo, ${name}. Gracias.`, p);
  }

  /** The realtime model says the bridge's line in Owy's voice, through the normal speaking pipeline. */
  private async speakScript(text: string, p: PitchRun): Promise<void> {
    if (!this.pitchIsCurrent(p)) return;
    if (!this.session?.isConnected) await this.ensureSession();
    if (!this.pitchIsCurrent(p)) return;
    this.script = text;
    // The caption is the script itself (response-done pushes `eveAnswer`); the expressions follow its sentences.
    this.eveAnswer = text;
    if (this.shared.brain === "eve") this.expressions?.write(text, true);
    if (!this.session?.isConnected) {
      this.log.warn("pitch: sin modelo realtime para hablar; va por la voz de la cascada");
      this.script = null;
      this.eveAnswer = null;
      return this.speakText(p.turn, text, p.abort.signal, () => this.pitchIsCurrent(p));
    }
    this.session.sendText(SCRIPT_PREFIX + text);
  }

  /** A pre-rendered cue when the laptop can play it (instant), the spoken line otherwise. */
  private async speakCue(clip: string, text: string, p: PitchRun): Promise<void> {
    if (!this.pitchIsCurrent(p)) return;
    if (this.playClip(clip) > 0) {
      p.turn.finish();
      return;
    }
    await this.speakScript(text, p);
  }

  /** The announcement ended: now the knob invites the tap that gives the name, for 20 s. */
  private promptPendingName(): void {
    const pending = this.pendingName;
    if (!pending || pending.prompted) return;
    pending.prompted = true;
    if (this.device?.pitchPrompt) this.device.pitchPrompt("name");
    else this.device?.showText(PITCH_LINES.askName);
    pending.timer = setTimeout(() => {
      if (this.pendingName !== pending) return;
      this.log.info(`pitch: «${pending.card.title}» queda sin nombre`);
      this.clearPendingName();
    }, 20_000);
  }

  private clearPendingName(): void {
    const pending = this.pendingName;
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pendingName = null;
    if (pending.prompted) this.device?.pitchPrompt?.("idle");
  }

  // ── Model → device ──────────────────────────────────────────────────────

  private currentResponseId: string | null = null;

  private onModelEvent(event: RealtimeServerEvent): void {
    const turn = this.turn;
    if (turn && !turn.finished) {
      // The cascade owns this turn now; a reconnecting session has nothing to say in it.
      if (this.path === "cascade") return;
      this.lastModelAt = Date.now();
    }

    switch (event.type) {
      case "input-transcription-completed": {
        // Gemini transcription can arrive after VAD/commit or even the first
        // response audio. Keep it visible in the shared debugger/log without
        // reopening capture or changing a turn that has already ended.
        if (!turn || turn.finished) return;
        if (turn.phase === "listening" && event.transcript.trim()) turn.markSpeechStarted();
        // google ≥4.0.84 sends the utterance so far per item (replace); other codecs send deltas (append).
        const previous = this.inputItems.get(event.itemId) ?? "";
        const next = event.transcript.startsWith(previous) ? event.transcript : previous + event.transcript;
        const delta = next.slice(previous.length);
        if (!delta) return;
        this.inputItems.set(event.itemId, next);
        this.inputTranscript = [...this.inputItems.values()].join(" ").replace(/\s{2,}/g, " ");
        // Listeners (the workbench) append what they receive: only the new words.
        this.options.onTranscript?.("input", delta);
        // With the eve brain the reaction comes from `hablar_con_owy`'s text.
        if (this.shared.brain !== "eve") this.expressions?.react(this.inputTranscript);
        this.log.info(`escuché: "${this.inputTranscript.trim()}"`);
        return;
      }

      case "speech-started":
        turn?.markSpeechStarted();
        return;

      case "function-call-arguments-done":
        // The user's turn is over once the model starts acting on it.
        turn?.endListening(this.inputTranscript.trim());
        return;

      case "audio-transcript-delta":
        if (!turn || turn.finished) return;
        this.outputTranscript += event.delta;
        this.options.onTranscript?.("output", event.delta);
        if (this.shared.brain !== "eve") this.expressions?.write(this.spokenText + this.outputTranscript);
        // With the eve brain the caption is eve's exact text, already on screen.
        if (this.shared.brain !== "eve") this.scheduleCaption();
        return;

      case "audio-delta": {
        if (!turn || turn.finished) return;
        if (event.responseId === this.discardedResponseId) return;
        this.currentResponseId = event.responseId;
        if (!this.sawAudioThisTurn) {
          this.sawAudioThisTurn = true;
          this.log.info(`audio de respuesta llegando (delta ${Buffer.from(event.delta, "base64").length} B @24k)`);
        }
        if (turn.phase === "listening") turn.endListening(this.inputTranscript.trim());
        if (turn.phase === "thinking") this.startSpeaking(turn);
        const pcm16 = this.resampler.process(Buffer.from(event.delta, "base64"));
        for (const frame of this.chunker.push(pcm16)) this.pacer?.push(frame);
        this.queuedBytes += pcm16.length;
        this.expressions?.queued(this.queuedBytes, this.spokenText.length + this.outputTranscript.length);
        return;
      }

      case "response-done": {
        if (!turn || turn.finished) return;
        if (event.responseId === this.discardedResponseId) return;
        if (turn.phase === "thinking" && !turn.deferred) {
          // Tool-only response with no audio yet: keep waiting for the spoken one.
          if (this.session?.goAwayPending) void this.ensureSession();
          return;
        }
        if (turn.phase !== "speaking" && !turn.deferred) return;

        const tail = this.chunker.flush();
        if (tail) this.pacer?.push(tail);
        const speech = this.outputTranscript.trim();
        this.spokenText += this.outputTranscript;
        if (this.shared.brain !== "eve") this.expressions?.write(this.spokenText, true);
        this.outputTranscript = "";
        this.pushCaption(this.eveAnswer ?? speech);
        this.eveAnswer = null;
        this.armEveIdleReset();
        const pacer = this.pacer;
        const endTurn = () => {
          const where = this.audioOutput === "laptop" ? "reproducidos en el navegador" : "esperando fin en dispositivo";
          this.log.info(`owy: "${speech}" (${turn.audioBytesSent} B enviados @16k; ${where})`);
          // Firmware reopens capture after physical playback + its soft cue.
          // ESPHome's immediate continuation would bypass that bus handoff.
          turn.endSpeaking({ continueConversation: false, speech });
          this.mouth?.flush();
          this.mouth = null;
          if (this.pacer === pacer) this.pacer = null;
          if (this.session?.goAwayPending) void this.ensureSession();
        };
        if (pacer) pacer.finish(endTurn);
        else endTurn();
        return;
      }

      case "error":
        if (BENIGN_ERROR_CODES.has(event.code ?? "")) {
          this.log.info(`aviso del modelo ignorado: ${event.message} (${event.code})`);
          return;
        }
        if (turn && !turn.finished && this.shared.cascade) this.onRealtimeDropped(`error del modelo: ${event.message}`);
        else turn?.fail("server_error", event.message);
        return;

      default:
        return;
    }
  }

  // ── eve brain ────────────────────────────────────────────────────────────

  /** `hablar_con_owy`: one eve turn per utterance; eve's text is the caption and the model's script. */
  private eveTool(eve: EveLink, runtime: ToolRuntime) {
    return tool({
      description:
        "Le pasa a Owy (el cerebro) lo que dijo la persona, tal cual, y devuelve en `respuesta` el texto exacto que hay que decir en voz alta. Usala en cada turno con todo lo que dijo la persona.",
      inputSchema: z.object({ texto: z.string().min(1).describe("Lo que dijo la persona, completo y textual") }),
      execute: async ({ texto }) => {
        // A bridge script forwarded anyway: hand it back verbatim, no eve round trip.
        if (this.script) return { respuesta: this.script };
        let text: string;
        try {
          text = await this.askEve(texto, undefined, eve, runtime);
        } catch (error) {
          this.log.error("eve turn failed", error);
          // The socket died while eve was thinking: nobody will say the model's apology.
          const run = this.cascadeTakeover();
          if (run) void this.speakFallback(run, "retry");
          return { error: "Owy no respondió; disculpate en una frase y pedí que lo repitan." };
        }
        if (!this.toolIsCurrent()) return { respuesta: "" };
        // The socket died while eve was thinking: eve's answer goes out through the cascade's voice.
        const run = this.cascadeTakeover();
        if (run) void this.speakText(run.turn, text, run.abort.signal, () => this.cascadeIsCurrent(run));
        else this.eveAnswer = text;
        return { respuesta: text };
      },
    });
  }

  /** The cascade took over this turn mid-thinking and waits for eve's text (claimed once). */
  private cascadeTakeover(): CascadeRun | null {
    const run = this.cascadeRun;
    if (!run || this.path !== "cascade" || run.submitted || !this.cascadeIsCurrent(run)) return null;
    run.submitted = true;
    return run;
  }

  /**
   * One eve turn for what the person said; eve's text is the caption (streamed)
   * and the answer. "" when the turn was abandoned (tap, newer turn).
   */
  private async askEve(
    texto: string,
    signal?: AbortSignal,
    eve: EveLink | undefined = this.shared.eve,
    runtime: ToolRuntime | null = this.runtime
  ): Promise<string> {
    if (!eve || !runtime) throw new Error("sin eve");
    this.clearEveIdleReset();
    this.expressions?.react(texto);
    this.eveAbort?.abort();
    const abort = new AbortController();
    this.eveAbort = abort;
    this.eveAnswer = null;
    // A read-only web grant denies every write tool; mirror that in eve by
    // presenting a plain visitor with the marketplace closed.
    const writes = !this.options.authorizeTool || this.options.authorizeTool("create_track") === null;
    try {
      const result = await eve.turn(this.spec.id, texto, {
        staff: writes && runtime.isStaff(),
        marketplaceOpen: writes && runtime.isMarketplaceOpen(),
        eventName: this.shared.config.COMPANION_EVENT_NAME,
        onDelta: (text) => {
          if (!this.toolIsCurrent()) return;
          this.scheduleEveCaption(text);
          this.expressions?.write(text);
        },
        onTool: (name) => this.log.info(`owy (eve) usa ${name}`),
        signal: signal ? AbortSignal.any([abort.signal, signal]) : abort.signal,
      });
      if (!this.toolIsCurrent()) return "";
      this.pushCaption(result.text);
      this.expressions?.write(result.text, true);
      this.armEveIdleReset();
      return result.text;
    } catch (error) {
      if (abort.signal.aborted || signal?.aborted) return "";
      throw error;
    } finally {
      if (this.eveAbort === abort) this.eveAbort = null;
    }
  }

  /** eve writes faster than a 360 px page can repaint: one caption update per 300 ms while it streams. */
  private scheduleEveCaption(text: string): void {
    this.eveDraft = text;
    if (!this.device?.showCaption || this.captionTimer) return;
    this.captionTimer = setTimeout(() => {
      this.captionTimer = null;
      if (this.eveDraft) this.pushCaption(this.eveDraft);
    }, 300);
  }

  /** A tap or a dropped device mid-turn also stops the agent's work on it. */
  private cancelEveTurn(): void {
    if (!this.eveAbort) return;
    this.eveAbort.abort();
    this.eveAbort = null;
    void this.shared.eve?.cancel(this.spec.id);
  }

  /** Nobody talked for a while: the next visitor gets a fresh conversation (memory lives in eve, not in the session). */
  private armEveIdleReset(): void {
    if (this.shared.brain !== "eve" || !this.shared.eve) return;
    this.clearEveIdleReset();
    const eve = this.shared.eve;
    this.eveIdleTimer = setTimeout(() => {
      this.eveIdleTimer = null;
      this.log.info("conversación cerrada por inactividad; eve session reset");
      void eve.reset(this.spec.id);
    }, this.shared.config.COMPANION_EVE_IDLE_RESET_S * 1000);
  }

  private clearEveIdleReset(): void {
    if (this.eveIdleTimer) clearTimeout(this.eveIdleTimer);
    this.eveIdleTimer = null;
  }

  // ── Captions (boards without a speaker) ──────────────────────────────────

  /** Transcript deltas arrive faster than playback; one caption update per 300 ms is plenty for a 360 px page. */
  private scheduleCaption(): void {
    if (!this.device?.showCaption || this.captionTimer) return;
    this.captionTimer = setTimeout(() => {
      this.captionTimer = null;
      this.pushCaption(this.outputTranscript.trim());
    }, 300);
  }

  private pushCaption(text: string): void {
    this.clearCaptionTimer();
    if (text) this.device?.showCaption?.(text);
  }

  private clearCaptionTimer(): void {
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = null;
  }

  /** Faces for this turn's sentences, sent to the device that shows the face (whatever plays the audio). */
  private createExpressions(device: DeviceTransport): ExpressionDirector | null {
    const config = this.shared.expressions;
    const send = device.sendExpression?.bind(device);
    if (!config || !send) return null;
    // An attached browser shows the face too.
    const peer = this.peer;
    return new ExpressionDirector({
      classify: config.classify,
      send: (expression, leadMs, strength) => {
        send(expression, leadMs, strength);
        peer?.sendExpression?.(expression, leadMs, strength);
        this.options.onExpression?.(expression, strength);
      },
      leadMs: () =>
        this.audioOutput === "laptop"
          ? this.shared.config.COMPANION_MOUTH_LATENCY_MS
          : (device.expressionLeadMs ?? 200),
      log: this.log,
    });
  }

  private startSpeaking(turn: VoiceTurn, text = this.outputTranscript.trim()): void {
    // Multiple Gemini deltas can arrive while firmware is releasing the mic.
    // Keep ONE queue/pacer for the turn; replacing it leaks active pacers that
    // all flush together when readiness arrives and overflow the device.
    if (this.pacer || turn.finished) return;
    this.firstAudioAt ||= Date.now();
    turn.beginSpeaking(text);
    // The device lip-syncs what its own speaker plays; laptop output needs a track.
    const send = this.device?.sendMouthTrack;
    this.mouth =
      send && this.audioOutput === "laptop"
        ? new MouthTrack(send, this.shared.config.COMPANION_MOUTH_LATENCY_MS)
        : null;
    this.pacer = new PacedSpeaker(
      (frame) => {
        turn.pushAudio(frame);
        this.mouth?.push(frame);
        this.playedBytes += frame.length;
        this.expressions?.played(this.playedBytes);
      },
      {
        bytesPerSecond: DEVICE_SAMPLE_RATE * 2,
        leadMs: this.shared.config?.COMPANION_PACER_LEAD_MS ?? 100,
        isReady: () => turn.phase === "speaking",
      }
    );
  }

  private async executeTool(callId: string, name: string, args: unknown): Promise<unknown> {
    if (!this.turn || this.turn.finished) return { error: "El turno terminó; no ejecutar esta acción." };
    const denial = this.options.authorizeTool?.(name);
    if (denial) {
      this.options.onTool?.({ name, status: "denied", detail: denial });
      return { ok: false, denied: true, error: denial };
    }
    const epoch = this.requestEpoch;
    const at = Date.now();
    this.toolsRan++;
    this.toolsRunning++;
    this.options.onTool?.({ name, status: "running" });
    this.log.info(`tool ${name} ${JSON.stringify(args)}`);
    try {
      const result = await this.toolEpoch.run(epoch, () => executeToolByName(this.tools, name, args, callId));
      const failure = result && typeof result === "object" && "error" in result;
      if (epoch === this.requestEpoch && !this.stopped)
        this.options.onTool?.({
          name,
          status: failure ? "error" : "done",
          ms: Date.now() - at,
          detail: failure ? String((result as { error: unknown }).error).slice(0, 240) : undefined,
        });
      this.log.debug(`tool ${name} →`, result);
      return result;
    } catch (error) {
      if (epoch === this.requestEpoch && !this.stopped)
        this.options.onTool?.({ name, status: "error", ms: Date.now() - at });
      throw error;
    } finally {
      // The model answers once it gets the output: the watchdog's clock restarts here.
      if (epoch === this.requestEpoch) {
        this.toolsRunning = Math.max(0, this.toolsRunning - 1);
        this.lastModelAt = Date.now();
      }
    }
  }

  private toolIsCurrent(): boolean {
    const epoch = this.toolEpoch.getStore();
    return (
      !this.stopped && (epoch === undefined || (epoch === this.requestEpoch && !!this.turn && !this.turn.finished))
    );
  }

  private async showOnScreen(command: ScreenCommand): Promise<void> {
    if (!this.toolIsCurrent()) return;
    const device = this.device;
    if (!device) {
      this.log.info(`screen: ${JSON.stringify(command)}`);
      return;
    }
    switch (command.kind) {
      case "card":
        device.showCard(command.card);
        device.setFace("happy");
        break;
      case "qr":
        device.showQr(
          command.url ?? this.shared.gridUrl ?? this.shared.config.COMPANION_PUBLIC_SITE_URL,
          command.caption
        );
        break;
      case "text":
        device.showText(command.text);
        break;
      case "face":
        // Listening/thinking/speaking are truthful device states. Decorative
        // model tool calls must not turn the listening indicator off mid-turn.
        if (!this.turn || this.turn.finished) device.setFace(command.state);
        break;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.requestEpoch++;
    if (this.keepWarm) clearInterval(this.keepWarm);
    this.keepWarm = null;
    this.stopWatchdog();
    this.cancelCascade();
    this.recorder?.stop();
    this.cancelEveTurn();
    this.cancelPitch();
    this.clearPendingName();
    this.clearEveIdleReset();
    this.expressions?.close();
    this.pacer?.stop();
    this.turn?.finish();
    this.session?.close();
    this.device?.close();
  }
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

/** The voice loop without a realtime model: needs the gateway (transcribe, answer, speak). */
function loadCascade(config: BridgeConfig, logger: Logger): Pick<SharedRuntime, "cascade" | "fallbackClips"> {
  if (config.COMPANION_CASCADE === "off") return {};
  if (!config.AI_GATEWAY_API_KEY) {
    logger.warn("cascada: falta AI_GATEWAY_API_KEY; sin modelo realtime, los toques se rechazan");
    return {};
  }
  return {
    cascade: gatewayCascade({
      apiKey: config.AI_GATEWAY_API_KEY,
      transcribeModels: parseModelSpecs(config.COMPANION_TRANSCRIBE_MODELS),
      ttsModel: config.COMPANION_TTS_MODEL,
      ttsVoice: config.COMPANION_TTS_VOICE ?? config.COMPANION_VOICE,
      textModel: config.COMPANION_TEXT_MODEL,
      textFallbacks: parseModelSpecs(config.COMPANION_TEXT_FALLBACK_MODELS),
      logger: logger.child("cascada"),
    }),
    fallbackClips: loadFallbackClips(CLIPS_DIR, logger),
  };
}

/** Modo pitch needs the gateway (audio → card) and the site (the board); without either, pitches end in words only. */
function loadPitch(config: BridgeConfig, logger: Logger): SharedRuntime["pitch"] {
  if (!config.AI_GATEWAY_API_KEY || !config.OWY_API_KEY) {
    logger.warn("modo pitch: falta AI_GATEWAY_API_KEY u OWY_API_KEY; los pitches no se van a cargar");
    return undefined;
  }
  let clips: Record<string, number> = {};
  try {
    clips = z.record(z.string(), z.number()).parse(JSON.parse(readFileSync(CLIPS_MANIFEST, "utf8")));
  } catch {
    logger.info("modo pitch: sin avisos pregrabados (pnpm companion:clips); Owy los dice con el modelo");
  }
  let openSpaceId: Promise<string> | null = null;
  return {
    extract: gatewayPitchExtractor({
      apiKey: config.AI_GATEWAY_API_KEY,
      model: config.COMPANION_PITCH_MODEL,
      fallbacks: parseModelSpecs(config.COMPANION_PITCH_FALLBACK_MODELS),
      eventName: config.COMPANION_EVENT_NAME,
    }),
    api: owuApi(),
    openSpaceId: () =>
      (openSpaceId ??= resolveActiveEvent()
        .then((event) => event.id)
        .catch((error: unknown) => {
          openSpaceId = null;
          throw error;
        })),
    clips,
  };
}

export async function loadSharedRuntime(config: BridgeConfig, logger: Logger): Promise<SharedRuntime> {
  const keys = { googleApiKey: config.GOOGLE_GENERATIVE_AI_API_KEY, gatewayApiKey: config.AI_GATEWAY_API_KEY };
  const createProvider = () => resolveRealtimeProvider(config.COMPANION_REALTIME_MODEL, keys);
  const provider = createProvider();
  const fallbackSpecs = parseModelSpecs(config.COMPANION_REALTIME_FALLBACKS).filter((spec) => spec !== provider.spec);
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
  const pitch = loadPitch(config, logger);
  if (brain === "eve") {
    if (!config.COMPANION_EVE_URL) throw new Error("COMPANION_BRAIN=eve necesita COMPANION_EVE_URL");
    const eve = new EveLink({
      url: config.COMPANION_EVE_URL,
      apiKey: config.OWY_API_KEY ?? null,
      logger: logger.child("eve"),
    });
    const instructions = await loadVoiceOfOwyPrompt({ eventName: config.COMPANION_EVENT_NAME });
    logger.info(`model ${provider.spec} (voz); cerebro: eve en ${config.COMPANION_EVE_URL}; grid ${gridUrl ?? "-"}`);
    return {
      config,
      provider,
      createProvider,
      definitions: new Map(),
      instructions,
      gridUrl,
      logger,
      brain,
      eve,
      expressions,
      pitch,
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
    ...fallback,
  };
}
