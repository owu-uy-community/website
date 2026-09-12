import {
  entityId,
  openEspHomeClient,
  VoiceAssistantSubscribeFlag,
  type EspHomeClient,
  type VoiceAssistantAudioData,
  type VoiceAssistantEvent,
  type VoiceAssistantEventData,
  type VoiceAssistantRequest,
} from "esphome-client";
import type { DeviceSpec } from "../config";
import type { Logger } from "../log";
import type { FaceState, ScreenCard } from "../realtime/tools";
import type { VoiceLink } from "./pipeline";

/**
 * The companion device seen from the bridge: an ESPHome node reached over the
 * native API (port 6053, Noise-encrypted) through `esphome-client`.
 *
 * Firmware contract (see `companion/firmware/packages/controls.yaml`):
 *   - select  `face_state`        options: idle|listening|thinking|speaking|happy|error|offline
 *   - switch  `staff_mode`, `marketplace_open`, `quiet_mode`   (set from the on-device PIN page)
 *   - number  `speak_level`       0..100, drives the mouth animation
 *   - actions `show_card(title, presenter, room, time_slot)`, `show_qr(url, caption)`, `show_text(body)`
 *     (positional string arguments; variable names avoid ESPHome component namespaces)
 *   - voice_assistant (speaker path) subscribed with API audio
 */

export interface DeviceHandlers {
  onRequestStart(request: VoiceAssistantRequest): void | Promise<void>;
  onRequestStop(): void | Promise<void>;
  onAudio(chunk: VoiceAssistantAudioData): void;
  onConnected?(): void;
  onDisconnected?(): void;
}

export const FACE_STATES: FaceState[] = ["idle", "listening", "thinking", "speaking", "happy", "error", "offline"];

const ENTITY = {
  face: entityId("select", "face_state"),
  staffMode: entityId("switch", "staff_mode"),
  marketplaceOpen: entityId("switch", "marketplace_open"),
  quietMode: entityId("switch", "quiet_mode"),
  speakLevel: entityId("number", "speak_level"),
  volume: entityId("number", "volumen"),
  playbackReady: entityId("binary_sensor", "playback_ready"),
  audioState: entityId("text_sensor", "audio_state"),
} as const;

export class CompanionDevice implements VoiceLink {
  private readonly abort = new AbortController();
  private lastFace: FaceState | null = null;
  private lastLevelAt = 0;

  private constructor(
    readonly spec: DeviceSpec,
    readonly client: EspHomeClient,
    private readonly handlers: DeviceHandlers,
    private readonly log: Logger
  ) {}

