import { describe, expect, it, vi } from "vitest";
import { fromWav } from "../src/audio/pcm";
import type { RuntimeClock } from "../src/clock";
import { PITCH_CLIPS, PITCH_LIMITS, PITCH_LINES, PitchRecorder, announcementText, hedged, isPitchRun } from "../src/pitch";

/** Manual clock: timers fire only when the test advances time. */
function fakeClock() {
  let now = 0;
  const timers: { at: number; cb: () => void; id: number }[] = [];
  let seq = 0;
  const clock: RuntimeClock = {
    now: () => now,
    setTimeout: (cb, ms) => {
      const id = ++seq;
      timers.push({ at: now + ms, cb, id });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => {
      const index = timers.findIndex((t) => t.id === (timer as unknown as number));
      if (index >= 0) timers.splice(index, 1);
    },
    setInterval: () => {
      throw new Error("unused");
    },
    clearInterval: () => {},
  };
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (timer.at <= now) timer.cb();
      else timers.push(timer);
    }
  };
  return { clock, advance };
}

/** One 20 ms frame of 16 kHz PCM16: a tone for speech, zeros for silence. */
const frame = (loud: boolean) => {
  const pcm = Buffer.alloc(640);
  if (loud) for (let i = 0; i < 320; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 3) * 6000), i * 2);
  return pcm;
};

function recorder(kind: "pitch" | "answer" = "pitch", extra: { ignoreMs?: number } = {}) {
  const { clock, advance } = fakeClock();
  const onSpeechStart = vi.fn();
  const onDone = vi.fn();
  const rec = new PitchRecorder({ kind, clock, onSpeechStart, onDone, ...extra });
  rec.start();
  /** Feeds `n` frames, 20 ms apart. */
  const feed = (n: number, loud: boolean) => {
    for (let i = 0; i < n; i++) {
      rec.push(frame(loud));
      advance(20);
    }
  };
  return { rec, feed, advance, onSpeechStart, onDone };
}

