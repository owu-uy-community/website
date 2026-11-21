import {
  entityId,
  openEspHomeClient,
  type EspHomeClient,
  type VoiceAssistantAudioData,
  type VoiceAssistantEvent,
  type VoiceAssistantEventData,
  type VoiceAssistantRequest,
} from "esphome-client";
import type { DeviceSpec } from "../config";
import type { Logger } from "../log";
import type { FaceState, ScreenCard } from "../realtime/tools";
import type { DeviceTransport } from "./transport";
import { DEVICE_KEYS, settingSpec, type SettingKey } from "../web/registry";
import { sleep } from "../timings";

/**
 * The knob seen from the bridge: an ESPHome node reached over the native API
 * (port 6053, Noise-encrypted) through `esphome-client`. It is a face with a
 * button — it neither hears nor speaks; the bridge runs every turn through the
 * Mac's audio (or an attached browser) and tells the board what to show.
 *
 * Firmware contract (companion/firmware/packages/controls.yaml, boards/knob18.yaml):
 *   - select  `face_state`  idle|listening|thinking|speaking|happy|error|offline — set from here
 *   - sensor  `taps`        a counter, +1 per tap on the face or on the «Hablar» button
 *   - switch  `staff_mode` (the PIN page), `microphone_privacy` (pausa), `reduced_motion`;
 *     number `screen_brightness` — the registry's device keys, read and written through their entities
 *   - button  `hablar` (= a tap), `reiniciar`
 *   - actions `show_caption(body)`, `show_heard(body)`, `show_card(title, presenter, room, time_slot)`,
 *     `show_qr(url, caption)`, `show_text(body)`, `express(feeling, lead_ms, strength)`,
 *     `mouth_track(frames, lead_ms)`, `mic_level(level)`
 *     (positional arguments; variable names avoid ESPHome component namespaces)
 */

/** What a device tells its session. The browser virtual device still runs the pipeline methods; the knob only taps. */
export interface DeviceHandlers {
  /** The knob's tap: a touch on the face, or its «Hablar» button. */
  onTap?(): void;
  onRequestStart(request: VoiceAssistantRequest): void | Promise<void>;
  onRequestStop(): void | Promise<void>;
  onAudio(chunk: VoiceAssistantAudioData): void;
  /** A registry setting changed on the board: its own screen, its knob, or a write of ours echoing back. */
  onSetting?(key: SettingKey, value: unknown): void;
  onConnected?(): void;
  onDisconnected?(): void;
}

export const FACE_STATES: FaceState[] = ["idle", "listening", "thinking", "speaking", "happy", "error", "offline"];

const ENTITY = {
  face: entityId("select", "face_state"),
  staffMode: entityId("switch", "staff_mode"),
  taps: entityId("sensor", "taps"),
} as const;

export class CompanionDevice implements DeviceTransport {
  private readonly abort = new AbortController();
  private lastFace: FaceState | null = null;
  /** The board's tap counter as last seen; null = the next value is a baseline (boot, reconnect), not a tap. */
  private lastTaps: number | null = null;
  /** The knob has no mic and no speaker: turns never route audio to it. */
  readonly canPlayAudio = false;

  private constructor(
    readonly spec: DeviceSpec,
    readonly client: EspHomeClient,
    private readonly handlers: DeviceHandlers,
    private readonly log: Logger
  ) {}

