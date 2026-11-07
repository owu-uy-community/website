import type { VoiceAssistantEvent, VoiceAssistantEventData } from "esphome-client";
import type { VoiceLink } from "./pipeline";
import type { AudioRoute, MicRoute } from "../audio/route";
import type { FaceState, ScreenCard } from "../realtime/tools";
import type { SettingKey } from "../web/registry";

/**
 * A browser attached as the *audio peer* of a physical device: it mirrors that
 * device's turns (opens its mic on `accepted`, plays the PCM it receives) while
 * the device keeps the trigger, the face and the captions.
 */
export interface AudioPeer {
  readonly attachedTo: string | null;
  /**
   * Start of a mirrored turn: bumps the run, emits `accepted`, arms mic frames for this run.
   * `own`: a turn Owy starts himself (a talk's line or text question): nobody speaks, the browser skips its listening cue.
   */
  mirrorAccept(own?: boolean): void;
  mirrorDecline(): void;
  sendEvent(eventType: VoiceAssistantEvent, data?: VoiceAssistantEventData[]): void;
  sendAudio(audio: Buffer, end?: boolean): void;
  /** A peer with a face of its own mirrors Owy's per-sentence expressions. */
  sendExpression?(expression: string, leadMs: number, strength: number): void;
  /** Plays a pre-rendered cue (public/companion-audio/clips/<id>.wav) through the peer's speakers. */
  playClip?(id: string): void;
}

/**
 * What a session drives: the knob (a face link: no mic, no speaker, the pipeline
 * methods are no-ops) and the browser virtual device (its own mic and speakers,
 * the Home Assistant events on the wire) implement this same contract.
 */
export interface DeviceTransport extends VoiceLink {
  acceptRequest(): void;
  declineRequest(): void;
  /**
   * False for a device with no audio of its own (the knob): its turns never route the mic or the
   * answer to it — the Mac, or an attached browser, carries them. Absent = it hears and plays itself.
   */
  readonly canPlayAudio?: boolean;
  setFace(state: FaceState): void;
  /** Expression while a sentence plays (see expression.ts); `leadMs` until it is heard, strength 0..100. Absent = no expressions. */
  sendExpression?: (expression: string, leadMs: number, strength: number) => void;
  /** ms from a frame leaving the pacer to it being heard on this device's own output. */
  expressionLeadMs?: number;
  /** Lip shapes for audio played elsewhere (laptop output); see audio/mouth.ts. Absent = the device lip-syncs itself. */
  sendMouthTrack?: (frames: string, leadMs: number) => void;
  /** The listening halo on a device that does not hear for itself: the level (0..100) of the mic that owns the turn. */
  sendMicLevel?: (level: number) => void;
  showCard(card: ScreenCard): void;
  showQr(url: string, caption?: string): void;
  showText(text: string): void;
  /** Present only when the firmware advertises `show_caption` (mute units): the reply transcript while Owy speaks. */
  showCaption?: (text: string) => void;
  /** Present when the firmware advertises `show_heard`: what Owy understood, once listening ends. */
  showHeard?: (text: string) => void;
  isStaffMode(): boolean;
  isMarketplaceOpen(): boolean;
  /** Audio routing the device itself chooses (the browser is its own mic and speakers); absent = the bridge's settings. */
  getMicSource?: () => MicRoute | null;
  getAudioOutput?: () => AudioRoute | null;
  /**
   * Present when the device opens its own mic for the answer to Owy's question (the browser:
   * "topic" / "name" make it start a run tagged "pitch-answer", "idle" clears it). Absent: the
   * bridge opens the answer run itself.
   */
  pitchPrompt?: (kind: "topic" | "name" | "idle") => void;
  /** Plays a pre-rendered cue when the device has speakers of its own that can take a file (the browser). */
  playClip?: (id: string) => void;
  getVolume(): number | null;
  setVolume(pct: number): void;
  /** A registry setting as the board holds it; undefined = the board has no such entity (or no state yet). */
  readSetting?: (key: SettingKey) => unknown;
  /** Writes a registry setting to the board, as the option label it expects. */
  writeSetting?: (key: SettingKey, value: unknown) => void;
  /** Unlocks staff on the board (it locks itself after 10 minutes), or locks it now. */
  setStaff?: (on: boolean) => void;
  /** Presses a board button by its object id (`hablar`). */
  pressButton?: (objectId: string) => void;
  /** The firmware version and the face the board shows, for the panel. */
  info?: () => { firmware?: string; face?: string };
  close(): void;
}
