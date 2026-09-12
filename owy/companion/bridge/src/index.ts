import { randomUUID } from "node:crypto";
import {
  experimental_getRealtimeToolDefinitions,
  type Experimental_RealtimeServerEvent as RealtimeServerEvent,
  type Experimental_RealtimeSessionConfig as RealtimeSessionConfig,
  type ToolSet,
} from "ai";
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
import { loadConfig, type BridgeConfig, type DeviceSpec } from "./config";
import { CompanionDevice } from "./device/esphome";
import type { DeviceHandlers } from "./device/esphome";
import type { DeviceTransport } from "./device/transport";
import { AsyncLocalStorage } from "node:async_hooks";
import { VoiceTurn } from "./device/pipeline";
import { createLogger, type Logger } from "./log";
import { resolveRealtimeProvider, type RealtimeProvider } from "./realtime/models";
import { loadPromptBundle } from "./realtime/prompt";
import { NodeRealtimeSession } from "./realtime/session";
import {
  buildCompanionToolSet,
  executeToolByName,
  loadOwyToolDefinitions,
  resolveGridUrl,
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
    inputAudioFormat: { type: "audio/pcm", rate: DEVICE_SAMPLE_RATE },
    outputAudioFormat: { type: "audio/pcm", rate: GEMINI_OUTPUT_SAMPLE_RATE },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: options.tools,
  };
  if (options.modality === "audio") base.voice = options.voice;

  if (options.provider.provider === "google") {
    // Non-`google` keys are merged verbatim into the Gemini `setup` message.
    base.providerOptions = {
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 600 } },
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: {},
    };
  } else {
    base.turnDetection = { type: "server-vad", silenceDurationMs: 600 };
  }
  return base;
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
}

export interface DeviceSessionOptions {
  connectDevice?: (spec: DeviceSpec, handlers: DeviceHandlers, logger: Logger) => Promise<DeviceTransport>;
  /** Browser authority is server-issued; never inherit physical staff env overrides. */
  isStaff?: () => boolean;
  isMarketplaceOpen?: () => boolean;
  proposalHistory?: Map<string, number>;
  authorizeTool?: (name: string) => string | null;
  onTranscript?: (who: "input" | "output", text: string) => void;
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
  private readonly chunker = new FrameChunker(OUTPUT_FRAME_BYTES);
  private pacer: PacedSpeaker | null = null;
  private inputTranscript = "";
  private outputTranscript = "";
  private discardedResponseId: string | null = null;
  private sawAudioThisTurn = false;
  private micPeak = 0;
  private micBytes = 0;
  private readonly log: Logger;
  private readonly provider: RealtimeProvider;

  constructor(
    private readonly spec: DeviceSpec,
    private readonly shared: SharedRuntime,
    private readonly options: DeviceSessionOptions = {}
  ) {
    this.log = shared.logger.child(spec.id);
    this.provider = shared.createProvider?.() ?? shared.provider;
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
    this.tools = buildCompanionToolSet(this.shared.definitions, runtime);

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

    await this.ensureSession();
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

    if (this.turn && !this.turn.finished) this.turn.finish();
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
    this.resampler.reset();
    this.chunker.flush();
    this.pacer?.stop();
    this.pacer = null;

    device.acceptRequest();
    this.turn = new VoiceTurn({
      link: device,
      logger: this.log,
      conversationId: this.conversationId,
      onPhase: (phase) => {
        if (phase === "finished") {
          this.pacer?.stop();
          this.pacer = null;
          device.setSpeakLevel(0);
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

  private async onRequestStop(): Promise<void> {
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
    if (chunk.data.length > 0) {
      this.micPeak = Math.max(this.micPeak, rmsLevel(chunk.data));
      this.micBytes += chunk.data.length;
      this.session?.sendAudio(chunk.data);
    }
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
        this.outputTranscript = "";
        const pacer = this.pacer;
        const endTurn = () => {
          this.log.info(`owy: "${speech}" (${turn.audioBytesSent} B enviados @16k; esperando fin en dispositivo)`);
          // Firmware reopens capture after physical playback + its soft cue.
          // ESPHome's immediate continuation would bypass that bus handoff.
          turn.endSpeaking({ continueConversation: false, speech });
          this.device?.setSpeakLevel(0);
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

  private startSpeaking(turn: VoiceTurn): void {
    // Multiple Gemini deltas can arrive while firmware is releasing the mic.
    // Keep ONE queue/pacer for the turn; replacing it leaks active pacers that
    // all flush together when readiness arrives and overflow the device.
    if (this.pacer) return;
    turn.beginSpeaking(this.outputTranscript.trim());
    this.pacer = new PacedSpeaker(
      (frame) => {
        turn.pushAudio(frame);
        this.device?.setSpeakLevel(rmsLevel(frame));
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
    this.pacer?.stop();
    this.turn?.finish();
    this.session?.close();
    this.device?.close();
  }
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

  const [definitions, prompt] = await Promise.all([loadOwyToolDefinitions(), loadPromptBundle({ gridUrl })]);
  logger.info(`model ${provider.spec}; ${definitions.size} owy tools; grid ${gridUrl ?? "-"}`);
  return { config, provider, createProvider, definitions, instructions: prompt.system, gridUrl, logger };
}
