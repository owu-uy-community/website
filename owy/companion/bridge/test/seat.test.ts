import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnvSchema, type BridgeConfig } from "../src/config";
import { TalkSeat } from "../src/control/seat";
import type { ControlPlane } from "../src/control/plane";
import type { DeviceSession } from "../src/index";
import { createLogger } from "../src/log";
import { OWY_TALK_CHANNEL } from "../src/web/contract";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const knob = {
    id: "owy-knob",
    talk: true,
    hasPeer: false,
    phase: "idle",
    setting: (key: string) => (key === "talk" ? knob.talk : undefined),
    say: vi.fn(async () => {}),
    ask: vi.fn(async () => {}),
    hush: vi.fn(),
    setTalk: vi.fn(),
    setPitchMode: vi.fn(),
    pitchSettings: () => ({ mode: false, voice: "confirm", source: "device" }),
    voiceStatus: () => ({ tier: "gateway:google/gemini-3.8-live", realtime: "connected", lastPath: null }),
  };
  const beats: { attached: string | null }[] = [];
  const plane = { change: vi.fn(() => ({ ok: true })) };
  const seat = new TalkSeat({
    config: { ...EnvSchema.parse({}), devices: [] } as BridgeConfig,
    sessions: [knob as unknown as DeviceSession],
    plane: plane as unknown as ControlPlane,
    beat: async (status) => void beats.push(status as { attached: string | null }),
    logger: createLogger("test", "error"),
  });
  seat.start();
  return { seat, knob, beats, plane };
}

it("runs the console's commands for a board in talk mode, once each", () => {
  const { seat, knob, plane } = setup();
  seat.onEvent(OWY_TALK_CHANNEL, "command", { id: "a1", message: { type: "say", text: "Hola, soy Owy.", clip: "talk-wake" } });
  seat.onEvent(OWY_TALK_CHANNEL, "command", { id: "a1", message: { type: "say", text: "Hola, soy Owy.", clip: "talk-wake" } });
  seat.onEvent(OWY_TALK_CHANNEL, "command", { id: "a2", message: { type: "listen", channel: "R" } });
  seat.onEvent(OWY_TALK_CHANNEL, "command", { id: "a3", message: { type: "talk", talk: { slide: "Título", asker: "presenter" } } });
  expect(knob.say).toHaveBeenCalledOnce();
  expect(knob.say).toHaveBeenCalledWith("Hola, soy Owy.", "talk-wake");
  expect(plane.change).toHaveBeenCalledWith("bridge", "host_mic_channel", "R", "local");
  expect(knob.setTalk).toHaveBeenCalledWith({ slide: "Título", asker: "presenter" });
});

it("stays out of the way when a browser is the seat, and lets go with one last beat", async () => {
  const { seat, knob, beats } = setup();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(beats.at(-1)).toMatchObject({ attached: "owy-knob" });
  knob.hasPeer = true;
  seat.onEvent(OWY_TALK_CHANNEL, "command", { id: "b1", message: { type: "hush" } });
  expect(knob.hush).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(beats.at(-1)).toMatchObject({ attached: null });
  const count = beats.length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(beats).toHaveLength(count);
});
