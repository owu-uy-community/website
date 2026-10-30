import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Experimental_RealtimeServerEvent } from "ai";
import { VoiceAssistantEvent as E, type VoiceAssistantAudioData, type VoiceAssistantRequest } from "esphome-client";
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

// ── Modo pitch ──────────────────────────────────────────────────────────────

/** One 20 ms frame of 16 kHz PCM16 with a voice-like tone in it. */
function loudFrame(): Buffer {
  const pcm = Buffer.alloc(640);
  for (let i = 0; i < 320; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 3) * 6000), i * 2);
  return pcm;
}

const heardCard = {
  transcript: "Soy Ana y quiero hablar de Effect en producción",
  isPitch: true,
  title: "Effect en producción",
  speaker: "Ana" as string | null,
  needsTV: false,
  needsWhiteboard: false,
  description: "Un año de Effect",
  topics: ["effect"],
};

function pitchHarness(options: { clips?: Record<string, number>; reacts?: boolean; eve?: unknown } = {}) {
  const events: number[] = [];
  const eventData: unknown[] = [];
  const spoken: string[] = [];
  const shown: unknown[] = [];
  const texts: string[] = [];
  const prompts: string[] = [];
  const clips: string[] = [];
  const provider = {
    status: "connected",
    isConnected: true,
    goAwayPending: false,
    resetConversation: vi.fn(),
    commitAudio: vi.fn(),
    sendAudio: vi.fn(),
    sendText: vi.fn((text: string) => spoken.push(text)),
  };
  const device = {
    isPlaybackReady: () => true,
    sendEvent: (type: number, data?: unknown) => {
      events.push(type);
      eventData.push(data);
    },
    sendAudio: () => {},
    acceptRequest: vi.fn(),
    setFace: vi.fn(),
    showCard: (card: unknown) => shown.push(card),
    showText: (text: string) => texts.push(text),
    pitchPrompt: (kind: string) => prompts.push(kind),
    playClip: (id: string) => clips.push(id),
    isStaffMode: () => false,
  };
  const extract = { card: vi.fn(async () => heardCard), name: vi.fn(async () => ({ name: "Ana" })) };
  const api = {
    tracks: {
      createPlaced: vi.fn(async (input: { title: string; speaker?: string }) => ({
        note: { id: "t1", title: input.title, speaker: input.speaker, room: "Cueva", timeSlot: "15:00 - 15:45" },
        placement: { room: "Cueva", timeSlot: "15:00 - 15:45", reasoning: "El bloque está vacío.", degraded: false, missing: [], skipped: [] },
      })),
      update: vi.fn(async () => ({})),
    },
  };
  const session = new DeviceSession({ id: "test", host: "unused", port: 6053, psk: null }, {
    logger: createLogger("test", "error"),
    config: { COMPANION_PITCH_REACTS: options.reacts ?? false },
    brain: options.eve ? "eve" : "local",
    eve: options.eve,
    pitch: { extract, api, openSpaceId: async () => "e1", clips: options.clips ?? {} },
  } as unknown as SharedRuntime);
  const wired = session as unknown as {
    device: unknown;
    session: unknown;
    turn: VoiceTurn;
    pitch: unknown;
    onRequestStart(request: VoiceAssistantRequest): Promise<void>;
    onRequestStop(): Promise<void>;
    onDeviceAudio(chunk: VoiceAssistantAudioData): void;
    onModelEvent(event: Experimental_RealtimeServerEvent): void;
    submitPitch(reason: "submit" | "silence" | "cap"): void;
  };
  wired.device = device;
  wired.session = provider;
  const speak = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      wired.onDeviceAudio({ data: loudFrame(), end: false });
      vi.advanceTimersByTime(20);
    }
  };
  const answer = () => {
    wired.onModelEvent({ type: "audio-delta", responseId: "r1", itemId: "i1", delta: Buffer.alloc(4800).toString("base64"), raw: {} });
    wired.onModelEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
    vi.advanceTimersByTime(2000);
  };
  return { wired, provider, device, events, eventData, spoken, shown, texts, prompts, clips, extract, api, speak, answer };
}

it("modo pitch: records the pitch itself, places it on the board and announces where it landed", async () => {
  const h = pitchHarness();
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  expect(h.events).toEqual([E.RUN_START, E.STT_START]);
  h.speak(3000);
  expect(h.events).toContain(E.STT_VAD_START);
  expect(h.provider.sendAudio).not.toHaveBeenCalled(); // nothing goes to the model while recording
  h.wired.submitPitch("submit"); // the second tap
  expect(h.events.slice(-2)).toEqual([E.STT_VAD_END, E.STT_END]);
  expect(h.wired.turn.phase).toBe("thinking");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.card).toHaveBeenCalledOnce();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledWith(
    expect.objectContaining({ openSpaceId: "e1", title: "Effect en producción", speaker: "Ana", source: "companion" })
  );
  expect(h.shown).toEqual([{ title: "Effect en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" }]);
  expect(h.spoken).toEqual(["[GUION] ¡Listo, Ana! Tu charla «Effect en producción» queda en Cueva a las 15:00."]);
  // The knob's pill shows what it heard.
  expect(h.eventData).toContainEqual([{ name: "text", value: heardCard.transcript }]);
  h.answer();
  expect(h.events).toContain(E.TTS_START);
  expect(h.events.at(-1)).toBe(E.RUN_END);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.prompts).toEqual([]); // the speaker introduced herself: nothing to ask
  expect(h.wired.pitch).toBeNull();
});

