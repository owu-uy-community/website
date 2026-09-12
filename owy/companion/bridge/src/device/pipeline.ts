import { systemClock, type RuntimeClock } from "../clock";
import { VoiceAssistantEvent, type VoiceAssistantEventData } from "esphome-client";
import type { Logger } from "../log";

/**
 * One voice turn = the Home Assistant pipeline choreography the ESPHome
 * `voice_assistant` component expects from its server, in HA's order:
 *
 *   RUN_START → STT_START → (STT_VAD_START) → STT_VAD_END → STT_END{text}
 *   → INTENT_END{conversation_id, continue_conversation, speech} → TTS_START{text}
 *   → TTS_END{url} → TTS_STREAM_START → VoiceAssistantAudio* → TTS_STREAM_END → RUN_END
 *
 * Invariants: a started turn always terminates with RUN_END (or ERROR + RUN_END),
 * because an unfinished run stalls the device pipeline; every method is safe
 * to call more than once or out of order (late Gemini events after a tap
 * interrupt must not resurrect a finished turn).
 */

export interface VoiceLink {
  sendEvent(eventType: VoiceAssistantEvent, data?: VoiceAssistantEventData[]): void;
  sendAudio(audio: Buffer, end?: boolean): void;
  /** Firmware acknowledgment: both microphone consumers have released I2S. */
  isPlaybackReady(): boolean;
}

export type TurnPhase = "created" | "listening" | "thinking" | "speaking" | "finished";

export interface VoiceTurnOptions {
  link: VoiceLink;
  clock?: RuntimeClock;
  logger: Logger;
  conversationId: string;
  /** Fired when no speech was detected within `noSpeechMs` of listening. */
  onNoSpeech?: () => void;
  onFailure?: () => void;
  onPhase?: (phase: TurnPhase) => void;
  timers?: { noSpeechMs?: number; ttsStallMs?: number; thinkingMs?: number };
  playbackReadyTimeoutMs?: number;
}

export const DEFAULT_NO_SPEECH_MS = 8_000;
export const DEFAULT_TTS_STALL_MS = 5_000;
/** Upper bound for tool calls + first audio; a silent model must not freeze the device in "thinking". */
export const DEFAULT_THINKING_MS = 30_000;
export const DEFAULT_PLAYBACK_READY_TIMEOUT_MS = 5_000;

export class VoiceTurn {
  private readonly clock: RuntimeClock;
  private readonly link: VoiceLink;
  private readonly log: Logger;
  private readonly conversationId: string;
  private readonly onNoSpeech?: () => void;
  private readonly onFailure?: () => void;
  private readonly onPhase?: (phase: TurnPhase) => void;
  private readonly noSpeechMs: number;
  private readonly ttsStallMs: number;
  private readonly thinkingMs: number;
  private readonly playbackReadyTimeoutMs: number;

  private _phase: TurnPhase = "created";
  private deferTimer: NodeJS.Timeout | null = null;
  private deferredText: string | null = null;
  private deferredEnd: { continueConversation?: boolean; speech?: string } | null = null;
  private noSpeechTimer: NodeJS.Timeout | null = null;
  private stallTimer: NodeJS.Timeout | null = null;
  private thinkingTimer: NodeJS.Timeout | null = null;
  private continueConversation = false;
  private speechStarted = false;
  private streamOpen = false;
  private _audioBytesSent = 0;

  constructor(options: VoiceTurnOptions) {
    this.clock = options.clock ?? systemClock;
    this.link = options.link;
    this.log = options.logger;
    this.conversationId = options.conversationId;
    this.onNoSpeech = options.onNoSpeech;
    this.onFailure = options.onFailure;
    this.onPhase = options.onPhase;
    this.noSpeechMs = options.timers?.noSpeechMs ?? DEFAULT_NO_SPEECH_MS;
    this.ttsStallMs = options.timers?.ttsStallMs ?? DEFAULT_TTS_STALL_MS;
    this.thinkingMs = options.timers?.thinkingMs ?? DEFAULT_THINKING_MS;
    this.playbackReadyTimeoutMs = options.playbackReadyTimeoutMs ?? DEFAULT_PLAYBACK_READY_TIMEOUT_MS;
  }

