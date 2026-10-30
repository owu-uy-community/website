import { describe, expect, it, vi } from "vitest";
import type { StageFaceInput } from "../../../agent/lib/owu-api";
import type { RuntimeClock } from "../src/clock";
import type { DeviceTransport } from "../src/device/transport";
import type { Logger } from "../src/log";
import { createStageMirror } from "../src/stage";

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

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

function setup() {
  const posts: StageFaceInput[] = [];
  const setFace = vi.fn(async (input: StageFaceInput) => {
    posts.push(input);
  });
  const { clock, advance } = fakeClock();
  const mirror = createStageMirror({ api: { owyStage: { setFace } }, logger: silent, source: "owy-1", clock });
  return { mirror, posts, advance };
}

describe("stage mirror", () => {
  it("posts face changes once, ignoring repeats", () => {
    const { mirror, posts } = setup();
    mirror.face("listening");
    mirror.face("listening");
    mirror.face("thinking");
    expect(posts).toEqual([
      { state: "listening", source: "owy-1" },
      { state: "thinking", source: "owy-1" },
    ]);
  });

  it("batches transcript deltas per speaker and flushes on the timer", () => {
    const { mirror, posts, advance } = setup();
    mirror.face("listening");
    mirror.transcript("input", "Hola ");
    mirror.transcript("input", "Owy");
    expect(posts).toHaveLength(1);
    advance(250);
    expect(posts.at(-1)).toEqual({
      state: "listening",
      transcript: { who: "input", text: "Hola Owy" },
      source: "owy-1",
    });
  });

  it("flushes the pending text before a speaker or face change, then starts fresh", () => {
    const { mirror, posts, advance } = setup();
    mirror.face("listening");
    mirror.transcript("input", "¿Qué hay a las 15?");
    mirror.face("thinking");
    mirror.face("speaking");
    mirror.transcript("output", "A las 15 ");
    mirror.transcript("output", "hay open space");
    advance(250);
    mirror.face("idle");
    // Next turn: the previous captions never leak into it.
    mirror.face("listening");
    mirror.transcript("input", "Gracias");
    advance(250);

    expect(posts.map((p) => [p.state, p.transcript?.who, p.transcript?.text])).toEqual([
      ["listening", undefined, undefined],
      ["listening", "input", "¿Qué hay a las 15?"],
      ["thinking", undefined, undefined],
      ["speaking", undefined, undefined],
      ["speaking", "output", "A las 15 hay open space"],
      ["idle", undefined, undefined],
      ["listening", undefined, undefined],
      ["listening", "input", "Gracias"],
    ]);
  });

  it("tees explicit transport faces and is a no-op without a site key", () => {
    const { mirror, posts } = setup();
    const seen: string[] = [];
    const transport = { setFace: (state: string) => seen.push(state) } as unknown as DeviceTransport;
    mirror.wrap(transport).setFace("happy");
    expect(seen).toEqual(["happy"]);
    expect(posts.at(-1)).toEqual({ state: "happy", source: "owy-1" });

    const off = createStageMirror({ api: null, logger: silent, source: "owy-2" });
    expect(off.wrap(transport)).toBe(transport);
    off.face("listening");
    off.transcript("input", "nada");
    expect(posts).toHaveLength(1);
  });

  it("mirrors the card a transport shows and the feeling per sentence", () => {
    const { mirror, posts } = setup();
    const shown: unknown[] = [];
    const transport = {
      setFace: () => {},
      showCard: (card: unknown) => shown.push(card),
    } as unknown as DeviceTransport;
    const card = { title: "Effect", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" };
    mirror.face("thinking");
    mirror.wrap(transport).showCard(card);
    mirror.expression("surprised", 70);
    expect(shown).toEqual([card]);
    expect(posts.slice(-2)).toEqual([
      { state: "thinking", card, source: "owy-1" },
      { state: "thinking", expression: { name: "surprised", strength: 70 }, source: "owy-1" },
    ]);
  });
});
