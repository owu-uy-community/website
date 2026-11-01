import type { VoiceAssistantEvent, VoiceAssistantEventData } from "esphome-client";
import type { VoiceLink } from "./pipeline";
import type { AudioRoute, MicRoute } from "../audio/route";
import type { PitchVoice } from "../pitch-flow";
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

/** The gadget and web virtual device implement this same bridge-side contract. */
export interface DeviceTransport extends VoiceLink {
  acceptRequest(): void;
  declineRequest(): void;
  setFace(state: FaceState): void;
  /** Expression while a sentence plays (see expression.ts); `leadMs` until it is heard, strength 0..100. Absent = no expressions. */
  sendExpression?: (expression: string, leadMs: number, strength: number) => void;
  /** ms from a frame leaving the pacer to it being heard on this device's own output. */
  expressionLeadMs?: number;
  /** Lip shapes for audio played elsewhere (laptop output); see audio/mouth.ts. Absent = the device lip-syncs itself. */
  sendMouthTrack?: (frames: string, leadMs: number) => void;
  showCard(card: ScreenCard): void;
  showQr(url: string, caption?: string): void;
  showText(text: string): void;
  /** Present only when the firmware advertises `show_caption` (mute units): the reply transcript while Owy speaks. */
  showCaption?: (text: string) => void;
  isStaffMode(): boolean;
  isMarketplaceOpen(): boolean;
  /** Milliseconds of microphone audio to drop after a turn opens (a haptic cue bleeding into the mic); 0/absent = none. */
  micSettleMs?: number;
  /** Audio routing chosen on the device (`select.mic_source` / `select.audio_output`); absent = bridge default. */
  getMicSource?: () => MicRoute | null;
  getAudioOutput?: () => AudioRoute | null;
  setAudioRoute?: (which: "mic" | "output", route: MicRoute) => void;
  /** Modo pitch (`switch.pitch_mode`); `null` when the board has none. */
  isPitchMode?: () => boolean | null;
  /** The old «Owy reacciona» switch (`switch.pitch_reacts`), on boards flashed before `select.pitch_voice`. */
  isPitchReacts?: () => boolean | null;
  setSwitch?: (id: "pitch_mode", on: boolean) => void;
  /** What Owy says around a pitch (`select.pitch_voice`); `null` when the board has none. */
  getPitchVoice?: () => PitchVoice | null;
  setPitchVoice?: (voice: PitchVoice) => void;
  /**
   * Present when the firmware exposes `pitch_prompt`: "topic" / "name" make the board open its
   * mic by itself for the answer to Owy's question (a run tagged "pitch-answer"), "idle" clears it.
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
  /** Presses a board button by its object id (`tono_de_prueba`). */
  pressButton?: (objectId: string) => void;
  /** The firmware version and the board's audio state, for the panel. */
  info?: () => { firmware?: string; audio?: string };
  close(): void;
}