describe("the pitch recorder", () => {
  it("believes speech after three loud frames in a row, once, and keeps the audio", () => {
    const { rec, feed, onSpeechStart } = recorder();
    feed(2, true);
    feed(1, false);
    expect(onSpeechStart).not.toHaveBeenCalled();
    feed(3, true);
    feed(50, true);
    expect(onSpeechStart).toHaveBeenCalledOnce();
    expect(rec.durationMs).toBeCloseTo(56 * 20, 5);
    expect(rec.speechMs).toBeGreaterThan(1000);
    expect(fromWav(rec.wav())).toMatchObject({ sampleRate: 16_000, channels: 1 });
  });

  it("ends on its own after a long silence, counted from the last voice, and not before speech", () => {
    const { feed, advance, onDone } = recorder();
    advance(PITCH_LIMITS.pitch.silenceMs * 2); // silence before anyone spoke is not an ending
    expect(onDone).not.toHaveBeenCalled();
    feed(10, true);
    advance(PITCH_LIMITS.pitch.silenceMs - 1000);
    feed(5, true); // a pause, then more pitch: the silence clock restarts
    advance(PITCH_LIMITS.pitch.silenceMs - 1000);
    expect(onDone).not.toHaveBeenCalled();
    advance(1000);
    expect(onDone).toHaveBeenCalledWith("silence");
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("caps a recording that never stops", () => {
    const { feed, onDone } = recorder();
    feed(Math.ceil(PITCH_LIMITS.pitch.maxMs / 20) + 5, true); // talking non-stop past the cap
    expect(onDone).toHaveBeenCalledWith("cap");
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("drops the cue's echo at the start and the tap's buzz at the end", () => {
    const { rec, feed, advance } = recorder("pitch", { ignoreMs: 1000 });
    feed(20, true); // 400 ms, all during the cue
    advance(600);
    feed(25, true); // 500 ms recorded
    rec.stop();
    rec.trimTailMs(300);
    expect(rec.durationMs).toBeCloseTo(200, 5);
  });

  it("an answer is short, and ends by itself when nobody answers (the flow goes on in that run)", () => {
    const answered = recorder("answer");
    answered.feed(10, true);
    answered.advance(PITCH_LIMITS.answer.silenceMs);
    expect(answered.onDone).toHaveBeenCalledWith("silence");

    const silent = recorder("answer", { ignoreMs: 400 });
    silent.advance(PITCH_LIMITS.answer.noSpeechMs! + 399);
    expect(silent.onDone).not.toHaveBeenCalled();
    silent.advance(1);
    expect(silent.onDone).toHaveBeenCalledWith("silence");
    expect(silent.rec.heardSpeech).toBe(false);
  });

  it("a pitch has no such limit: silence before the first word is the person thinking", () => {
    const { advance, onDone } = recorder("pitch");
    advance(PITCH_LIMITS.pitch.maxMs - 1);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("the words", () => {
  it("announces the place, and the speaker when known", () => {
    expect(announcementText({ title: "Effect en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" })).toBe(
      "¡Listo, Ana! Tu charla «Effect en producción» queda en Cueva a las 15:00."
    );
    expect(announcementText({ title: "Lambdas", room: "Rincón", timeSlot: "16:00 - 16:45" })).toBe(
      "¡Listo! Tu charla «Lambdas» queda en Rincón a las 16:00."
    );
    expect(announcementText({ title: "X" })).toBe("¡Listo! Tu charla «X» queda en la grilla.");
    // Someone put forward by the person talking is not the one listening.
    expect(announcementText({ title: "Effect en producción", speaker: "Lucía", room: "Cueva", timeSlot: "15:00 - 15:45" }, true)).toBe(
      "¡Listo! La charla de Lucía, «Effect en producción», queda en Cueva a las 15:00."
    );
  });

  it("every fixed line Owy asks or ends a pitch with has a recorded cue id", () => {
    for (const line of ["listen", "askTopic", "askTitle", "askName", "empty", "unclear", "full", "failed"] as const)
      expect(PITCH_CLIPS[line]).toMatch(/^pitch-/);
    expect(PITCH_LINES.askName).not.toMatch(/tocá/i); // the board opens its mic by itself now
  });

  it("recognises the firmware's pitch tags", () => {
    expect(isPitchRun({ wakeWordPhrase: "pitch" })).toBe(true);
    expect(isPitchRun({ wakeWordPhrase: "pitch-answer" })).toBe(true);
    expect(isPitchRun({ wakeWordPhrase: "okay_nabu" })).toBe(false);
    expect(isPitchRun({})).toBe(false);
  });
});

describe("the hedged request", () => {
  const later = <T>(ms: number, value: T, fail = false) => (signal: AbortSignal) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => (fail ? reject(new Error(String(value))) : resolve(value)), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      });
    });
  const signal = () => new AbortController().signal;

  it("the main model answering in time wins, and the faster one is never asked", async () => {
    const hedge = vi.fn(later(10, "lite"));
    expect(await hedged(later(20, "flash"), hedge, 100, signal())).toEqual({ value: "flash", by: "primary" });
    expect(hedge).not.toHaveBeenCalled();
  });

  it("a slow main model is raced by the faster one; the first answer wins and the other is dropped", async () => {
    const why: string[] = [];
    const result = await hedged(later(300, "flash"), later(20, "lite"), 50, signal(), (w) => why.push(w));
    expect(result).toEqual({ value: "lite", by: "hedge" });
    expect(why).toEqual(["slow"]);
  });

  it("a failing main model asks the faster one at once; both failing throws the main model's error", async () => {
    const started = Date.now();
    expect(await hedged(later(10, "down", true), later(10, "lite"), 5_000, signal())).toEqual({ value: "lite", by: "hedge" });
    expect(Date.now() - started).toBeLessThan(1_000);
    await expect(hedged(later(10, "main down", true), later(10, "lite down", true), 5_000, signal())).rejects.toThrow("main down");
  });
});