  get phase(): TurnPhase {
    return this._phase;
  }

  get finished(): boolean {
    return this._phase === "finished";
  }

  get audioBytesSent(): number {
    return this._audioBytesSent;
  }

  private setPhase(phase: TurnPhase): void {
    if (this._phase === phase) return;
    this._phase = phase;
    this.onPhase?.(phase);
  }

  /** Opens the run: the device is now streaming mic audio to us. */
  start(): void {
    if (this._phase !== "created") return;
    this.link.sendEvent(VoiceAssistantEvent.RUN_START);
    this.link.sendEvent(VoiceAssistantEvent.STT_START);
    this.setPhase("listening");
    this.armNoSpeechTimer();
  }

  /** Speech/VAD or the first nonempty input transcript proves someone spoke. */
  markSpeechStarted(): void {
    if (this._phase !== "listening" || this.speechStarted) return;
    this.speechStarted = true;
    this.clearNoSpeechTimer();
    this.link.sendEvent(VoiceAssistantEvent.STT_VAD_START);
  }

  /** The user's turn ended: stop the mic on the device and hand over the transcript. */
  endListening(transcript: string): void {
    if (this._phase !== "listening") return;
    this.clearNoSpeechTimer();
    this.link.sendEvent(VoiceAssistantEvent.STT_VAD_END);
    this.link.sendEvent(VoiceAssistantEvent.STT_END, [{ name: "text", value: transcript }]);
    this.setPhase("thinking");
    this.armThinkingTimer();
  }

  /**
   * First response audio is on its way: open the TTS stream on the device.
   * Wait for the firmware to acknowledge microphone shutdown. The caller
   * keeps audio in a paused PacedSpeaker until phase=speaking.
   */
  beginSpeaking(text = ""): void {
    if (this._phase === "listening") this.endListening("");
    if (this._phase !== "thinking" || this.deferTimer) return;
    this.clearThinkingTimer();
    if (this.link.isPlaybackReady()) return this.openStream(text);
    this.deferredText = text;
    const deadline = this.clock.now() + this.playbackReadyTimeoutMs;
    this.deferTimer = this.clock.setInterval(() => {
      if (this.link.isPlaybackReady()) {
        this.clock.clearInterval(this.deferTimer!);
        this.deferTimer = null;
        this.openStream(this.deferredText ?? "");
      } else if (this.clock.now() >= deadline) {
        this.fail("audio-bus-timeout", "No pude preparar el audio. Probá de nuevo.");
      }
    }, 20);
  }

  /** True while a deferred stream open is pending (frames are being held). */
  get deferred(): boolean {
    return this.deferTimer !== null;
  }

  private openStream(text: string): void {
    if (this._phase !== "thinking") return;
    this.deferredText = null;
    this.sendIntentEnd(text);
    // Gemini may send audio before its transcript. ESPHome ignores an empty
    // TTS_START. This label is metadata, never synthesized or spoken.
    this.link.sendEvent(VoiceAssistantEvent.TTS_START, [{ name: "text", value: text || "Respuesta de Owy" }]);
    // Required even with API PCM: this enters STREAMING_RESPONSE so playback
    // completion fires. The speaker path never fetches the nonempty URL.
    this.link.sendEvent(VoiceAssistantEvent.TTS_END, [{ name: "url", value: "api://owy/response" }]);
    this.link.sendEvent(VoiceAssistantEvent.TTS_STREAM_START);
    this.streamOpen = true;
    this.setPhase("speaking");
    this.armStallTimer();
    if (this.deferredEnd) {
      const end = this.deferredEnd;
      this.deferredEnd = null;
      this.endSpeaking(end);
    }
  }

  /** Streams 16 kHz / 16-bit / mono PCM to the device speaker. */
  pushAudio(pcm16k: Buffer): void {
    if (pcm16k.length === 0) return;
    if (this._phase !== "speaking") return;
    this.link.sendAudio(pcm16k, false);
    this._audioBytesSent += pcm16k.length;
    this.armStallTimer();
  }

