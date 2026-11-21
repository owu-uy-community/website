import { describe, expect, it, vi } from "vitest";
import type { StageFaceInput } from "../../../agent/lib/owu-api";
import type { RuntimeClock } from "../src/clock";
import type { DeviceTransport } from "../src/device/transport";
import type { Logger } from "../src/log";
import { createStageMirror } from "../src/stage";

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

/** Manual clock: timers fire only when the test advances time (one that re-arms waits for the next step). */
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
  /** Seconds at a time, so the 1 s heartbeat ticks once per second. */
  const seconds = (n: number) => {
    for (let i = 0; i < n; i++) advance(1000);
  };
  return { clock, advance, seconds };
}

/** The event without its numbering, for comparing what was said. */
const said = ({ boot: _boot, seq: _seq, ...rest }: StageFaceInput) => rest;

/** A mirror whose socket is down (or absent): every face event is posted. */
function setup() {
  const posts: StageFaceInput[] = [];
  const setFace = vi.fn(async (input: StageFaceInput) => {
    posts.push(input);
  });
  const { clock, advance } = fakeClock();
  const mirror = createStageMirror({ api: { owyStage: { setFace } }, logger: silent, source: "owy-1", clock });
  return { mirror, posts, advance };
}

/** A mirror with the bridge's socket up. */
function live(options: { paused?: () => boolean; up?: () => boolean } = {}) {
  const published: [string, Record<string, unknown>][] = [];
  const posts: StageFaceInput[] = [];
  const { clock, advance, seconds } = fakeClock();
  const mirror = createStageMirror({
    api: { owyStage: { setFace: async (input: StageFaceInput) => void posts.push(input) } },
    logger: silent,
    source: "owy-1",
    publish: (event, payload) => {
      if (options.up && !options.up()) return false;
      published.push([event, payload as Record<string, unknown>]);
      return true;
    },
    paused: options.paused,
    clock,
  });
  const faces = () =>
    published.filter(([event]) => event === "face").map(([, payload]) => payload as unknown as StageFaceInput);
  return { mirror, published, posts, advance, seconds, faces };
}