it("modo pitch: a long silence ends the recording; a pitch without a name asks for it with the next tap", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  h.speak(3000);
  vi.advanceTimersByTime(10_000); // nobody taps; the silence ends it
  expect(h.wired.turn.phase).toBe("thinking");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.spoken[0]).toContain("¿Cómo te llamás? Tocá, decime tu nombre y tocá de nuevo.");
  h.answer();
  expect(h.prompts).toEqual(["name"]); // the invitation starts when the announcement is over
  // The next tap is the name.
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch-name" } as VoiceAssistantRequest);
  h.speak(800);
  h.wired.submitPitch("submit");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.name).toHaveBeenCalledOnce();
  expect(h.extract.card).toHaveBeenCalledOnce(); // not a new pitch
  expect(h.api.tracks.update).toHaveBeenCalledWith({ id: "t1", data: { speaker: "Ana" } });
  expect(h.shown.at(-1)).toMatchObject({ speaker: "Ana" });
  expect(h.spoken.at(-1)).toBe("[GUION] Listo, Ana. Gracias.");
  expect(h.prompts).toEqual(["name", "idle"]);
  h.answer();
  expect(h.wired.turn.finished).toBe(true);
});

it("modo pitch: nobody takes the name within 20 s and the card stays as it is", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  h.speak(3000);
  h.wired.submitPitch("submit");
  await vi.advanceTimersByTimeAsync(50);
  h.answer();
  expect(h.prompts).toEqual(["name"]);
  vi.advanceTimersByTime(20_000);
  expect(h.prompts).toEqual(["name", "idle"]);
  expect(h.api.tracks.update).not.toHaveBeenCalled();
  // The next tap is a fresh pitch again.
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  h.speak(3000);
  h.wired.submitPitch("submit");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.card).toHaveBeenCalledTimes(2);
  expect(h.extract.name).not.toHaveBeenCalled();
});

it("modo pitch: too short a pitch creates nothing and the laptop plays the cue instead of the model", async () => {
  const h = pitchHarness({ clips: { "pitch-listen": 2500, "pitch-empty": 2000 } });
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  expect(h.clips).toEqual(["pitch-listen"]);
  vi.advanceTimersByTime(3000); // the cue's echo is over
  h.speak(600);
  h.wired.submitPitch("submit");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.card).not.toHaveBeenCalled();
  expect(h.api.tracks.createPlaced).not.toHaveBeenCalled();
  expect(h.clips).toEqual(["pitch-listen", "pitch-empty"]);
  expect(h.spoken).toEqual([]);
  expect(h.events.at(-1)).toBe(E.RUN_END);
});

it("modo pitch: a full board is said, not crashed; a tap while recording cancels without a card", async () => {
  const h = pitchHarness();
  h.api.tracks.createPlaced.mockRejectedValueOnce(Object.assign(new Error("full"), { code: "CONFLICT" }));
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  h.speak(3000);
  h.wired.submitPitch("submit");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.shown).toEqual([]);
  expect(h.spoken).toEqual(["[GUION] Justo ahora no queda lugar libre en la grilla; hablá con el staff."]);
  h.answer();

  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  h.speak(2000);
  await h.wired.onRequestStop();
  await vi.advanceTimersByTimeAsync(50);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.wired.pitch).toBeNull();
  expect(h.extract.card).toHaveBeenCalledOnce();
});

it("modo pitch: with «Owy reacciona» on, the eve brain adds a sentence; its failure costs nothing", async () => {
  const eve = {
    turn: vi.fn(async () => ({ sessionId: "s", text: "Qué lindo tema, Ana.", interim: [] })),
    cancel: vi.fn(),
    reset: vi.fn(),
  };
  const h = pitchHarness({ reacts: true, eve });
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  h.speak(3000);
  h.wired.submitPitch("submit");
  await vi.advanceTimersByTimeAsync(50);
  expect(eve.turn).toHaveBeenCalledWith(
    "test",
    heardCard.transcript,
    expect.objectContaining({ kind: "pitch", pitch: expect.objectContaining({ title: "Effect en producción" }), timeoutMs: 8000 })
  );
  expect(h.spoken).toEqual([
    "[GUION] ¡Listo, Ana! Tu charla «Effect en producción» queda en Cueva a las 15:00. Qué lindo tema, Ana.",
  ]);
  h.answer();

  eve.turn.mockRejectedValueOnce(new Error("eve down"));
  await h.wired.onRequestStart({ start: true, wakeWordPhrase: "pitch" } as VoiceAssistantRequest);
  h.speak(3000);
  h.wired.submitPitch("submit");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.spoken.at(-1)).toBe("[GUION] ¡Listo, Ana! Tu charla «Effect en producción» queda en Cueva a las 15:00.");
});

it("a normal run still streams the microphone to the model", async () => {
  const h = pitchHarness();
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.speak(200);
  expect(h.provider.sendAudio).toHaveBeenCalled();
  expect(h.wired.pitch).toBeNull();
  h.wired.turn.finish();
});