  /**
   * Closes the TTS stream and the run. `continueConversation` re-opens the mic
   * on the device after playback (hands-free follow-up); `speech` is the final
   * transcript, sent again in INTENT_END so the device has the definitive text.
   */
  endSpeaking(options: { continueConversation?: boolean; speech?: string } = {}): void {
    if (this.deferTimer) {
      this.deferredEnd = options;
      return;
    }
    if (this._phase !== "speaking") return;
    this.clearStallTimer();
    this.continueConversation = options.continueConversation ?? false;
    this.sendIntentEnd(options.speech ?? "");
    this.closeStream();
    this.finish();
  }

  /** Reports a pipeline error to the device and ends the run. */
  fail(code: string, message: string): void {
    if (this._phase === "finished") return;
    this.log.info(`turn error ${code}: ${message}`);
    this.closeStream();
    this.link.sendEvent(VoiceAssistantEvent.ERROR, [
      { name: "code", value: code },
      { name: "message", value: message },
    ]);
    this.finish();
    this.onFailure?.();
  }

  /** Terminates the run unconditionally (tap interrupt, disconnect, late cleanup). Idempotent. */
  finish(): void {
    if (this._phase === "finished") return;
    if (this.deferTimer) this.clock.clearTimeout(this.deferTimer);
    this.deferTimer = null;
    this.deferredEnd = null;
    this.clearNoSpeechTimer();
    this.clearStallTimer();
    this.clearThinkingTimer();
    this.closeStream();
    this.link.sendEvent(VoiceAssistantEvent.RUN_END);
    this.setPhase("finished");
  }

  /** Sends TTS_STREAM_END exactly once per opened stream. */
  private closeStream(): void {
    if (!this.streamOpen) return;
    this.streamOpen = false;
    this.link.sendEvent(VoiceAssistantEvent.TTS_STREAM_END);
  }

  private sendIntentEnd(speech: string): void {
    this.link.sendEvent(VoiceAssistantEvent.INTENT_END, [
      { name: "conversation_id", value: this.conversationId },
      { name: "continue_conversation", value: this.continueConversation ? "1" : "0" },
      { name: "speech", value: speech },
    ]);
  }

  private armNoSpeechTimer(): void {
    this.clearNoSpeechTimer();
    if (this.noSpeechMs <= 0) return;
    this.noSpeechTimer = this.clock.setTimeout(() => {
      this.noSpeechTimer = null;
      if (this._phase !== "listening") return;
      // Silence is a normal end of conversation, not a red error or a prompt
      // to synthesize a reply. Finish first so socket cleanup cannot fail it.
      this.finish();
      this.onNoSpeech?.();
    }, this.noSpeechMs);
  }

  private clearNoSpeechTimer(): void {
    if (this.noSpeechTimer) this.clock.clearTimeout(this.noSpeechTimer);
    this.noSpeechTimer = null;
  }

  private armStallTimer(): void {
    this.clearStallTimer();
    if (this.ttsStallMs <= 0) return;
    this.stallTimer = this.clock.setTimeout(() => {
      this.stallTimer = null;
      if (this._phase !== "speaking") return;
      this.log.warn("TTS stream stalled; closing the run");
      this.endSpeaking();
    }, this.ttsStallMs);
  }

  private clearStallTimer(): void {
    if (this.stallTimer) this.clock.clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  private armThinkingTimer(): void {
    this.clearThinkingTimer();
    if (this.thinkingMs <= 0) return;
    this.thinkingTimer = this.clock.setTimeout(() => {
      this.thinkingTimer = null;
      if (this._phase !== "thinking") return;
      this.fail("server_error", "El modelo no respondió a tiempo");
    }, this.thinkingMs);
  }

  private clearThinkingTimer(): void {
    if (this.thinkingTimer) this.clock.clearTimeout(this.thinkingTimer);
    this.thinkingTimer = null;
  }
}

/** Decides whether the device should re-open the mic after this reply. */
export function wantsFollowUp(spokenText: string): boolean {
  const trimmed = spokenText.trim();
  if (trimmed.length === 0) return false;
  return /[?¿]\s*$/.test(trimmed) || /\?\s*["»)]?\s*$/.test(trimmed);
}
