import { describe, expect, it, vi } from "vitest";
import { fromWav } from "../src/audio/pcm";
import type { RuntimeClock } from "../src/clock";
import { PITCH_LIMITS, PitchRecorder, announcementText, isPitchRun } from "../src/pitch";

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

function recorder(kind: "pitch" | "name" = "pitch", extra: { ignoreMs?: number } = {}) {
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

  it("the name step is short", () => {
    const { feed, advance, onDone } = recorder("name");
    feed(10, true);
    advance(PITCH_LIMITS.name.silenceMs);
    expect(onDone).toHaveBeenCalledWith("silence");
  });
});

describe("the words", () => {
  it("announces the place, the speaker when known, and asks for the name when not", () => {
    expect(announcementText({ title: "Effect en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" }, { askName: false })).toBe(
      "¡Listo, Ana! Tu charla «Effect en producción» queda en Cueva a las 15:00."
    );
    expect(announcementText({ title: "Lambdas", room: "Rincón", timeSlot: "16:00 - 16:45" }, { askName: true })).toBe(
      "¡Listo! Tu charla «Lambdas» queda en Rincón a las 16:00. ¿Cómo te llamás? Tocá, decime tu nombre y tocá de nuevo."
    );
    expect(announcementText({ title: "X" }, { askName: false })).toBe("¡Listo! Tu charla «X» queda en la grilla.");
  });

  it("recognises the firmware's pitch tags", () => {
    expect(isPitchRun({ wakeWordPhrase: "pitch" })).toBe(true);
    expect(isPitchRun({ wakeWordPhrase: "pitch-name" })).toBe(true);
    expect(isPitchRun({ wakeWordPhrase: "okay_nabu" })).toBe(false);
    expect(isPitchRun({})).toBe(false);
  });
});
