import { randomUUID } from "node:crypto";
import {
  experimental_getRealtimeToolDefinitions,
  tool,
  type Experimental_RealtimeServerEvent as RealtimeServerEvent,
  type Experimental_RealtimeSessionConfig as RealtimeSessionConfig,
  type ToolSet,
} from "ai";
import { z } from "zod";
import type { VoiceAssistantAudioData, VoiceAssistantRequest } from "esphome-client";
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
import { EveLink } from "./realtime/eve-link";
import { resolveRealtimeProvider, type RealtimeProvider } from "./realtime/models";
import { loadPromptBundle, loadVoiceOfOwyPrompt } from "./realtime/prompt";
import { NodeRealtimeSession } from "./realtime/session";
import {
  buildCompanionToolSet,
  executeToolByName,
  loadOwyToolDefinitions,
  resolveGridUrl,
  type FaceState,
  type OwyToolDefinition,
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
    const sessionConfig = buildSessionConfig({
      provider: this.provider,
      instructions: this.shared.instructions,
      voice: this.shared.config.COMPANION_VOICE,
      tools: toolDefinitions,
      modality: "audio",
    });

    this.session = new NodeRealtimeSession({
      provider: this.provider,
      sessionConfig,
      logger: this.log.child("gemini"),
      onToolCall: ({ callId, name, args }) => this.executeTool(callId, name, args),
      onEvent: (event) => this.onModelEvent(event),
      onClose: () => {
        // A dropped socket mid-turn must not leave the device hanging.
        this.turn?.fail("server_error", "Se cortó la conexión con el modelo");
      },
      onError: () => this.turn?.fail("server_error", "No pude conectar con el modelo"),
    });

    this.device = await (this.options.connectDevice ?? CompanionDevice.connect)(
      this.spec,
      {
        onRequestStart: (request) => this.onRequestStart(request),
        onRequestStop: () => this.onRequestStop(),
        onAudio: (chunk) => this.onDeviceAudio(chunk),
        onConnected: () => this.device?.setFace("idle"),
        onDisconnected: () => {
          this.requestEpoch++;
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

    if (this.options.lazyRealtime) void this.ensureSession();
    else await this.ensureSession();
    if (this.stopped) return;
    this.device.setFace("idle");
    this.log.info("ready");
  }

  private async ensureSession(): Promise<void> {
    if (this.stopped) return;
    const session = this.session;
    if (!session) return;
    // A tap can land while the boot-time connect is still in flight: wait for it.
    if (session.status === "connecting") await session.whenSettled();
    if (session.isConnected && !session.goAwayPending) return;
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
    await this.ensureSession();
    if (epoch !== this.requestEpoch) return;
    if (!this.session?.isConnected) {
      this.log.warn("declining pipeline: no realtime session");
      device.declineRequest();
      device.setFace("error");
      return;
    }

    if (request.conversationId) this.conversationId = request.conversationId;
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
      onPhase: (phase) => {
        this.options.onFace?.(faceForPhase(phase));
        if (phase === "finished") {
          this.pacer?.stop();
          this.pacer = null;
          this.expressions?.close();
          this.expressions = null;
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
      },
    });
    this.turn.start();
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
    this.session?.sendAudio(this.micResampler.process(pcm16k));
  }

  private async onRequestStop(): Promise<void> {
    this.cancelEveTurn();
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
      this.session?.commitAudio();
      turn.endListening(this.inputTranscript.trim());
    }
  }

  // ── Model → device ──────────────────────────────────────────────────────

  private currentResponseId: string | null = null;

  private onModelEvent(event: RealtimeServerEvent): void {
    const turn = this.turn;

    switch (event.type) {
      case "input-transcription-completed":
        // Gemini transcription can arrive after VAD/commit or even the first
        // response audio. Keep it visible in the shared debugger/log without
        // reopening capture or changing a turn that has already ended.
        if (!turn || turn.finished) return;
        if (turn.phase === "listening" && event.transcript.trim()) turn.markSpeechStarted();
        this.inputTranscript += event.transcript;
        this.options.onTranscript?.("input", event.transcript);
        // With the eve brain the reaction comes from `hablar_con_owy`'s text.
        if (this.shared.brain !== "eve") this.expressions?.react(this.inputTranscript);
        this.log.info(`escuché: "${this.inputTranscript.trim()}"`);
        return;

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
        turn?.fail("server_error", event.message);
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
            signal: abort.signal,
          });
          if (!this.toolIsCurrent()) return { respuesta: "" };
          this.eveAnswer = result.text;
          this.pushCaption(result.text);
          this.expressions?.write(result.text, true);
          return { respuesta: result.text };
        } catch (error) {
          if (abort.signal.aborted) return { respuesta: "" };
          this.log.error("eve turn failed", error);
          return { error: "Owy no respondió; disculpate en una frase y pedí que lo repitan." };
        } finally {
          if (this.eveAbort === abort) this.eveAbort = null;
        }
      },
    });
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
      },
      leadMs: () =>
        this.audioOutput === "laptop"
          ? this.shared.config.COMPANION_MOUTH_LATENCY_MS
          : (device.expressionLeadMs ?? 200),
      log: this.log,
    });
  }

  private startSpeaking(turn: VoiceTurn): void {
    // Multiple Gemini deltas can arrive while firmware is releasing the mic.
    // Keep ONE queue/pacer for the turn; replacing it leaks active pacers that
    // all flush together when readiness arrives and overflow the device.
    if (this.pacer) return;
    turn.beginSpeaking(this.outputTranscript.trim());
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
      { bytesPerSecond: DEVICE_SAMPLE_RATE * 2, leadMs: 100, isReady: () => turn.phase === "speaking" }
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
    this.cancelEveTurn();
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

export async function loadSharedRuntime(config: BridgeConfig, logger: Logger): Promise<SharedRuntime> {
  const createProvider = () =>
    resolveRealtimeProvider(config.COMPANION_REALTIME_MODEL, {
      googleApiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
      gatewayApiKey: config.AI_GATEWAY_API_KEY,
    });
  const provider = createProvider();

  let gridUrl: string | undefined;
  try {
    gridUrl = await resolveGridUrl(config.COMPANION_PUBLIC_SITE_URL);
  } catch (error) {
    logger.warn("could not resolve the public grid URL (site API unreachable?)", error);
  }

  const brain = config.COMPANION_BRAIN ?? (config.COMPANION_EVE_URL ? "eve" : "local");
  const expressions = loadExpressions(config, logger);
  if (brain === "eve") {
    if (!config.COMPANION_EVE_URL) throw new Error("COMPANION_BRAIN=eve necesita COMPANION_EVE_URL");
    const eve = new EveLink({
      url: config.COMPANION_EVE_URL,
      basic:
        config.COMPANION_EVE_BASIC_USER && config.COMPANION_EVE_BASIC_PASSWORD
          ? { username: config.COMPANION_EVE_BASIC_USER, password: config.COMPANION_EVE_BASIC_PASSWORD }
          : null,
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
  };
}
