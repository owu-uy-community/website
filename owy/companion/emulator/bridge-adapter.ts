import { VoiceTurn } from "../bridge/src/device/pipeline";
import { PacedSpeaker } from "../bridge/src/audio/pcm";
import { VoiceAssistantEvent } from "esphome-client";
import type { RuntimeClock, ClockTimer } from "../bridge/src/clock";
import type { Logger } from "../bridge/src/log";

class VirtualClock implements RuntimeClock {
  time = 0;
  next = 1;
  timers = new Map<number, { at: number; period: number; callback: () => void }>();
  now = () => this.time;
  setTimeout = (callback: () => void, ms: number) => this.add(callback, ms, 0);
  setInterval = (callback: () => void, ms: number) => this.add(callback, ms, Math.max(1, ms));
  clearTimeout = (id: ClockTimer) => {
    this.timers.delete(id as unknown as number);
  };
  clearInterval = this.clearTimeout;
  add(callback: () => void, ms: number, period: number) {
    const id = this.next++;
    this.timers.set(id, { at: this.time + Math.max(0, ms), period, callback });
    return id as unknown as ClockTimer;
  }
  advance(time: number) {
    let iterations = 0;
    while (true) {
      let selected = 0,
        deadline = Infinity;
      for (const [id, t] of this.timers)
        if (t.at < deadline) {
          selected = id;
          deadline = t.at;
        }
      if (deadline > time) break;
      if (++iterations > 10000) throw Error("Virtual timer runaway");
      const timer = this.timers.get(selected)!;
      this.time = deadline;
      if (timer.period) timer.at += timer.period;
      else this.timers.delete(selected);
      timer.callback();
    }
    this.time = time;
  }
}
type Snapshot = { phase: number; voice: string; settings: Record<string, number> };
export class FixtureBridge {
  clock = new VirtualClock();
  turn: VoiceTurn | null = null;
  pacer: PacedSpeaker | null = null;
  replies = 0;
  replyMs = 1200;
  hung = false;
  readyFault = false;
  transportStall = 0;
  held: Uint8Array[] = [];
  state: Snapshot = { phase: 0, voice: "wake_word", settings: {} };
  events: { t: number; event: string; page: string; voice: string }[] = [];
  private outputTimer: ClockTimer | null = null;
  constructor(private input: (kind: number, values: number[], text?: string) => void) {}
  trace(event: string) {
    this.events.push({ t: this.clock.now(), event, page: "bridge", voice: this.turn?.phase ?? "idle" });
  }
  readonly log: Logger = {
    debug: (m) => this.trace(m),
    info: (m) => this.trace(m),
    warn: (m) => this.trace(m),
    error: (m) => this.trace(m),
    child: () => this.log,
  };
  stop() {
    this.pacer?.stop();
    this.pacer = null;
    if (this.outputTimer) this.clock.clearTimeout(this.outputTimer);
    this.outputTimer = null;
    this.held = [];
    const turn = this.turn;
    this.turn = null;
    turn?.finish();
  }
  reset() {
    this.stop();
    this.clock = new VirtualClock();
    this.replies = 0;
    this.events = [];
    this.hung = false;
    this.readyFault = false;
    this.transportStall = 0;
  }
  observe(state: Snapshot) {
    this.state = state;
    if (state.phase === 2 && (!this.turn || this.turn.finished)) {
      this.trace("bridge.RUN_REQUEST");
      this.turn = new VoiceTurn({
        clock: this.clock,
        logger: this.log,
        conversationId: "fixture",
        timers: { noSpeechMs: this.hung ? 0 : 8000 },
        link: {
          isPlaybackReady: () => this.state.phase === 3 && !this.readyFault,
          sendEvent: (kind, data) => {
            this.trace(`bridge.${Object.entries(VoiceAssistantEvent).find(([, v]) => v === kind)?.[0] ?? kind}`);
            this.input(30, [kind], data?.find((x) => x.name === "code")?.value);
          },
          sendAudio: (bytes, end) => {
            if (!end) this.input(31, [bytes.length]);
          },
        },
        onNoSpeech: () => this.trace("bridge.silent_idle"),
        onFailure: () => this.trace("bridge.failure"),
      });
      this.turn.start();
      if (this.replies > 0)
        this.outputTimer = this.clock.setTimeout(() => this.speech(this.replies, this.replyMs), 800);
    }
    if (
      (state.phase === 0 ||
        state.phase === 6 ||
        state.voice === "privacy" ||
        state.voice === "offline" ||
        state.voice === "off" ||
        state.voice === "calibrating") &&
      this.turn &&
      !this.turn.finished
    ) {
      this.stop();
      this.replies = 0;
    }
  }
  speech(count: number, ms: number) {
    if (this.turn?.phase !== "listening") return;
    this.replies = Math.max(0, count - 1);
    this.replyMs = Math.max(80, Math.min(20000, ms));
    this.turn.markSpeechStarted();
    this.turn.endListening("Una frase de prueba");
    const turn = this.turn;
    this.outputTimer = this.clock.setTimeout(() => {
      if (turn !== this.turn || turn.finished) return;
      turn.beginSpeaking("Respuesta de prueba");
      let sent = 0,
        stalled = false;
      const held: Uint8Array[] = [];
      this.pacer = new PacedSpeaker(
        (frame) => {
          if (this.outputTimer) {
            held.push(frame);
            return;
          }
          if (!stalled && this.transportStall > 0 && sent >= 32000) {
            stalled = true;
            held.push(frame);
            this.trace("transport.stall");
            this.outputTimer = this.clock.setTimeout(() => {
              this.outputTimer = null;
              this.trace(`transport.burst.${held.reduce((n, f) => n + f.length, 0)}B`);
              for (const f of held) turn.pushAudio(f as Buffer);
              held.length = 0;
            }, this.transportStall);
            return;
          }
          sent += frame.length;
          turn.pushAudio(frame);
        },
        { clock: this.clock, bytesPerSecond: 32000, leadMs: 100, isReady: () => turn.phase === "speaking" }
      );
      this.outputTimer = null;
      // Silence is deliberate: test the REAL pacing and byte transport without
      // pretending synthesized tones are a recorded human/model reply.
      for (let left = this.replyMs * 32; left > 0; left -= 1024)
        this.pacer.push(new Uint8Array(Math.min(1024, left)) as Buffer);
      this.pacer.finish(() => {
        if (this.outputTimer) {
          const wait = this.clock.setInterval(() => {
            if (!this.outputTimer) {
              this.clock.clearInterval(wait);
              if (turn === this.turn) turn.endSpeaking();
            }
          }, 10);
        } else turn.endSpeaking();
      });
    }, 450);
  }
  advance(time: number) {
    this.clock.advance(time);
  }
}
