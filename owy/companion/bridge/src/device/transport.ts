import type { VoiceAssistantEvent, VoiceAssistantEventData } from "esphome-client";
import type { VoiceLink } from "./pipeline";
import type { AudioRoute } from "../audio/route";
import type { FaceState, ScreenCard } from "../realtime/tools";

/**
 * A browser attached as the *audio peer* of a physical device: it mirrors that
 * device's turns (opens its mic on `accepted`, plays the PCM it receives) while
 * the device keeps the trigger, the face and the captions.
 */
export interface AudioPeer {
  readonly attachedTo: string | null;
  /** Start of a mirrored turn: bumps the run, emits `accepted`, arms mic frames for this run. */
  mirrorAccept(): void;
  mirrorDecline(): void;
  sendEvent(eventType: VoiceAssistantEvent, data?: VoiceAssistantEventData[]): void;
  sendAudio(audio: Buffer, end?: boolean): void;
  /** A peer with a face of its own mirrors Owy's per-sentence expressions. */
  sendExpression?(expression: string, leadMs: number, strength: number): void;
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
  getMicSource?: () => AudioRoute | null;
  getAudioOutput?: () => AudioRoute | null;
  setAudioRoute?: (which: "mic" | "output", route: AudioRoute) => void;
  getVolume(): number | null;
  setVolume(pct: number): void;
  close(): void;
}
