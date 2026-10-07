import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Experimental_RealtimeServerEvent } from "ai";
import { VoiceAssistantEvent as E, type VoiceAssistantRequest } from "esphome-client";
import { DeviceSession, type SharedRuntime } from "../src/index";
import { VoiceTurn, type VoiceLink } from "../src/device/pipeline";
import type { CompanionDevice } from "../src/device/esphome";
import { createLogger } from "../src/log";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("uses one paced queue for many model deltas received during the firmware handoff", () => {
  let ready = false;
  let bytes = 0;
  const events: number[] = [];
  const link: VoiceLink & { setSpeakLevel: () => void } = {
    isPlaybackReady: () => ready,
    sendEvent: (type) => events.push(type),
    sendAudio: (data) => {
      bytes += data.length;
    },
    setSpeakLevel: () => {},
  };
  const logger = createLogger("test", "error");
  const session = new DeviceSession({ id: "test", host: "unused", port: 6053, psk: null }, { logger } as SharedRuntime);
  const turn = new VoiceTurn({ link, logger, conversationId: "test" });
  // Inject the two transport seams without opening network connections. The
  // real model-event handler, resampler, chunker, turn and pacer run together.
  const wired = session as unknown as {
    device: CompanionDevice;
    turn: VoiceTurn;
    onModelEvent(event: Experimental_RealtimeServerEvent): void;
  };
  wired.device = link as unknown as CompanionDevice;
  wired.turn = turn;
  turn.start();
  for (let i = 0; i < 8; i++) {
    wired.onModelEvent({
      type: "audio-delta",
      responseId: "r1",
      itemId: "item-1",
      delta: Buffer.alloc(12000).toString("base64"),
      raw: {},
    });
    vi.advanceTimersByTime(40);
  }
  expect(bytes).toBe(0);
  wired.onModelEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
  ready = true;
  vi.advanceTimersByTime(20);
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThanOrEqual(4224);
  expect(events.filter((e) => e === E.TTS_START)).toHaveLength(1);
  vi.advanceTimersByTime(2500);
  expect(bytes).toBeGreaterThan(63000);
  expect(bytes).toBeLessThanOrEqual(64000);
  expect(turn.finished).toBe(true);
  expect(events.filter((e) => e === E.RUN_END)).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

function conversationHarness() {
  const events: number[] = [];
  const provider = {
    status: "connected",
    isConnected: true,
    goAwayPending: false,
    resetConversation: vi.fn(),
    commitAudio: vi.fn(),
  };
  const device = {
    isPlaybackReady: () => true,
    sendEvent: (type: number) => events.push(type),
    sendAudio: () => {},
    setSpeakLevel: () => {},
    acceptRequest: vi.fn(),
  };
  const session = new DeviceSession({ id: "test", host: "unused", port: 6053, psk: null }, {
    logger: createLogger("test", "error"),
  } as SharedRuntime);
  const wired = session as unknown as {
    device: unknown;
    session: unknown;
    turn: VoiceTurn;
    onRequestStart(request: VoiceAssistantRequest): Promise<void>;
    onModelEvent(event: Experimental_RealtimeServerEvent): void;
  };
  wired.device = device;
  wired.session = provider;
  return { wired, provider, device, events };
}

it("closes eight seconds of silence without committing it or synthesizing an error", async () => {
  const { wired, provider, events } = conversationHarness();
  await wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  vi.advanceTimersByTime(7999);
  expect(wired.turn.phase).toBe("listening");
  vi.advanceTimersByTime(1);
  expect(wired.turn.finished).toBe(true);
  expect(provider.resetConversation).toHaveBeenCalledOnce();
  expect(provider.commitAudio).not.toHaveBeenCalled();
  expect(events).toEqual([E.RUN_START, E.STT_START, E.RUN_END]);
});

it("retains model context between replies and lets transcribed speech exceed the idle window", async () => {
  const { wired, provider, device } = conversationHarness();
  await wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  wired.turn.beginSpeaking("Hola");
  wired.turn.endSpeaking();
  await wired.onRequestStart({ start: true, conversationId: "same-conversation" } as VoiceAssistantRequest);
  vi.advanceTimersByTime(7000);
  wired.onModelEvent({
    type: "input-transcription-completed",
    itemId: "item-2",
    transcript: "Y además quería preguntar",
    raw: {},
  });
  vi.advanceTimersByTime(5000);
  expect(wired.turn.phase).toBe("listening");
  expect(provider.resetConversation).not.toHaveBeenCalled();
  expect(device.acceptRequest).toHaveBeenCalledTimes(2);
  wired.turn.finish();
});

it("preserves delayed input transcripts after commit without reopening the microphone", async () => {
  const { wired } = conversationHarness();
  await wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  wired.turn.endListening("");
  wired.onModelEvent({ type: "input-transcription-completed", itemId: "late-input", transcript: "Hola Owy", raw: {} });
  expect((wired as unknown as { inputTranscript: string }).inputTranscript).toBe("Hola Owy");
  expect(wired.turn.phase).toBe("thinking");
  wired.turn.finish();
  wired.onModelEvent({ type: "input-transcription-completed", itemId: "stale", transcript: "No agregar", raw: {} });
  expect((wired as unknown as { inputTranscript: string }).inputTranscript).toBe("Hola Owy");
});

it("cues one face per sentence as the paced audio reaches it (local brain, live transcript)", async () => {
  const cues: [string, number, number][] = [];
  const device = {
    isPlaybackReady: () => true,
    sendEvent: () => {},
    sendAudio: () => {},
    acceptRequest: vi.fn(),
    expressionLeadMs: 200,
    sendExpression: (expression: string, leadMs: number, strength: number) => cues.push([expression, leadMs, strength]),
  };
  const session = new DeviceSession({ id: "test", host: "unused", port: 6053, psk: null }, {
    logger: createLogger("test", "error"),
    config: { COMPANION_MOUTH_LATENCY_MS: 250 },
    expressions: {}, // local guesses: deterministic, no network
  } as unknown as SharedRuntime);
  const wired = session as unknown as {
    device: unknown;
    session: unknown;
    turn: VoiceTurn;
    onRequestStart(request: VoiceAssistantRequest): Promise<void>;
    onModelEvent(event: Experimental_RealtimeServerEvent): void;
  };
  wired.device = device;
  wired.session = {
    status: "connected",
    isConnected: true,
    goAwayPending: false,
    resetConversation: vi.fn(),
    commitAudio: vi.fn(),
  };
  await wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  wired.turn.endListening("hola");
  // Gemini: transcript and audio interleave; 24 kHz deltas, 1 s per sentence.
  const say = (text: string) => {
    wired.onModelEvent({ type: "audio-transcript-delta", responseId: "r1", itemId: "i1", delta: text, raw: {} });
    wired.onModelEvent({
      type: "audio-delta",
      responseId: "r1",
      itemId: "i1",
      delta: Buffer.alloc(48_000).toString("base64"),
      raw: {},
    });
  };
  say("¡Hola, qué bueno verte! ");
  say("Perdón, esa charla ya se llenó. ");
  wired.onModelEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
  vi.advanceTimersByTime(300);
  expect(cues).toEqual([["happy", 200, 60]]); // first sentence audible
  vi.advanceTimersByTime(1000);
  expect(cues).toEqual([
    ["happy", 200, 60],
    ["empathetic", 200, 60],
  ]); // the second one when its audio leaves the pacer, not when its text arrived
  vi.advanceTimersByTime(2000);
  expect(wired.turn.finished).toBe(true);
});

it("a new device run supersedes the old turn without ending the new one on the device", async () => {
  // ESPHome events carry no run id: the old run's TTS_STREAM_END/RUN_END, sent
  // after the device already opened its follow-up, ended that follow-up and
  // left a stale "stream ended" that cut the next reply.
  const { wired, events } = conversationHarness();
  await wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  wired.turn.endListening("hola");
  wired.turn.beginSpeaking("Hola");
  expect(events).toContain(E.TTS_STREAM_START);
  events.length = 0;
  await wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  expect(events).not.toContain(E.TTS_STREAM_END);
  expect(events).not.toContain(E.RUN_END);
  expect(events[0]).toBe(E.RUN_START);
  wired.turn.finish();
});