describe("stage mirror", () => {
  it("posts face changes once, ignoring repeats, numbered in order", () => {
    const { mirror, posts } = setup();
    mirror.face("listening");
    mirror.face("listening");
    mirror.face("thinking");
    expect(posts.map(said)).toEqual([
      { state: "listening", source: "owy-1" },
      { state: "thinking", source: "owy-1" },
    ]);
    expect(posts[0].boot).toMatch(/^[0-9a-f]{8}$/);
    expect(posts[1].boot).toBe(posts[0].boot);
    expect(posts.map((post) => post.seq)).toEqual([1, 2]);
  });

  it("batches transcript deltas per speaker and flushes on the timer", () => {
    const { mirror, posts, advance } = setup();
    mirror.face("listening");
    mirror.transcript("input", "Hola ");
    mirror.transcript("input", "Owy");
    expect(posts).toHaveLength(1);
    advance(250);
    expect(said(posts.at(-1)!)).toEqual({
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
    expect(said(posts.at(-1)!)).toEqual({ state: "happy", source: "owy-1" });

    const off = createStageMirror({ api: null, logger: silent, source: "owy-2" });
    expect(off.wrap(transport)).toBe(transport);
    off.face("listening");
    off.transcript("input", "nada");
    off.level(50);
    off.stop();
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
    expect(posts.slice(-2).map(said)).toEqual([
      { state: "thinking", card, source: "owy-1" },
      { state: "thinking", expression: { name: "surprised", strength: 70, at: expect.any(Number) }, source: "owy-1" },
    ]);
  });

  it("sends everything over the bridge's socket when it is up, keeping only cards on the site", () => {
    const { mirror, published, posts, advance, faces } = live();
    const transport = { setFace: () => {}, showCard: () => {} } as unknown as DeviceTransport;
    mirror.face("speaking");
    mirror.transcript("output", "Hola");
    advance(300);
    mirror.mouth("AAQgw", 120);
    mirror.expression("happy", 80, 200);
    mirror.wrap(transport).showCard({ title: "Effect" });
    expect(faces().map(said)).toEqual([
      { state: "speaking", source: "owy-1" },
      { state: "speaking", transcript: { who: "output", text: "Hola" }, source: "owy-1" },
      { state: "speaking", expression: { name: "happy", strength: 80, at: expect.any(Number) }, source: "owy-1" },
      { state: "speaking", card: { title: "Effect" }, source: "owy-1" },
    ]);
    expect(faces().map((face) => face.seq)).toEqual([1, 2, 3, 4]);
    expect(published.find(([event]) => event === "mouth")?.[1]).toEqual({
      source: "owy-1",
      at: expect.any(Number),
      frames: "AAQgw",
    });
    // A card is kept on the site too (same number: pages that already have it drop the broadcast).
    expect(posts).toEqual([faces()[3]]);
  });

  it("falls back to the site while the socket is down", () => {
    let up = true;
    const { mirror, posts, faces } = live({ up: () => up });
    mirror.face("listening");
    up = false;
    mirror.face("thinking");
    up = true;
    mirror.face("speaking");
    expect(faces().map((face) => [face.state, face.seq])).toEqual([
      ["listening", 1],
      ["speaking", 3],
    ]);
    expect(posts.map((post) => [post.state, post.seq])).toEqual([["thinking", 2]]);
  });

  it("repeats the face every 4 s without a new number, and says pausa at once", () => {
    let paused = false;
    const { mirror, faces, seconds, posts } = live({ paused: () => paused });
    mirror.face("listening");
    seconds(4);
    expect(faces().map((face) => [face.state, face.seq, face.beat, face.privacy])).toEqual([
      ["listening", 1, undefined, undefined],
      ["listening", 1, true, undefined],
    ]);
    paused = true;
    seconds(1);
    expect(faces().at(-1)).toMatchObject({ state: "listening", seq: 2, privacy: true });
    expect(faces().at(-1)?.beat).toBeUndefined();
    mirror.face("idle");
    expect(faces().at(-1)).toMatchObject({ state: "idle", seq: 3, privacy: true });
    expect(posts).toEqual([]);
  });

  it("asks for pausa only from its first beat (the session behind it is created after the mirror)", () => {
    let session: { paused: boolean } | undefined;
    const { mirror, faces, seconds } = live({
      paused: () => {
        if (!session) throw new Error("Cannot access 'session' before initialization");
        return session.paused;
      },
    });
    session = { paused: true };
    seconds(1);
    expect(faces().at(-1)).toMatchObject({ state: "idle", privacy: true, seq: 1 });
    mirror.stop();
  });

  it("keeps beating when pausa can't be read", () => {
    const { faces, seconds } = live({
      paused: () => {
        throw new Error("board gone");
      },
    });
    seconds(8);
    expect(faces().map((face) => [face.state, face.beat, face.privacy])).toEqual([
      ["idle", true, undefined],
      ["idle", true, undefined],
    ]);
  });

  it("stops beating once stopped", () => {
    const { mirror, faces, seconds } = live();
    seconds(4);
    expect(faces()).toHaveLength(1);
    mirror.stop();
    seconds(8);
    expect(faces()).toHaveLength(1);
  });

  it("sends the mic level only while listening, at most every 100 ms", () => {
    const { mirror, published, advance } = live();
    const levels = () => published.filter(([event]) => event === "level").map(([, payload]) => payload);
    mirror.level(40);
    mirror.face("listening");
    mirror.level(40.4);
    mirror.level(90);
    advance(100);
    mirror.level(130);
    mirror.face("thinking");
    advance(100);
    mirror.level(20);
    expect(levels()).toEqual([
      { source: "owy-1", level: 40 },
      { source: "owy-1", level: 100 },
    ]);
  });

  it("tees what the knob's screen is told: captions, what it heard, text and QR", () => {
    const { mirror, published } = live();
    const told: unknown[][] = [];
    const transport = {
      setFace: () => {},
      showCard: () => {},
      showCaption: (text: string) => told.push(["caption", text]),
      showHeard: (text: string) => told.push(["heard", text]),
      showText: (text: string) => told.push(["text", text]),
      showQr: (url: string, caption?: string) => told.push(["qr", url, caption]),
    } as unknown as DeviceTransport;
    const knob = mirror.wrap(transport);
    knob.showHeard?.("¿qué hay a las tres?");
    knob.showCaption?.("x".repeat(700));
    knob.showText("No tengo micrófono");
    knob.showQr("https://owu.uy/conf", "La grilla");
    expect(told).toHaveLength(4);
    const screens = published.filter(([event]) => event === "screen").map(([, payload]) => payload);
    expect(screens).toEqual([
      { source: "owy-1", kind: "heard", text: "¿qué hay a las tres?" },
      { source: "owy-1", kind: "caption", text: "x".repeat(600) },
      { source: "owy-1", kind: "text", text: "No tengo micrófono" },
      { source: "owy-1", kind: "qr", text: "La grilla", url: "https://owu.uy/conf" },
    ]);
  });
});
