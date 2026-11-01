import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
  fromWav,
  rmsLevel,
} from "./audio/pcm";
import { MouthTrack } from "./audio/mouth";
import { ExpressionDirector, jevClassifier, type Classifier } from "./expression";
import { HostMic } from "./audio/host-mic";
import { audioRoute, micRoute, type AudioRoute, type MicRoute } from "./audio/route";
import { loadConfig, type BridgeConfig, type DeviceSpec } from "./config";
import { CompanionDevice } from "./device/esphome";
import type { DeviceHandlers } from "./device/esphome";
import type { AudioPeer, DeviceTransport } from "./device/transport";
import { AsyncLocalStorage } from "node:async_hooks";
import { VoiceTurn, type VoiceLink } from "./device/pipeline";
import { RouteLink } from "./device/route-link";
import { faceForPhase } from "./face";
import { createLogger, type Logger } from "./log";
import { FALLBACK_LINES, gatewayCascade, loadFallbackClips, type Cascade, type FallbackClip } from "./realtime/cascade";
import { EveLink } from "./realtime/eve-link";
import { parseModelSpecs, resolveRealtimeProvider, type RealtimeProvider } from "./realtime/models";
import { resolveActiveEvent } from "../../../agent/lib/board";
import { owuApi, type OwuApi, type PlacedTrackResponse, type StickyNote } from "../../../agent/lib/owu-api";
import {
  PITCH_CLIPS,
  PITCH_LIMITS,
  PITCH_LINES,
  PitchRecorder,
  SCRIPT_PREFIX,
  gatewayDuplicateFinder,
  gatewayPitchExtractor,
  isPitchRun,
  type DuplicateFinder,
  type PitchExtractor,
  type PitchKind,
  type PitchLine,
} from "./pitch";
import {
  PitchFlow,
  type CompleteDraft,
  type PitchDraft,
  type PitchPort,
  type PitchRecording,
  type PitchVoice,
  type Placement,
} from "./pitch-flow";
import { pitchThinkingMs, sleep, TIMINGS, within, withTimeout } from "./timings";
import type { Asker, TalkContext, VoiceStatus } from "./web/contract";
import { NodeRealtimeSession, type SessionStatus } from "./realtime/session";
import { buildSessionConfig, sessionInputRate, voiceFor } from "./realtime/session-config";
import type { PitchRuntime, SharedRuntime } from "./runtime";
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

export { loadClipPcm, loadSharedRuntime, type PitchRuntime, type SharedRuntime } from "./runtime";
export {
  buildSessionConfig,
  geminiLiveOptions,
  isAudioOnlyModel,
  isGeminiModel,
  sessionInputRate,
  voiceFor,
} from "./realtime/session-config";

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

/** Provider errors that are noise, not a broken turn (an OpenAI commit after its server VAD already committed, etc.). */
const BENIGN_ERROR_CODES = new Set([
  "input_audio_buffer_commit_empty",
  "conversation_already_has_active_response",
  "response_cancel_not_active",
]);
/** After eve fails, the local brain answers alone this long (eve is not asked, so no turn waits on it). */
const EVE_BREAKER_MS = 60_000;
/** Cascade TTS has no transcript marks: roughly how fast Owy speaks, to cue faces per sentence. */
// ponytail: fixed speaking rate; use TTS word timings if a provider streams them.
const SPOKEN_CHARS_PER_SECOND = 14;

/** A turn Owy starts himself in a talk (the console's `say` / `ask`), played by the attached browser. */
interface OwnTurn {
  turn: VoiceTurn;
  abort: AbortController;
  isCurrent: () => boolean;
}

interface CascadeRun {
  turn: VoiceTurn;
  epoch: number;
  abort: AbortController;
  /** The answer is on its way (submitted once: a pause, the device's end of audio, or eve finishing). */
  submitted: boolean;
}

/**
 * One device run in modo pitch (the pitch, or an answer to Owy's question):
 * never streamed to the model, recorded here and handed to the flow as a whole.
 */
interface PitchRun extends PitchRecording {
  abort: AbortController;
  epoch: number;
  turn: VoiceTurn;
  resolveDone(wav: Buffer | null): void;
  resolveEnded(): void;
}

const isConflict = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "CONFLICT";

/** A 4xx said no for sure; anything else (a timeout, a dropped connection, a 5xx) may or may not have written. */
const isAmbiguous = (error: unknown): boolean => {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  return !(typeof status === "number" && status >= 400 && status < 500);
};