  /**
   * Connects, retrying for up to `options.retryForMs` (default 5 min): at the
   * venue the device may still be booting or dozing (ARP misses show up as
   * EHOSTUNREACH) when the bridge starts. Once connected, esphome-client's own
   * auto-reconnect takes over.
   */
  static async connect(
    spec: DeviceSpec,
    handlers: DeviceHandlers,
    logger: Logger,
    options: { retryForMs?: number } = {}
  ): Promise<CompanionDevice> {
    const log = logger.child(spec.id);
    const deadline = Date.now() + (options.retryForMs ?? 5 * 60_000);
    let attempt = 0;

    for (;;) {
      attempt++;
      try {
        const client = await openEspHomeClient({
          host: spec.host,
          port: spec.port,
          psk: spec.psk,
          clientId: "owy-companion-bridge",
          connectTimeoutMs: 15_000,
          logger: {
            debug: (m, ...p) => log.debug(m, ...p),
            info: (m, ...p) => log.debug(m, ...p),
            warn: (m, ...p) => log.warn(m, ...p),
            error: (m, ...p) => log.error(m, ...p),
          },
        });
        const device = new CompanionDevice(spec, client, handlers, log);
        device.attach();
        return device;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isCredentialError(error) || Date.now() >= deadline) throw error;
        const delay = Math.min(10_000, 1000 * attempt);
        log.warn(`connect attempt ${attempt} failed (${message}); retrying in ${delay} ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private attach(): void {
    const info = this.client.deviceInfo();
    this.log.info(`connected to ${info?.name ?? this.spec.host} (esphome ${info?.esphomeVersion ?? "?"})`);
    let lastAudioState: unknown;
    this.client.on("telemetry", () => {
      const state = this.client.latest(ENTITY.audioState)?.state;
      if (typeof state === "string" && state !== lastAudioState) {
        lastAudioState = state;
        this.log.info(`device audio: ${state}`);
      }
    });

    this.client.on("lifecycle", (event) => {
      if (event.kind === "connect") {
        this.log.info(`link up (encrypted=${event.encrypted})`);
        this.lastFace = null;
        this.handlers.onConnected?.();
      } else {
        this.log.warn(`link down${event.cause ? `: ${event.cause.message}` : ""}`);
        this.handlers.onDisconnected?.();
      }
    });

    // Subscribing with API audio makes the device stream mic PCM over the
    // native API (no UDP). The subscription survives reconnects.
    this.client.voiceAssistant.subscribe(VoiceAssistantSubscribeFlag.API_AUDIO);

    void this.pumpRequests();
    void this.pumpAudio();
    this.handlers.onConnected?.();
  }

  private async pumpRequests(): Promise<void> {
    try {
      for await (const request of this.client.voiceAssistant.requests({ signal: this.abort.signal })) {
        if (request.start) {
          this.log.info(
            `pipeline start (conversation=${request.conversationId ?? "-"}, wake="${request.wakeWordPhrase ?? ""}")`
          );
          // Start may await a model connection. Keep consuming stop requests
          // so a cancelled tap cannot be accepted several seconds later.
          void Promise.resolve(this.handlers.onRequestStart(request)).catch(error => {
            this.log.error("pipeline start failed", error);
            this.declineRequest();
          });
        } else {
          this.log.info("pipeline stop requested by device");
          await this.handlers.onRequestStop();
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) this.log.error("request pump died", error);
    }
  }

  private async pumpAudio(): Promise<void> {
    try {
      for await (const chunk of this.client.voiceAssistant.audio({ signal: this.abort.signal })) {
        this.handlers.onAudio(chunk);
      }
    } catch (error) {
      if (!this.abort.signal.aborted) this.log.error("audio pump died", error);
    }
  }

  // ── VoiceLink ───────────────────────────────────────────────────────────

  acceptRequest(): void {
    this.client.voiceAssistant.respondToRequest({ port: 0, error: false });
  }

  declineRequest(): void {
    this.client.voiceAssistant.respondToRequest({ error: true });
  }

  sendEvent(eventType: VoiceAssistantEvent, data?: VoiceAssistantEventData[]): void {
    this.client.voiceAssistant.sendEvent(eventType, data);
  }

  sendAudio(audio: Buffer, end = false): void {
    this.client.voiceAssistant.sendAudio(audio, end);
  }

  isPlaybackReady(): boolean {
    return this.client.latest(ENTITY.playbackReady)?.state === true;
  }

  // ── Screen / modes ──────────────────────────────────────────────────────

  setFace(state: FaceState): void {
    if (this.lastFace === state) return;
    this.lastFace = state;
    this.client.command(ENTITY.face, { state });
  }

  private lastLevelValue = -1;

  /**
   * 0..1 level → mouth. Throttled AND quantized: every update is an LVGL
   * redraw on the device's main loop, which also feeds the speaker; too many
   * redraws starve playback (the 466x466 AMOLED takes ~60 ms per operation).
   */
  setSpeakLevel(level: number, now = Date.now()): void {
    const value = level === 0 ? 0 : Math.max(0, Math.min(100, Math.round((level * 100) / 25) * 25));
    if (value === this.lastLevelValue) return;
    if (value !== 0 && now - this.lastLevelAt < 300) return;
    this.lastLevelAt = now;
    this.lastLevelValue = value;
    this.client.command(ENTITY.speakLevel, { state: value });
  }

  showCard(card: ScreenCard): void {
    this.callService("show_card", [
      { stringValue: card.title },
      { stringValue: card.speaker ?? "" },
      { stringValue: card.room ?? "" },
      { stringValue: card.timeSlot ?? "" },
    ]);
  }

  showQr(url: string, caption = ""): void {
    this.callService("show_qr", [{ stringValue: url }, { stringValue: caption }]);
  }

  showText(text: string): void {
    this.callService("show_text", [{ stringValue: text }]);
  }

  private callService(name: string, args: { stringValue: string }[]): void {
    try {
      this.client.services.executeByName(name, args);
    } catch (error) {
      this.log.warn(`service ${name} failed`, error);
    }
  }

  isStaffMode(): boolean {
    return this.readSwitch(ENTITY.staffMode);
  }

  isMarketplaceOpen(): boolean {
    return this.readSwitch(ENTITY.marketplaceOpen);
  }

  isQuietMode(): boolean {
    return this.readSwitch(ENTITY.quietMode);
  }

  /** Current speaker volume 0..100 (null if not reported yet). */
  getVolume(): number | null {
    const latest = this.client.latest(ENTITY.volume);
    return typeof latest?.state === "number" ? latest.state : null;
  }

  /** Sets speaker volume 0..100. */
  setVolume(pct: number): void {
    this.client.command(ENTITY.volume, { state: Math.max(0, Math.min(80, Math.round(pct))) });
  }

  private readSwitch(id: typeof ENTITY.staffMode): boolean {
    const latest = this.client.latest(id);
    return latest?.state === true;
  }

  close(): void {
    this.abort.abort();
    this.client.disconnect();
  }
}

/** Wrong/missing Noise key: retrying cannot help, fail fast with the real cause. */
function isCredentialError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return /Encryption(Key|Required)/.test(name) || /handshake|MAC failure|encryption key/i.test(String(error));
}