  /**
   * Connects, retrying for up to `options.retryForMs` (default: forever, 10 s
   * apart): at the venue the device may still be booting, dozing (ARP misses
   * show up as EHOSTUNREACH/EHOSTDOWN) or simply switched off when the bridge
   * starts, and one dark Owy must not take the bridge down with it. Once
   * connected, esphome-client's own auto-reconnect takes over. Wrong
   * credentials still fail fast.
   */
  static async connect(
    spec: DeviceSpec,
    handlers: DeviceHandlers,
    logger: Logger,
    options: { retryForMs?: number; signal?: AbortSignal } = {}
  ): Promise<CompanionDevice> {
    const log = logger.child(spec.id);
    const deadline = Date.now() + (options.retryForMs ?? Infinity);
    let attempt = 0;

    for (;;) {
      options.signal?.throwIfAborted();
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
        await sleep(delay, options.signal);
      }
    }
  }

  /** Set when the firmware exposes `express`: faces while Owy talks. */
  sendExpression?: (expression: string, leadMs: number, strength: number) => void;
  /** Owy's audio plays on the Mac or in a browser: the session uses that output's latency, not this. */
  readonly expressionLeadMs = 200;
  /** Set when the firmware exposes `mouth_track`: lip shapes for what plays elsewhere. */
  sendMouthTrack?: (frames: string, leadMs: number) => void;
  /** Set when the firmware exposes `show_caption`; DeviceSession streams the reply transcript through it. */
  showCaption?: (text: string) => void;
  /** Set when the firmware exposes `show_heard`: the « heard » pill. */
  showHeard?: (text: string) => void;
  /** Set when the firmware exposes `mic_level`: the listening halo follows the Mac's mic. */
  sendMicLevel?: (level: number) => void;

  private attach(): void {
    const info = this.client.deviceInfo();
    this.log.info(`connected to ${info?.name ?? this.spec.host} (esphome ${info?.esphomeVersion ?? "?"})`);
    const services = new Set(this.client.services.list().map((service) => service.name));
    if (services.has("show_caption")) {
      this.showCaption = (text) => this.callService("show_caption", [{ stringValue: text }]);
      this.log.info("captions: the device shows replies as text");
    }
    if (services.has("show_heard")) this.showHeard = (text) => this.callService("show_heard", [{ stringValue: text }]);
    if (services.has("express"))
      this.sendExpression = (expression, leadMs, strength) =>
        this.callService("express", [{ stringValue: expression }, { intValue: leadMs }, { intValue: strength }]);
    if (services.has("mouth_track"))
      this.sendMouthTrack = (frames, leadMs) => this.callService("mouth_track", [{ stringValue: frames }, { intValue: leadMs }]);
    if (services.has("mic_level"))
      this.sendMicLevel = (level) => this.callService("mic_level", [{ intValue: Math.max(0, Math.min(100, Math.round(level))) }]);

    const lastSettings = new Map<SettingKey, unknown>();
    this.client.on("telemetry", () => {
      // Any setting whose value moved: the session tells its own writes' echoes from changes made on the board.
      for (const key of DEVICE_KEYS) {
        const value = this.readSetting(key);
        if (value === undefined || lastSettings.get(key) === value) continue;
        lastSettings.set(key, value);
        try {
          this.handlers.onSetting?.(key, value);
        } catch (error) {
          this.log.error(`setting ${key} failed`, error);
        }
      }
      // The tap counter: one tap per change. The first value after a (re)connect — and a
      // smaller one after the board rebooted — is a baseline.
      const taps = this.client.latest(ENTITY.taps)?.state;
      if (typeof taps !== "number") return;
      const tapped = this.lastTaps !== null && taps > this.lastTaps;
      this.lastTaps = taps;
      if (!tapped) return;
      this.log.info("tap");
      try {
        this.handlers.onTap?.();
      } catch (error) {
        this.log.error("tap failed", error);
      }
    });

    this.client.on("lifecycle", (event) => {
      if (event.kind === "connect") {
        this.log.info(`link up (encrypted=${event.encrypted})`);
        this.lastFace = null;
        this.lastTaps = null;
        this.handlers.onConnected?.();
      } else {
        this.log.warn(`link down${event.cause ? `: ${event.cause.message}` : ""}`);
        this.handlers.onDisconnected?.();
      }
    });

    this.handlers.onConnected?.();
  }

  // ── VoiceLink: the knob runs no pipeline; a turn's events and audio go to the Mac or a browser ──

  acceptRequest(): void {}

  declineRequest(): void {}

  sendEvent(_eventType: VoiceAssistantEvent, _data?: VoiceAssistantEventData[]): void {}

  sendAudio(_audio: Buffer, _end = false): void {}

  isPlaybackReady(): boolean {
    return true;
  }

  /** Writes to the board can throw while its link is down: log once per outage instead of crashing a timer. */
  private guard(what: string, write: () => void): void {
    try {
      write();
      this.writeFailing = false;
    } catch (error) {
      if (!this.writeFailing) this.log.warn(`could not send ${what} to the device (link down?)`, error);
      this.writeFailing = true;
    }
  }
  private writeFailing = false;

  // ── Screen ──────────────────────────────────────────────────────────────

  setFace(state: FaceState): void {
    if (this.lastFace === state) return;
    this.lastFace = state;
    this.command(ENTITY.face, { state });
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

  private command(...args: Parameters<EspHomeClient["command"]>): void {
    this.guard(`command ${String(args[0])}`, () => this.client.command(...args));
  }

  private callService(name: string, args: ({ stringValue: string } | { intValue: number })[]): void {
    try {
      this.client.services.executeByName(name, args);
    } catch (error) {
      this.log.warn(`service ${name} failed`, error);
    }
  }

  // ── Settings and modes ──────────────────────────────────────────────────

  isStaffMode(): boolean {
    return this.client.latest(ENTITY.staffMode)?.state === true;
  }

  /** The marketplace is a bridge setting now; the board has no say in it. */
  isMarketplaceOpen(): boolean {
    return false;
  }

  /** The board's value for a registry setting, mapped back from its option label; undefined = it has none. */
  readSetting(key: SettingKey): unknown {
    const spec = settingSpec(key);
    if (spec.scope !== "device" || !spec.entity) return undefined;
    const state = (this.client.latest(boardEntity(spec.entity)) as { state?: unknown } | undefined)?.state;
    switch (spec.type) {
      case "boolean":
        return typeof state === "boolean" ? state : undefined;
      case "number":
        return typeof state === "number" ? state : undefined;
      case "enum":
        return typeof state === "string"
          ? spec.options.find(([value, label]) => (spec.board?.[value] ?? label) === state || value === state)?.[0]
          : undefined;
      default:
        return typeof state === "string" ? state : undefined;
    }
  }

  writeSetting(key: SettingKey, value: unknown): void {
    const spec = settingSpec(key);
    if (spec.scope !== "device" || !spec.entity) return;
    const state =
      spec.type === "enum"
        ? (spec.board?.[String(value)] ?? spec.options.find(([option]) => option === value)?.[1] ?? String(value))
        : value;
    this.command(boardEntity(spec.entity), { state } as never);
  }

  setStaff(on: boolean): void {
    this.command(ENTITY.staffMode, { state: on });
  }

  pressButton(objectId: string): void {
    this.command(entityId("button", objectId), {} as never);
  }

  info(): { firmware?: string; face?: string } {
    const face = this.client.latest(ENTITY.face)?.state;
    return {
      firmware: this.client.deviceInfo()?.esphomeVersion,
      ...(typeof face === "string" ? { face } : {}),
    };
  }

  /** No speaker: the Mac's output has the volume. */
  getVolume(): number | null {
    return null;
  }

  setVolume(_pct: number): void {}

  close(): void {
    this.abort.abort();
    this.client.disconnect();
  }
}

/** `switch.staff_mode` → the client's entity id (the registry names switch, number and select entities). */
function boardEntity(spec: string) {
  const [domain, objectId] = spec.split(".");
  return entityId(domain as "switch", objectId);
}

/** Wrong/missing Noise key: retrying cannot help, fail fast with the real cause. */
function isCredentialError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return /Encryption(Key|Required)/.test(name) || /handshake|MAC failure|encryption key/i.test(String(error));
}