export interface DeviceSessionOptions {
  connectDevice?: (
    spec: DeviceSpec,
    handlers: DeviceHandlers,
    logger: Logger,
    options?: { signal?: AbortSignal }
  ) => Promise<DeviceTransport>;
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
  /** Aborts a connect still retrying (an Owy that is off) when the session stops. */
  private readonly connecting = new AbortController();
  private readonly toolEpoch = new AsyncLocalStorage<number>();
  private session: NodeRealtimeSession | null = null;
  private tools: ToolSet = {};
  /** The local brain's tools (all of Owy's): the realtime model's own on `local`, eve's fallback on `eve`. */
  private localTools: ToolSet | null = null;
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
  /** Retires the conversation after COMPANION_EVE_IDLE_RESET_S of silence: the next visitor starts fresh. */
  private idleTimer: NodeJS.Timeout | null = null;
  /**
   * What was said in this conversation, for the local brain: the cascade answers
   * with it, and a fresh realtime session (after a reset or a reconnect) starts
   * with it, so a tap remembers the taps before it. eve keeps its own.
   */
  private history: { role: "user" | "assistant"; content: string }[] = [];
  /** This turn's answer as said (for the history). */
  private turnAnswer = "";
  // Per-turn audio routing (device selects win over env defaults).
  private micSource: MicRoute = "device";
  private audioOutput: AudioRoute = "device";
  private peer: AudioPeer | null = null;
  private micOpenAt = 0;
  /** Settings UI choice for boards without routing selects. */
  private routeOverride: { mic?: MicRoute; output?: AudioRoute } = {};
  private unsubscribeHostMic: (() => void) | null = null;
  /** Modo pitch: this device run (a pitch or an answer), and the visitor's flow it belongs to. */
  private pitch: PitchRun | null = null;
  private flow: PitchFlow<PitchRun> | null = null;
  /** A line the realtime model must say verbatim this turn (the bridge's words, not the visitor's). */
  private script: string | null = null;
  /** Settings UI choice for boards without the pitch switch / select. */
  private pitchOverride: { mode?: boolean; voice?: PitchVoice } = {};
  /** «Owy, en vivo»: the talk around the next turns (the slide on screen, who asks); null = no talk. */
  private talk: TalkContext = null;
  /** Owy's own turn: its abort, and the timer of the line it is waiting on (a script, a clip). */
  private ownAbort: AbortController | null = null;
  private ownTimer: NodeJS.Timeout | null = null;
  private lastTurn: VoiceStatus["lastTurn"];
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
      // When eve is down the local brain answers, with every tool.
      this.localTools = buildCompanionToolSet(this.shared.definitions, runtime);
    } else {
      this.tools = buildCompanionToolSet(this.shared.definitions, runtime);
    }

    const toolDefinitions = await experimental_getRealtimeToolDefinitions({ tools: this.tools });
    const config = this.shared.config;
    const configFor = (provider: RealtimeProvider) =>
      buildSessionConfig({
        provider,
        instructions: this.shared.instructions,
        voice: voiceFor(provider, config),
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
      // A fresh session (reset, reconnect) still knows what this visitor already said.
      instructionsSuffix: () => this.historyNote() + this.talkNote(),
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
          // Back from a Wi-Fi flap: the next tap should find a warm voice, not a cold handshake.
          if (!this.options.lazyRealtime && !this.stopped && this.session) void this.ensureSession();
        },
        onDisconnected: () => {
          this.linkUp = false;
          this.requestEpoch++;
          // A pitch already understood is still placed; nobody will hear about it from this board.
          this.flow?.interrupt();
          this.cancelCascade();
          this.pacer?.stop();
          this.pacer = null;
          this.turn?.finish();
          this.session?.resetConversation();
        },
      },
      this.shared.logger,
      { signal: this.connecting.signal }
    );

    if (this.stopped) {
      this.device.close();
      this.session.close();
      return;
    }

    this.listenToHostMic();
    this.linkUp = true;
    if (this.options.lazyRealtime) void this.ensureSession();
    else {
      await this.ensureSession();
      // Physical Owys keep a warm session: the gateway closes idle ones at 5 min and caps them at 25.
      this.keepWarm = setInterval(() => this.warmTick(), TIMINGS.keepWarmEveryMs);
    }
    if (this.stopped) return;
    this.device.setFace("idle");
    this.log.info("ready");
  }

  /** Between turns: reconnect a dropped session, renew an old one. */
  private warmTick(): void {
    this.warmHostMic();
    const session = this.session;
    if (this.stopped || !session || !this.linkUp || (this.turn && !this.turn.finished)) return;
    if (session.status === "connecting") return;
    const age = session.connectedAt ? Date.now() - session.connectedAt : 0;
    if (age > TIMINGS.rotateAfterMs) this.log.info(`realtime: renuevo la sesión (${Math.round(age / 60_000)} min)`);
    if (!session.isConnected || session.goAwayPending || age > TIMINGS.rotateAfterMs) void this.ensureSession(age > TIMINGS.rotateAfterMs);
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
    // Modo pitch: recording needs no model; warm it meanwhile for what Owy says next.
    // While Owy waits for an answer, the next pitch run is that answer.
    const kind: PitchKind | null = isPitchRun(request) ? (this.flow?.awaiting ? "answer" : "pitch") : null;
    // A conversation tap ends whatever pitch was around (what it understood is still placed).
    if (!kind) this.flow?.interrupt();
    let path: TurnPath = "pitch";
    if (kind) void this.ensureSession();
    else {
      // Never hold a tap on the model when the cascade can answer: a connect already
      // under way gets a moment, then the turn starts either way. Browsers (and
      // bridges without the cascade) still wait for their session, as before.
      const session = this.session;
      if (!this.shared.cascade || this.options.lazyRealtime) await this.ensureSession();
      else if (session?.status === "connecting") await Promise.race([session.whenSettled(), sleep(TIMINGS.acceptWaitMs)]);
      if (epoch !== this.requestEpoch) return;
      const live = this.realtimeLive();
      if (!live && !this.shared.cascade) {
        this.log.warn("declining pipeline: no realtime session");
        device.declineRequest();
        device.setFace("error");
        return;
      }
      // Test fakes have no provider and no tiers: they count as the primary.
      if (live) path = this.tierPath();
      else {
        path = "cascade";
        this.log.warn(`sin sesión realtime (${this.session?.status ?? "ninguna"}): este turno va por la cascada`);
        // Warm for the next turn; this one is already answered without it.
        void this.ensureSession();
      }
    }

    if (request.conversationId) this.conversationId = request.conversationId;
    const peer = this.peer;
    const turn = this.openTurn(
      device,
      this.linkFor(device),
      path,
      // A pitch gives the person time to start and the bridge time to transcribe and place it;
      // an answer's own recorder ends it when nobody answers, so the flow can go on in this run.
      kind
        ? {
            noSpeechMs: kind === "answer" ? 0 : TIMINGS.pitchNoSpeechMs,
            // The board cancels a run that outlives its watchdog: think only as long as it allows.
            thinkingMs: pitchThinkingMs(this.shared.config?.COMPANION_PITCH_MAX_S ?? 120),
          }
        : path === "cascade"
          ? { thinkingMs: TIMINGS.cascadeThinkingMs }
          : undefined
    );
    device.acceptRequest();
    if (peer) peer.mirrorAccept();
    turn.start();
    if (kind) this.startPitch(kind, turn, epoch);
    else this.startTurnRecorder(turn, epoch);
  }

  /** This turn's events and audio: the board (when it ran the turn), an attached browser, the Mac's speaker. */
  private linkFor(device: DeviceTransport | null): VoiceLink {
    return new RouteLink({
      device,
      peer: () => this.peer,
      host: () => this.shared.hostSpeaker,
      output: () => this.audioOutput,
    });
  }

  /** ms from a frame leaving the pacer to it being heard where this turn plays (mouth and faces follow it). */
  private outputLeadMs(device: DeviceTransport | null = this.device): number {
    const config = this.shared.config;
    if (this.audioOutput === "laptop") return config?.COMPANION_MOUTH_LATENCY_MS ?? 250;
    if (this.audioOutput === "host") return this.shared.hostSpeaker?.latencyMs ?? config?.COMPANION_HOST_SPEAKER_LATENCY_MS ?? 150;
    return device?.expressionLeadMs ?? 200;
  }

  /** The primary realtime model or one of its backups (test fakes have no tiers: they count as the primary). */
  private tierPath(): TurnPath {
    return (this.session?.tierSpec ?? this.provider?.spec) === this.provider?.spec ? "realtime" : "fallback";
  }

  /**
   * Fresh per-turn state and the VoiceTurn on `link` (not started): a tap's
   * run, or one Owy starts himself in a talk (`own`: the device never opened a
   * pipeline run, so its face follows the turn explicitly).
   */
  private openTurn(
    /** Null for an own turn while the board is down: the browser and the wall carry it alone. */
    device: DeviceTransport | null,
    link: VoiceLink,
    path: TurnPath,
    timers: { noSpeechMs?: number; thinkingMs?: number } | undefined,
    own = false
  ): VoiceTurn {
    this.path = path;
    this.lastModelAt = this.pausedAt = 0;
    this.stopWatchdog();
    this.toolsRan = this.toolsRunning = 0;
    this.clearIdleReset();
    this.turnAnswer = "";
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
    this.turn = new VoiceTurn({
      link,
      logger: this.log,
      conversationId: this.conversationId,
      timers,
      onPhase: (phase) => {
        if (own) device?.setFace(faceForPhase(phase));
        this.options.onFace?.(faceForPhase(phase));
        if (phase === "thinking") this.listenEndedAt = Date.now();
        if (phase === "finished") {
          this.clearOwnTimer();
          this.pacer?.stop();
          this.pacer = null;
          this.expressions?.close();
          this.expressions = null;
          this.script = null;
          if (this.pitch?.turn === this.turn) this.endPitchRun(this.pitch);
          if (this.cascadeRun?.turn === this.turn) this.cancelCascade();
          this.recorder?.stop();
          this.recorder = null;
          this.stopWatchdog();
          this.logTurn();
          this.rememberTurn();
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
    return this.turn;
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
      limits: TIMINGS.turn,
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
    const pitch = this.pitch;
    if (pitch?.turn === turn) {
      // A pitch needs no model until Owy talks: only a line already handed to it moves to the cascade's voice.
      if (turn.phase === "thinking" && this.script) {
        const text = this.script;
        this.script = this.eveAnswer = null;
        this.clearOwnTimer();
        void this.speakText(turn, text, pitch.abort.signal, () => this.pitchIsCurrent(pitch));
      }
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
    turn.extendThinking(TIMINGS.cascadeThinkingMs);
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
    turn.extendThinking(TIMINGS.cascadeThinkingMs);
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
      answer = await this.askBrain(text, signal);
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
      Object.entries(this.localTools ?? this.tools).map(([name, definition]) => {
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
    this.turnAnswer = text;
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
    const ttfaMs = this.firstAudioAt && this.listenEndedAt ? this.firstAudioAt - this.listenEndedAt : null;
    const totalMs = Date.now() - this.turnStartedAt;
    this.log.info(`turn path=${this.path} ttfa=${ttfaMs === null ? "-" : seconds(ttfaMs)} total=${seconds(totalMs)}`);
    this.lastTurn = { path: this.path, ttfaMs, totalMs, at: new Date().toISOString() };
    this.turnStartedAt = 0;
  }

  /** For the settings UI and the talk console: which realtime tier is up and how the last turn went. */
  voiceStatus(): VoiceStatus & { realtime: SessionStatus } {
    return {
      tier: this.session?.isConnected ? this.session.tierSpec : null,
      realtime: this.session?.status ?? "disconnected",
      lastPath: this.lastPath,
      ...(this.lastTurn ? { lastTurn: this.lastTurn } : {}),
    };
  }

  // ── «Owy, en vivo»: the talk console (an attached browser) ──────────────

  get talkContext(): TalkContext {
    return this.talk;
  }

  /** The talk around the next turns: every eve turn carries it (knob taps included); null ends talk mode. */
  setTalk(talk: TalkContext): void {
    this.talk = talk;
  }

  /** Owy says `text` on his own (no tap), word for word, through the attached browser's speakers. */
  async say(text: string, clip?: string): Promise<void> {
    const own = await this.ownTurn();
    if (!own) return;
    this.turnAnswer = text;
    await this.speakLine(own, text, clip);
  }

  /** A question as text (a phone, the console): Owy's brain answers it out loud, with its tools. */
  async ask(text: string, asker: Asker): Promise<void> {
    const own = await this.ownTurn(text);
    if (!own) return;
    const { turn, abort, isCurrent } = own;
    const talk = this.talk ? { ...this.talk, asker } : null;
    const eve = this.shared.brain === "eve" ? this.shared.eve : undefined;
    if (!eve && this.realtimeLive()) {
      // The local brain is the realtime model itself: it reads the question and answers (tools included).
      this.path = this.tierPath();
      this.session!.sendText(text);
      return;
    }
    let answer = "";
    try {
      answer = await this.askBrain(text, abort.signal, this.runtime, talk);
    } catch (error) {
      if (!isCurrent()) return;
      this.log.warn("charla: el cerebro no respondió", error);
      answer = FALLBACK_LINES.retry;
    }
    if (!isCurrent()) return;
    if (!answer) return this.showAndFinish(turn, "Ahora mismo no tengo con qué pensar.");
    this.turnAnswer = answer;
    await this.speakLine(own, answer);
  }

  /** Stops whatever Owy is saying or doing: a tap's turn, his own, a pitch being recorded. */
  hush(): void {
    this.ownAbort?.abort();
    this.clearOwnTimer();
    void this.onRequestStop();
  }

  /**
   * Opens a turn Owy starts himself. The presenter wins: a running turn is
   * stopped first, except a pitch being recorded (someone is talking).
   * Null when a newer command took over while the realtime model connected.
   */
  private async ownTurn(question = ""): Promise<OwnTurn | null> {
    // The board is optional here: the line plays in the attached browser and the face reaches the
    // wall even when the knob dropped off the Wi-Fi (or was never on); its own face follows while it is up.
    const board = this.linkUp ? this.device : null;
    if (this.pitch?.turn.phase === "listening") throw new Error("Hay un pitch grabándose: esperá a que termine.");
    this.chooseRoutes();
    const peer = this.peer;
    // ponytail: the device's own speaker only plays inside a run it starts; add a firmware action if a talk needs it.
    if (this.audioOutput === "device" || (this.audioOutput === "laptop" && !peer))
      throw new Error("Para que Owy hable solo, la salida tiene que ser la Mac o un navegador enchufado.");
    if (this.turn && !this.turn.finished) this.hush();
    const epoch = ++this.requestEpoch;
    const session = this.session;
    if (session?.status === "connecting") await Promise.race([session.whenSettled(), sleep(TIMINGS.acceptWaitMs)]);
    else if (!board && !this.realtimeLive()) await Promise.race([this.ensureSession(), sleep(TIMINGS.ownConnectWaitMs)]);
    if (epoch !== this.requestEpoch || this.stopped || this.peer !== peer) return null;

    const turn = this.openTurn(board, this.linkFor(null), "realtime", { thinkingMs: TIMINGS.cascadeThinkingMs }, true);
    const abort = new AbortController();
    this.ownAbort = abort;
    peer?.mirrorAccept(true);
    turn.start();
    turn.endListening(question);
    if (question) {
      this.inputTranscript = question;
      this.options.onTranscript?.("input", question);
    }
    return {
      turn,
      abort,
      isCurrent: () =>
        !this.stopped && epoch === this.requestEpoch && this.turn === turn && !turn.finished && !abort.signal.aborted,
    };
  }

  /**
   * Owy says `text` word for word: the live voice ([GUION]); without one, the
   * line's recording (same voice, no network) and then the cascade's voice;
   * the screen at worst.
   */
  private async speakLine(own: OwnTurn, text: string, clip?: string): Promise<void> {
    const { turn, abort, isCurrent } = own;
    if (!isCurrent()) return;
    if (this.realtimeLive()) {
      this.path = this.tierPath();
      this.script = text;
      // The caption is the line itself (response-done pushes `eveAnswer`); a degrade speaks it through the cascade.
      this.eveAnswer = text;
      if (this.shared.brain === "eve") this.expressions?.write(text, true);
      this.session!.sendText(SCRIPT_PREFIX + text);
      // A socket that looks alive and never starts the line: the recording, else the cascade.
      this.ownTimer = setTimeout(
        () => {
          this.ownTimer = null;
          if (!isCurrent() || this.firstAudioAt || turn.phase !== "thinking") return;
          if (clip && this.clipMs(clip) > 0) {
            this.session?.resetConversation();
            void this.ensureSession();
            this.playOwnClip(own, text, clip);
            return;
          }
          this.degrade(turn, "el modelo no dijo el guion");
        },
        2 * (this.shared.config?.COMPANION_ACK_MS ?? 2500)
      );
      return;
    }
    if (clip && this.playOwnClip(own, text, clip)) return;
    if (this.shared.cascade) {
      this.path = "cascade";
      return this.speakText(turn, text, abort.signal, isCurrent);
    }
    this.path = "offline";
    this.pushCaption(text);
    this.options.onTranscript?.("output", text);
    this.showAndFinish(turn, text);
  }

  /** A recorded line the attached browser plays from public/companion-audio/clips; false when there is none. */
  private playOwnClip(
    { turn, isCurrent }: Pick<OwnTurn, "turn" | "isCurrent">,
    text: string,
    clip: string,
    /** A talk's line is the offline road; a pitch cue keeps the pitch's. */
    path: TurnPath | null = "offline"
  ): boolean {
    const ms = this.clipMs(clip);
    const peer = this.peer;
    if (ms <= 0 || !peer?.playClip || !isCurrent()) return false;
    if (path) this.path = path;
    this.firstAudioAt ||= Date.now();
    turn.beginSpeaking(text);
    peer.playClip(clip);
    this.pushCaption(text);
    this.options.onTranscript?.("output", text);
    this.expressions?.write(text, true);
    const end = Date.now() + ms;
    this.clearOwnTimer();
    this.ownTimer = setInterval(() => {
      if (!isCurrent()) return this.clearOwnTimer();
      // No PCM flows through the bridge: keep the turn's stall watchdog fed until the clip ends.
      if (Date.now() < end) return turn.heartbeat();
      this.clearOwnTimer();
      turn.endSpeaking({ continueConversation: false, speech: text });
    }, 250);
    return true;
  }

  private clearOwnTimer(): void {
    if (this.ownTimer) clearTimeout(this.ownTimer);
    this.ownTimer = null;
  }

  private clipMs(id: string): number {
    return this.shared.clips?.[id] ?? this.shared.pitch?.clips[id] ?? 0;
  }

  /** The talk, for the local brain's instructions (eve gets it in the turn's attributes instead). */
  private talkNote(talk: TalkContext = this.talk, local = this.shared.brain !== "eve"): string {
    if (!talk || !local) return "";
    return `\n\n## Charla en vivo\nEstás co-presentando una charla con Agustín frente a público. Respuestas de hasta veinte segundos, una sola idea, y devolvele la palabra. ${
      talk.asker === "audience" ? "Ahora te habla alguien del público: respondele a esa persona." : "Ahora te habla Agustín."
    }\nEn pantalla: ${talk.slide}`;
  }

  // ── Audio routing ───────────────────────────────────────────────────────

  get id(): string {
    return this.spec.id;
  }

  get connected(): boolean {
    return this.device !== null;
  }

  /** Current routing and where it comes from (device selects, settings UI, or env). */
  audioRouting(): { mic: MicRoute; output: AudioRoute; source: "device" | "override" | "env" } {
    const config: Partial<BridgeConfig> = this.shared.config ?? {}; // test fakes omit config
    const fromDevice = this.device?.getMicSource?.() ?? null;
    if (fromDevice !== null)
      return { mic: fromDevice, output: this.device?.getAudioOutput?.() ?? "device", source: "device" };
    const overridden = this.routeOverride.mic !== undefined || this.routeOverride.output !== undefined;
    return {
      mic: this.routeOverride.mic ?? micRoute(config.COMPANION_MIC_SOURCE),
      output: this.routeOverride.output ?? audioRoute(config.COMPANION_AUDIO_OUTPUT),
      source: overridden ? "override" : "env",
    };
  }

  /** From the settings UI: writes the device select when the board has one, otherwise remembers it here. */
  setAudioRouting(which: "mic", route: MicRoute): void;
  setAudioRouting(which: "output", route: AudioRoute): void;
  setAudioRouting(which: "mic" | "output", route: MicRoute): void {
    const device = this.device;
    if (device?.getMicSource?.() != null && device.setAudioRoute) {
      if (which === "mic") device.setAudioRoute("mic", route);
      else device.setAudioRoute("output", audioRoute(route));
    } else if (which === "mic") this.routeOverride.mic = route;
    else this.routeOverride.output = audioRoute(route);
    if (which === "mic" && route === "host") this.shared.hostMic?.ensureOpen();
    if (which === "output" && route === "host") this.shared.hostSpeaker?.ensureOpen();
  }

  /** The Mac's own mic feeds this device's turns while its route says so. */
  private listenToHostMic(): void {
    this.unsubscribeHostMic?.();
    this.unsubscribeHostMic =
      this.shared.hostMic?.onPcm((pcm) => {
        if (this.micSource !== "host") return;
        // No echo cancellation: while (and right after) Owy plays on the Mac, its mic hears the room's PA.
        if (this.shared.hostSpeaker?.busy && this.pitch?.turn !== this.turn) return;
        this.onMicPcm(pcm);
      }) ?? null;
    this.warmHostMic();
  }

  /** The Mac's mic is opened ahead of the tap that needs it: no clipped first words. */
  private warmHostMic(): void {
    const routing = this.audioRouting();
    if (this.shared.hostMic && routing.mic === "host") this.shared.hostMic.ensureOpen();
    if (routing.output === "host") this.shared.hostSpeaker?.ensureOpen();
  }

  /**
   * Device selects (mic_source / audio_output) first, env defaults otherwise; laptop needs an
   * attached browser, the Mac's mic needs to be open and hearing something. Otherwise: the device.
   */
  private chooseRoutes(): void {
    const routing = this.audioRouting();
    let mic = routing.mic;
    let output = routing.output;
    if (mic === "host") {
      const hostMic = this.shared.hostMic;
      hostMic?.ensureOpen();
      if (!hostMic?.ready) {
        const status = hostMic?.status();
        this.log.warn(
          `mic de la Mac ${status ? `${status.health}${status.detail ? ` (${status.detail})` : ""}` : "no disponible"}; este turno usa el del dispositivo`
        );
        mic = "device";
      }
    }
    if (output === "host") {
      const speaker = this.shared.hostSpeaker;
      speaker?.ensureOpen();
      if (!speaker?.ready) {
        const status = speaker?.status();
        output = this.peer ? "laptop" : "device";
        this.log.warn(
          `salida de la Mac ${status ? `${status.health}${status.detail ? ` (${status.detail})` : ""}` : "no disponible"}; este turno suena en ${output === "laptop" ? "el navegador" : "el dispositivo"}`
        );
      }
    }
    if ((mic === "laptop" || output === "laptop") && !this.peer) {
      this.log.warn("laptop audio requested but no browser is attached to this device; using the device");
      if (mic === "laptop") mic = "device";
      output = "device";
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
    // A stop while the pitch is being recorded drops it; later, what was understood is still placed.
    this.flow?.interrupt();
    this.cancelPitch();
    this.cancelCascade();
    this.requestEpoch++;
    // Tap while speaking (or wake-word "stop"): drop the rest of this reply.
    const turn = this.turn;
    if (turn && !turn.finished) {
      this.discardedResponseId = this.currentResponseId;
      this.pacer?.stop();
      this.pacer = null;
      if (this.audioOutput === "host") this.shared.hostSpeaker?.flush();
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

  /** The mode and Owy's reply level as the settings UI shows them: the board's, the settings override, or env. */
  pitchSettings(): { mode: boolean; voice: PitchVoice; source: "device" | "override" | "env" } {
    const config: Partial<BridgeConfig> = this.shared.config ?? {}; // test fakes omit config
    const fromDevice = this.device?.isPitchMode?.() ?? null;
    // Boards flashed before `select.pitch_voice` have the old «Owy reacciona» switch.
    const reacts = this.device?.isPitchReacts?.() ?? null;
    const voice =
      this.device?.getPitchVoice?.() ??
      this.pitchOverride.voice ??
      (reacts !== null ? (reacts ? "react" : "confirm") : null) ??
      config.COMPANION_PITCH_VOICE ??
      (config.COMPANION_PITCH_REACTS ? "react" : "confirm");
    if (fromDevice !== null) return { mode: fromDevice, voice, source: "device" };
    const overridden = this.pitchOverride.mode !== undefined || this.pitchOverride.voice !== undefined;
    return {
      mode: this.pitchOverride.mode ?? config.COMPANION_PITCH_MODE ?? false,
      voice,
      source: overridden ? "override" : "env",
    };
  }

  /** From the settings UI / the talk console: the board's switch when it has one, otherwise remembered here. */
  setPitchMode(on: boolean): void {
    const device = this.device;
    if (device?.setSwitch && device.isPitchMode?.() != null) device.setSwitch("pitch_mode", on);
    else this.pitchOverride.mode = on;
  }

  setPitchVoice(voice: PitchVoice): void {
    const device = this.device;
    if (device?.setPitchVoice && device.getPitchVoice?.() != null) device.setPitchVoice(voice);
    else this.pitchOverride.voice = voice;
  }

  private pitchVoice(): PitchVoice {
    return this.pitchSettings().voice;
  }

  /** A pitch run opened: record it, and hand it to the visitor's flow (a new one, or the one waiting for this answer). */
  private startPitch(kind: PitchKind, turn: VoiceTurn, epoch: number): void {
    const config: Partial<BridgeConfig> = this.shared.config ?? {};
    const limits =
      kind === "pitch"
        ? {
            ...PITCH_LIMITS.pitch,
            silenceMs: (config.COMPANION_PITCH_SILENCE_S ?? 10) * 1000,
            maxMs: (config.COMPANION_PITCH_MAX_S ?? 120) * 1000,
          }
        : PITCH_LIMITS.answer;
    // Owy says it is listening. People start talking right away, over it: nothing is dropped, and
    // the extractor is told to leave Owy's line out (an answer waits for the question to end).
    const cueMs = kind === "pitch" && this.pitchVoice() !== "silent" ? this.playClip("pitch-listen") : 0;
    let resolveDone: (wav: Buffer | null) => void = () => {};
    let resolveEnded: () => void = () => {};
    const run: PitchRun = {
      kind,
      epoch,
      turn,
      abort: new AbortController(),
      done: new Promise<Buffer | null>((resolve) => (resolveDone = resolve)),
      ended: new Promise<void>((resolve) => (resolveEnded = resolve)),
      resolveDone: (wav) => resolveDone(wav),
      resolveEnded: () => resolveEnded(),
      live: () => this.pitchIsCurrent(run),
      recorder: new PitchRecorder({
        kind,
        limits,
        rmsThreshold: config.COMPANION_PITCH_VAD_RMS,
        // A question Owy just asked through the laptop's speakers is still in the room for a moment.
        ignoreMs: kind === "answer" ? 400 : 0,
        onSpeechStart: () => {
          if (this.pitch === run) turn.markSpeechStarted();
        },
        onDone: (reason) => {
          if (this.pitch === run) this.submitPitch(reason);
        },
      }),
    };
    this.pitch = run;
    run.recorder.start();
    this.log.info(`pitch: grabando (${kind}${cueMs > 0 ? `, aviso de ${cueMs} ms` : ""})`);
    if (kind === "answer" && this.flow?.takeAnswer(run)) return;

    // A new pitch: a flow still around keeps only what it already understood.
    this.flow?.interrupt();
    const runtime = this.shared.pitch;
    if (!runtime) {
      void run.done.then((wav) => {
        if (!wav) return;
        this.log.warn("pitch: falta AI_GATEWAY_API_KEY u OWY_API_KEY; no se carga nada");
        return this.sayPitchLine(run, "unconfigured");
      });
      return;
    }
    const flow = new PitchFlow<PitchRun>(this.pitchPort(runtime));
    this.flow = flow;
    void flow
      .run(run)
      .catch((error: unknown) => this.log.error("pitch failed", error))
      .finally(() => {
        if (this.flow === flow) this.flow = null;
      });
  }

  /** Plays a pre-rendered cue where this turn's audio goes; 0 when nothing can play it. */
  private playClip(id: string): number {
    const ms = this.clipMs(id);
    if (ms <= 0) return 0;
    if (this.audioOutput === "host") {
      const pcm = this.shared.pitch?.clipPcm?.[id];
      const speaker = this.shared.hostSpeaker;
      if (!pcm || !speaker?.ready) return 0;
      speaker.write(pcm);
      return ms;
    }
    const sink = this.audioOutput === "laptop" ? this.peer : this.device;
    if (!sink?.playClip) return 0;
    sink.playClip(id);
    return ms;
  }

  private cancelPitch(): void {
    const run = this.pitch;
    if (!run) return;
    this.endPitchRun(run);
    run.abort.abort();
    this.pitch = null;
  }

  /** The run is over on the device: whoever waits on its recording or its end gets an answer. */
  private endPitchRun(run: PitchRun): void {
    run.recorder.stop();
    run.resolveDone(null);
    run.resolveEnded();
  }

  private pitchIsCurrent(p: PitchRun): boolean {
    return (
      !this.stopped &&
      this.pitch === p &&
      p.epoch === this.requestEpoch &&
      this.turn === p.turn &&
      !p.turn.finished &&
      !p.abort.signal.aborted
    );
  }

  /** The second tap, or the recorder's own end: the recording is complete; the flow takes it from here. */
  private submitPitch(reason: "submit" | "silence" | "cap"): void {
    const run = this.pitch;
    if (!run || run.turn.phase !== "listening") return;
    run.recorder.stop();
    // The second tap's buzz lands in the last frames.
    if (reason === "submit") run.recorder.trimTailMs(300);
    this.log.info(
      `pitch: grabación terminada (${run.kind}, ${reason}, ${(run.recorder.durationMs / 1000).toFixed(1)} s, habló ${(run.recorder.speechMs / 1000).toFixed(1)} s, pico ${Math.round(run.recorder.peak * 100)}%, mic ${this.micSource})`
    );
    run.turn.endListening("");
    if (run.kind === "pitch") {
      // What Owy says next needs the voice: a fresh conversation, connected while the pitch is understood.
      this.session?.resetConversation();
      this.conversationId = randomUUID();
      void this.ensureSession();
    }
    run.resolveDone(run.recorder.wav());
  }

  /** What a visitor's flow can do with this device. */
  private pitchPort(runtime: PitchRuntime): PitchPort<PitchRun> {
    const since = Date.now();
    return {
      log: this.log,
      extract: runtime.extract,
      voice: () => this.pitchVoice(),
      canAsk: () => !!this.device?.pitchPrompt,
      heard: (run, transcript) => {
        this.options.onTranscript?.("input", transcript);
        this.expressions?.react(transcript);
        // The knob's « heard » pill shows the transcript.
        run.turn.heard(transcript);
      },
      say: (run, line) => this.sayPitchLine(run, line),
      announce: (run, text) => this.announcePitch(run, text),
      prompt: (field) => this.device?.pitchPrompt?.(field),
      place: (draft) => this.placePitch(runtime, draft, since),
      findDuplicate: (draft, signal) => this.findDuplicatePitch(runtime, draft, signal),
      showCard: (card) => this.device?.showCard(card),
      saveFailure: (reason, draft, wav) => this.savePitchFailure(reason, draft, wav),
    };
  }

  /**
   * A fixed line in `run`: the recording when there is one (the browser's file,
   * or its PCM through the board's speaker; no network), Owy's live voice
   * otherwise. Callado: errors go on the screen and a question is the knob's
   * own hint once its mic opens. Resolves once the run is over on the device.
   */
  private async sayPitchLine(run: PitchRun | null, line: PitchLine): Promise<void> {
    const text = PITCH_LINES[line];
    const question = line === "askTopic" || line === "askName";
    if (!run) {
      // No run to talk in (nobody answered, the board was busy): the words go on the screen.
      if (!question) this.device?.showText(text);
      return;
    }
    if (!this.pitchIsCurrent(run)) return;
    if (this.pitchVoice() === "silent") {
      if (!question) this.device?.showText(text);
      run.turn.finish();
      return run.ended;
    }
    const clip = PITCH_CLIPS[line];
    if (!(clip && this.playPitchClip(run, clip, text))) await this.speakScript(text, run);
    return run.ended;
  }

  /** The card is on the board: Owy says where (Callado: the card on screen is enough). */
  private async announcePitch(run: PitchRun | null, text: string): Promise<void> {
    if (!run || !this.pitchIsCurrent(run)) return;
    if (this.pitchVoice() === "silent") {
      run.turn.finish();
      return run.ended;
    }
    await this.speakScript(text, run);
    return run.ended;
  }

  /** A recorded cue: the attached browser plays the file, the board's speaker gets its PCM; false when neither can. */
  private playPitchClip(run: PitchRun, clip: string, text: string): boolean {
    const isCurrent = () => this.pitchIsCurrent(run);
    if (this.audioOutput === "laptop") return this.playOwnClip({ turn: run.turn, isCurrent }, text, clip, null);
    const pcm = this.shared.pitch?.clipPcm?.[clip];
    if (!pcm || !isCurrent()) return false;
    this.turnAnswer = text;
    this.pushCaption(text);
    this.options.onTranscript?.("output", text);
    this.expressions?.write(text, true);
    this.startSpeaking(run.turn, text);
    for (const frame of this.chunker.push(pcm)) this.pacer?.push(frame);
    this.finishSpeaking(run.turn, text);
    return true;
  }

  /**
   * The realtime model says the bridge's line in Owy's voice, through the
   * normal speaking pipeline; no live model (or one that never starts the
   * line) → the cascade's voice; no voice at all → the screen.
   */
  private async speakScript(text: string, p: PitchRun): Promise<void> {
    if (!this.pitchIsCurrent(p)) return;
    if (!this.realtimeLive()) await Promise.race([this.ensureSession(), sleep(TIMINGS.ownConnectWaitMs)]);
    if (!this.pitchIsCurrent(p)) return;
    if (!this.realtimeLive()) {
      this.log.warn("pitch: sin modelo realtime para hablar; va por la voz de la cascada");
      return this.speakText(p.turn, text, p.abort.signal, () => this.pitchIsCurrent(p));
    }
    this.script = text;
    // The caption is the script itself (response-done pushes `eveAnswer`); the expressions follow its sentences.
    this.eveAnswer = text;
    if (this.shared.brain === "eve") this.expressions?.write(text, true);
    this.session!.sendText(SCRIPT_PREFIX + text);
    this.clearOwnTimer();
    this.ownTimer = setTimeout(
      () => {
        this.ownTimer = null;
        if (!this.pitchIsCurrent(p) || this.firstAudioAt || p.turn.phase !== "thinking" || this.script !== text) return;
        this.log.warn("pitch: el modelo no dijo el guion; va por la voz de la cascada");
        this.script = this.eveAnswer = null;
        this.session?.resetConversation();
        void this.ensureSession();
        void this.speakText(p.turn, text, p.abort.signal, () => this.pitchIsCurrent(p));
      },
      2 * (this.shared.config?.COMPANION_ACK_MS ?? 2500)
    );
  }

  /**
   * One card on the board, never two. A slow write is never raced by a
   * second one: past TIMINGS.placeTimeoutMs the bridge looks for the card and keeps
   * waiting on the same request. Only a request that is over and failed
   * ambiguously (dropped connection, 5xx) is tried again, once, after
   * looking for its card — so a bad network costs neither the pitch nor a duplicate.
   */
  private async placePitch(runtime: PitchRuntime, draft: CompleteDraft, since: number): Promise<Placement> {
    const denial = this.options.authorizeTool?.("create_track");
    if (denial) return { denied: denial };
    const openSpaceId = await runtime.openSpaceId();
    const input = {
      openSpaceId,
      title: draft.title,
      speaker: draft.speaker ?? undefined,
      description: draft.description ?? undefined,
      needsTV: draft.needsTV,
      needsWhiteboard: draft.needsWhiteboard,
      source: "companion",
    };
    const found = async (): Promise<ScreenCard | null> => {
      const note = await this.findPlaced(runtime, openSpaceId, draft.title, since);
      if (!note) return null;
      this.log.info(`pitch: la charla «${note.title}» ya estaba en la grilla (${note.room} ${note.timeSlot})`);
      return { title: note.title, speaker: note.speaker, room: note.room, timeSlot: note.timeSlot };
    };
    const request = runtime.api.tracks.createPlaced(input);
    let outcome = await within(request, TIMINGS.placeTimeoutMs);
    if ("late" in outcome) {
      this.log.warn(`pitch: la grilla tarda más de ${TIMINGS.placeTimeoutMs / 1000} s; me fijo si la charla ya quedó y sigo esperando`);
      const card = await found();
      if (card) return card;
      outcome = await within(request, TIMINGS.placeTimeoutMs);
      if ("late" in outcome) throw new Error(`la grilla no contestó en ${(2 * TIMINGS.placeTimeoutMs) / 1000} s`);
    }
    let placed: PlacedTrackResponse;
    if ("error" in outcome) {
      const error = outcome.error;
      if (isConflict(error)) return "full";
      if (!isAmbiguous(error)) throw error;
      this.log.warn("pitch: la grilla no contestó claro; me fijo si la charla quedó antes de reintentar", error);
      const card = await found();
      if (card) return card;
      try {
        placed = await withTimeout(runtime.api.tracks.createPlaced(input), TIMINGS.placeTimeoutMs);
      } catch (retryError) {
        if (isConflict(retryError)) return "full";
        throw retryError;
      }
    } else placed = outcome.value;
    const card: ScreenCard = {
      title: placed.note.title,
      speaker: placed.note.speaker ?? undefined,
      room: placed.note.room ?? placed.placement.room,
      timeSlot: placed.note.timeSlot ?? placed.placement.timeSlot,
    };
    this.log.info(`pitch: charla creada «${card.title}» → ${card.room} ${card.timeSlot} (${placed.placement.reasoning})`);
    return card;
  }

  /** The card on the board that is this same talk (asked while Owy may still be asking for the name). */
  private async findDuplicatePitch(runtime: PitchRuntime, draft: CompleteDraft, signal: AbortSignal): Promise<ScreenCard | null> {
    if (!runtime.dedupe) return null;
    const started = Date.now();
    const notes = await withTimeout(runtime.api.tracks.list({ openSpaceId: await runtime.openSpaceId() }), TIMINGS.placeTimeoutMs);
    const index = await runtime.dedupe.find(
      { title: draft.title, description: draft.description, transcript: draft.transcript },
      notes,
      signal
    );
    this.log.info(`pitch: ¿ya está en la grilla? ${index === null ? "no" : `sí, «${notes[index].title}»`} (${notes.length} cards, ${Date.now() - started} ms)`);
    if (index === null) return null;
    const note = notes[index];
    return { title: note.title, speaker: note.speaker ?? undefined, room: note.room, timeSlot: note.timeSlot };
  }

  /** The talk this flow created, if the write landed after all. */
  private async findPlaced(runtime: PitchRuntime, openSpaceId: string, title: string, since: number): Promise<StickyNote | null> {
    const want = title.trim().toLowerCase();
    try {
      const notes = await withTimeout(runtime.api.tracks.list({ openSpaceId }), TIMINGS.placeTimeoutMs);
      return (
        notes.find(
          (note) =>
            note.title.trim().toLowerCase() === want && (!note.createdAt || Date.parse(note.createdAt) >= since - 60_000)
        ) ?? null
      );
    } catch (error) {
      this.log.warn("pitch: tampoco pude leer la grilla", error);
      return null;
    }
  }

  /** A pitch the bridge could not place, kept for the staff (COMPANION_LOG_DIR only: a visitor's voice stays nowhere else). */
  private savePitchFailure(reason: string, draft: PitchDraft | null, wav: Buffer): void {
    const dir = this.shared.config?.COMPANION_LOG_DIR;
    if (!dir) return;
    const base = path.join(dir, "pitch-failures", `${new Date().toISOString().replace(/[:.]/g, "-")}-${this.spec.id}`);
    void mkdir(path.dirname(base), { recursive: true })
      .then(() =>
        Promise.all([
          writeFile(`${base}.wav`, wav),
          writeFile(`${base}.json`, JSON.stringify({ reason, device: this.spec.id, draft }, null, 2)),
        ])
      )
      .then(() => this.log.warn(`pitch: guardado para el staff en ${base}.wav`))
      .catch((error: unknown) => this.log.warn("pitch: no pude guardar el pitch fallido", error));
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
        this.turnAnswer = (this.eveAnswer ?? this.spokenText).trim();
        this.eveAnswer = null;
        const pacer = this.pacer;
        const endTurn = () => {
          const where =
            this.audioOutput === "laptop"
              ? "reproducidos en el navegador"
              : this.audioOutput === "host"
                ? "en la salida de la Mac"
                : "esperando fin en dispositivo";
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
          text = await this.askBrain(texto, undefined, runtime);
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
   * Owy's brain for what the person said: eve when it is the brain and answering,
   * the local brain (the text model with every tool and this conversation) when
   * it is not — and, after eve failed, for a minute without asking it, so a turn
   * doesn't wait out eve's deadline each time. Throws only when no brain answered.
   */
  private async askBrain(
    texto: string,
    signal?: AbortSignal,
    runtime: ToolRuntime | null = this.runtime,
    talk: TalkContext = this.talk
  ): Promise<string> {
    const eve = this.shared.brain === "eve" ? this.shared.eve : undefined;
    const cascade = this.shared.cascade;
    if (eve && Date.now() >= (this.shared.eveDownUntil ?? 0)) {
      try {
        return await this.askEve(texto, signal, eve, runtime, talk);
      } catch (error) {
        if (signal?.aborted || !cascade) throw error;
        this.shared.eveDownUntil = Date.now() + EVE_BREAKER_MS;
        this.log.warn(`eve no respondió; contesta el cerebro local (sin eve por ${EVE_BREAKER_MS / 1000} s)`, error);
      }
    }
    if (!cascade) throw new Error("sin cerebro: eve no responde y no hay modelo de texto");
    this.expressions?.react(texto);
    const answer = await cascade.answer({
      text: texto,
      history: [...this.history],
      instructions: (this.shared.localInstructions ?? this.shared.instructions) + this.talkNote(talk, true),
      tools: this.cascadeTools(),
      signal: signal ?? AbortSignal.timeout(TIMINGS.cascadeThinkingMs),
    });
    if (!this.toolIsCurrent()) return "";
    this.pushCaption(answer);
    this.expressions?.write(answer, true);
    return answer;
  }

  /**
   * One eve turn for what the person said; eve's text is the caption (streamed)
   * and the answer. "" when the turn was abandoned (tap, newer turn).
   */
  private async askEve(
    texto: string,
    signal?: AbortSignal,
    eve: EveLink | undefined = this.shared.eve,
    runtime: ToolRuntime | null = this.runtime,
    talk: TalkContext = this.talk
  ): Promise<string> {
    if (!eve || !runtime) throw new Error("sin eve");
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
        talk,
        onDelta: (text) => {
          if (!this.toolIsCurrent()) return;
          this.scheduleEveCaption(text);
          this.expressions?.write(text);
        },
        onTool: (name) => {
          this.log.info(`owy (eve) usa ${name}`);
          // The wall's talk diagram lights the box of the tool eve is running.
          this.options.onTool?.({ name, status: "running" });
        },
        signal: signal ? AbortSignal.any([abort.signal, signal]) : abort.signal,
      });
      if (!this.toolIsCurrent()) return "";
      this.pushCaption(result.text);
      this.expressions?.write(result.text, true);
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
    }, TIMINGS.captionEveryMs);
  }

  /** A tap or a dropped device mid-turn also stops the agent's work on it. */
  private cancelEveTurn(): void {
    if (!this.eveAbort) return;
    this.eveAbort.abort();
    this.eveAbort = null;
    void this.shared.eve?.cancel(this.spec.id);
  }

  /** Nobody talked for a while: the next visitor gets a fresh conversation (memory lives in eve, not in the session). */
  // ── Conversation memory ──────────────────────────────────────────────────

  /** A turn ended: keep what was said, and forget the conversation if nobody talks for a while. */
  private rememberTurn(): void {
    const said = this.inputTranscript.trim();
    const answer = this.turnAnswer.trim();
    this.turnAnswer = "";
    if (this.path !== "pitch" && said && answer) {
      this.history.push({ role: "user", content: said }, { role: "assistant", content: answer });
      // ponytail: last 6 exchanges verbatim; summarize if visitors' conversations run longer.
      this.history = this.history.slice(-12);
    }
    this.clearIdleReset();
    const seconds = this.shared.config?.COMPANION_EVE_IDLE_RESET_S;
    if (seconds) this.idleTimer = setTimeout(() => this.forgetConversation(), seconds * 1000);
  }

  /** Nobody talked for a while: the next visitor gets a fresh conversation on every brain. */
  private forgetConversation(): void {
    this.idleTimer = null;
    if (this.turn && !this.turn.finished) return;
    this.history = [];
    const eve = this.shared.brain === "eve" ? this.shared.eve : undefined;
    if (eve) {
      this.log.info("conversación cerrada por inactividad; eve session reset");
      void eve.reset(this.spec.id);
      return;
    }
    // The local brain's memory is the realtime session itself (plus the history it started with).
    this.log.info("conversación cerrada por inactividad; la próxima empieza de cero");
    this.session?.resetConversation();
    if (!this.options.lazyRealtime && this.linkUp && !this.stopped) void this.ensureSession();
  }

  private clearIdleReset(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Appended to a fresh realtime session's instructions (local brain): the conversation so far. */
  private historyNote(): string {
    if (this.shared.brain === "eve" || this.history.length === 0) return "";
    const lines = this.history.map(({ role, content }) => `${role === "user" ? "Persona" : "Owy"}: ${content}`);
    // ponytail: oldest exchanges dropped past ~2000 chars; plenty for a booth conversation.
    while (lines.length > 2 && lines.join("\n").length > 2000) lines.splice(0, 2);
    return `\n\n## Lo que ya hablaron (la misma persona sigue la conversación; no la saludes de nuevo)\n${lines.join("\n")}`;
  }

  // ── Captions (boards without a speaker) ──────────────────────────────────

  /** Transcript deltas arrive faster than playback; one caption update per 300 ms is plenty for a 360 px page. */
  private scheduleCaption(): void {
    if (!this.device?.showCaption || this.captionTimer) return;
    this.captionTimer = setTimeout(() => {
      this.captionTimer = null;
      this.pushCaption(this.outputTranscript.trim());
    }, TIMINGS.captionEveryMs);
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
  private createExpressions(device: DeviceTransport | null): ExpressionDirector | null {
    const config = this.shared.expressions;
    const send = device?.sendExpression?.bind(device);
    // A board without a face gets none; with no board up (an own turn) the browser and the wall still do.
    if (!config || (device && !send)) return null;
    // An attached browser shows the face too.
    const peer = this.peer;
    return new ExpressionDirector({
      classify: config.classify,
      send: (expression, leadMs, strength) => {
        send?.(expression, leadMs, strength);
        peer?.sendExpression?.(expression, leadMs, strength);
        this.options.onExpression?.(expression, strength);
      },
      leadMs: () => this.outputLeadMs(device),
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
    // The device lip-syncs what its own speaker plays; audio played elsewhere needs a track.
    const send = this.device?.sendMouthTrack;
    this.mouth = send && this.audioOutput !== "device" ? new MouthTrack(send, this.outputLeadMs()) : null;
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
    this.connecting.abort();
    this.requestEpoch++;
    if (this.keepWarm) clearInterval(this.keepWarm);
    this.keepWarm = null;
    this.ownAbort?.abort();
    this.clearOwnTimer();
    this.clearCaptionTimer();
    this.stopWatchdog();
    this.cancelCascade();
    this.recorder?.stop();
    this.cancelEveTurn();
    this.flow?.cancel();
    this.cancelPitch();
    this.unsubscribeHostMic?.();
    this.clearIdleReset();
    this.expressions?.close();
    this.pacer?.stop();
    this.turn?.finish();
    this.session?.close();
    this.device?.close();
  }
}
