import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
    setFace: vi.fn(),
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
    setFace: vi.fn(),
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
  kind: "pitch" as "pitch" | "unclear" | "not_pitch",
  title: "Effect en producción" as string | null,
  speaker: "Ana" as string | null,
  needsTV: false,
  needsWhiteboard: false,
  description: "Un año de Effect" as string | null,
  topics: ["effect"],
  reaction: "Qué lindo tema, Ana." as string | null,
  appropriate: true,
};
const ANNOUNCED = "[GUION] ¡Listo, Ana! Tu charla «Effect en producción» queda en Cueva a las 15:00.";

function pitchHarness(
  options: {
    clips?: Record<string, number>;
    clipPcm?: Record<string, Buffer>;
    voice?: "silent" | "confirm" | "react";
    eve?: unknown;
    cascade?: unknown;
    canAsk?: boolean;
    logDir?: string;
    hostMic?: unknown;
    mic?: "device" | "host";
    dedupe?: unknown;
    pitchMode?: boolean;
  } = {}
) {
  const events: number[] = [];
  const eventData: unknown[] = [];
  const spoken: string[] = [];
  const shown: unknown[] = [];
  const texts: string[] = [];
  const prompts: string[] = [];
  const clips: string[] = [];
  let audioBytes = 0;
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
    sendAudio: (audio: Buffer) => {
      audioBytes += audio.length;
    },
    acceptRequest: vi.fn(),
    setFace: vi.fn(),
    showCard: (card: unknown) => shown.push(card),
    showText: (text: string) => texts.push(text),
    ...(options.canAsk === false ? {} : { pitchPrompt: (kind: string) => prompts.push(kind) }),
    playClip: (id: string) => clips.push(id),
    isStaffMode: () => false,
    getMicSource: () => options.mic ?? "device",
    getAudioOutput: () => "device",
  };
  const extract = {
    card: vi.fn(async (_wav: Buffer, _signal: AbortSignal) => ({ ...heardCard })),
    answer: vi.fn(async (_wav: Buffer, _context: unknown, _signal: AbortSignal) => ({
      title: null as string | null,
      speaker: "Ana" as string | null,
      description: null as string | null,
      appropriate: true,
    })),
  };
  const api = {
    tracks: {
      createPlaced: vi.fn(async (input: { title: string; speaker?: string }) => ({
        note: { id: "t1", title: input.title, speaker: input.speaker, room: "Cueva", timeSlot: "15:00 - 15:45" },
        placement: { room: "Cueva", timeSlot: "15:00 - 15:45", reasoning: "El bloque está vacío.", degraded: false, missing: [], skipped: [] },
      })),
      list: vi.fn(async (_input: { openSpaceId: string }) => [] as unknown[]),
      update: vi.fn(async () => ({})),
    },
  };
  const session = new DeviceSession({ id: "test", host: "unused", port: 6053, psk: null }, {
    logger: createLogger("test", "error"),
    config: { COMPANION_PITCH_VOICE: options.voice ?? "confirm", COMPANION_LOG_DIR: options.logDir, COMPANION_PITCH_MODE: options.pitchMode ?? false },
    brain: options.eve ? "eve" : "local",
    eve: options.eve,
    cascade: options.cascade,
    hostMic: options.hostMic,
    pitch: { extract, api, openSpaceId: async () => "e1", clips: options.clips ?? {}, clipPcm: options.clipPcm ?? {}, dedupe: options.dedupe },
  } as unknown as SharedRuntime);
  const wired = session as unknown as {
    device: unknown;
    session: unknown;
    turn: VoiceTurn;
    pitch: { kind: string } | null;
    flow: unknown;
    onRequestStart(request: VoiceAssistantRequest): Promise<void>;
    onRequestStop(): Promise<void>;
    onDeviceAudio(chunk: VoiceAssistantAudioData): void;
    onModelEvent(event: Experimental_RealtimeServerEvent): void;
    submitPitch(reason: "submit" | "silence" | "cap"): void;
    listenToHostMic(): void;
  };
  wired.device = device;
  wired.session = provider;
  const tap = (tag = "pitch") => wired.onRequestStart({ start: true, wakeWordPhrase: tag } as VoiceAssistantRequest);
  const speak = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      wired.onDeviceAudio({ data: loudFrame(), end: false });
      vi.advanceTimersByTime(20);
    }
  };
  /** The second tap, then the bridge's async work. */
  const submit = async () => {
    wired.submitPitch("submit");
    await vi.advanceTimersByTimeAsync(50);
  };
  /** The realtime model says the line it was handed; the run ends. */
  const answer = async () => {
    wired.onModelEvent({ type: "audio-delta", responseId: "r1", itemId: "i1", delta: Buffer.alloc(4800).toString("base64"), raw: {} });
    wired.onModelEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
    await vi.advanceTimersByTimeAsync(2000);
  };
  return {
    session,
    wired,
    provider,
    device,
    events,
    eventData,
    spoken,
    shown,
    texts,
    prompts,
    clips,
    extract,
    api,
    tap,
    speak,
    submit,
    answer,
    audioBytes: () => audioBytes,
  };
}

it("modo pitch: records the pitch itself, places it on the board and announces where it landed", async () => {
  const h = pitchHarness();
  await h.tap();
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
  expect(h.spoken).toEqual([ANNOUNCED]);
  // The knob's pill shows what it heard.
  expect(h.eventData).toContainEqual([{ name: "text", value: heardCard.transcript }]);
  await h.answer();
  expect(h.events).toContain(E.TTS_START);
  expect(h.events.at(-1)).toBe(E.RUN_END);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.prompts).toEqual([]); // the speaker introduced herself: nothing to ask
  expect(h.wired.flow).toBeNull();
});

it("modo pitch: a second submit while the pitch is already understood places one card", async () => {
  const h = pitchHarness();
  h.wired.submitPitch("submit"); // no pitch recording yet: ignored
  await h.tap();
  h.speak(3000);
  h.wired.submitPitch("submit"); // the knob's second tap
  h.wired.submitPitch("submit"); // the panel's «Enviar», a moment later
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.card).toHaveBeenCalledOnce();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
});

it("modo pitch: a pitch without a name asks for it first; the board opens its mic and the card lands once, complete", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.tap();
  h.speak(3000);
  vi.advanceTimersByTime(10_000); // nobody taps; the silence ends it
  await vi.advanceTimersByTimeAsync(50);
  expect(h.spoken).toEqual(["[GUION] ¿Cómo te llamás?"]);
  expect(h.api.tracks.createPlaced).not.toHaveBeenCalled(); // nothing on the board until it is complete
  expect(h.prompts).toEqual([]); // the mic opens once the question has been said
  await h.answer();
  expect(h.prompts).toEqual(["name"]);

  // The board opens its mic by itself (a run tagged "pitch-answer"); a short pause ends an answer.
  await h.tap("pitch-answer");
  expect(h.wired.pitch?.kind).toBe("answer");
  h.speak(1200);
  vi.advanceTimersByTime(3000);
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.answer).toHaveBeenCalledWith(
    expect.any(Buffer),
    { field: "name", question: "¿Cómo te llamás?", transcript: heardCard.transcript },
    expect.anything()
  );
  expect(h.extract.card).toHaveBeenCalledOnce(); // not a new pitch
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
  expect(h.api.tracks.createPlaced.mock.calls[0][0]).toMatchObject({ title: "Effect en producción", speaker: "Ana" });
  expect(h.api.tracks.update).not.toHaveBeenCalled();
  expect(h.shown).toEqual([{ title: "Effect en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" }]);
  expect(h.spoken.at(-1)).toBe(ANNOUNCED); // said in the answer's own run
  await h.answer();
  expect(h.wired.turn.finished).toBe(true);
  expect(h.wired.flow).toBeNull();
});

it("modo pitch: an unclear topic is asked once and the answer names the talk; a second miss creates nothing", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, kind: "unclear", title: null, description: null });
  h.extract.answer.mockResolvedValueOnce({ title: "Testing con IA", speaker: null, description: "Cómo testear con LLMs", appropriate: true });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.spoken).toEqual(["[GUION] ¿De qué va tu charla, en pocas palabras?"]);
  await h.answer();
  expect(h.prompts).toEqual(["topic"]);
  await h.tap("pitch-answer");
  h.speak(1500);
  await h.submit();
  expect(h.extract.answer.mock.calls[0][1]).toMatchObject({ field: "topic" });
  // The pitch already had the name: nothing else to ask.
  expect(h.api.tracks.createPlaced.mock.calls[0][0]).toMatchObject({
    title: "Testing con IA",
    speaker: "Ana",
    description: "Cómo testear con LLMs",
  });
  await h.answer();

  // Again, and this time the answer does not say it either.
  h.extract.card.mockResolvedValueOnce({ ...heardCard, kind: "unclear", title: null });
  h.extract.answer.mockResolvedValueOnce({ title: null, speaker: null, description: null, appropriate: true });
  await h.tap();
  h.speak(3000);
  await h.submit();
  await h.answer();
  await h.tap("pitch-answer");
  h.speak(1500);
  await h.submit();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
  expect(h.spoken.at(-1)).toBe("[GUION] No me quedó claro el tema. Tocá y contame de nuevo de qué va tu charla.");
});

it("modo pitch: nobody answers the question — the card lands with what it has, said in that same run", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.tap();
  h.speak(3000);
  await h.submit();
  await h.answer();
  await h.tap("pitch-answer");
  await vi.advanceTimersByTimeAsync(8_500); // the mic is open, nobody speaks
  expect(h.extract.answer).not.toHaveBeenCalled();
  expect(h.api.tracks.createPlaced.mock.calls[0][0]).toMatchObject({ title: "Effect en producción", speaker: undefined });
  expect(h.spoken.at(-1)).toBe("[GUION] ¡Listo! Tu charla «Effect en producción» queda en Cueva a las 15:00.");
  await h.answer();
  expect(h.wired.flow).toBeNull();
});

it("modo pitch: a board that never opens its mic for the answer still gets the card, on screen", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.tap();
  h.speak(3000);
  await h.submit();
  await h.answer();
  expect(h.prompts).toEqual(["name"]);
  await vi.advanceTimersByTimeAsync(6_100);
  expect(h.prompts).toEqual(["name", "idle"]);
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
  expect(h.shown).toHaveLength(1);
  expect(h.spoken).toEqual(["[GUION] ¿Cómo te llamás?"]); // no run left to talk in
  expect(h.wired.flow).toBeNull();
});

it("modo pitch: a board that cannot open its own mic (the knob) — the bridge asks and opens the mic for the answer itself", async () => {
  const h = pitchHarness({ canAsk: false });
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.spoken).toEqual(["[GUION] ¿Cómo te llamás?"]);
  await h.answer(); // the question's run ends; a moment later the answer run opens on its own
  expect(h.prompts).toEqual([]); // nothing was asked of the board
  expect(h.wired.pitch?.kind).toBe("answer");
  h.speak(1200);
  await h.submit();
  expect(h.api.tracks.createPlaced.mock.calls[0][0]).toMatchObject({ title: "Effect en producción", speaker: "Ana" });
  expect(h.spoken.at(-1)).toBe(ANNOUNCED);
});

it("modo pitch: too short a pitch creates nothing; a recorded cue plays on the board's own speaker, no model needed", async () => {
  const cue = Buffer.alloc(16_000); // 0.5 s
  const h = pitchHarness({ clips: { "pitch-listen": 2500, "pitch-empty": 500 }, clipPcm: { "pitch-empty": cue } });
  await h.tap();
  expect(h.clips).toEqual(["pitch-listen"]);
  vi.advanceTimersByTime(3000); // the cue's echo is over
  h.speak(600);
  await h.submit();
  expect(h.extract.card).not.toHaveBeenCalled();
  expect(h.api.tracks.createPlaced).not.toHaveBeenCalled();
  expect(h.spoken).toEqual([]);
  await vi.advanceTimersByTimeAsync(1500);
  expect(h.audioBytes()).toBe(cue.length);
  expect(h.events.at(-1)).toBe(E.RUN_END);
});

it("modo pitch: a greeting is not a pitch", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, kind: "not_pitch", title: null, transcript: "Hola Owy, ¿me escuchás?" });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.api.tracks.createPlaced).not.toHaveBeenCalled();
  expect(h.spoken).toEqual(["[GUION] No escuché una propuesta. Tocá y contame tu charla."]);
});

it("modo pitch: a full board is said, not crashed; a stop while recording drops the pitch", async () => {
  const h = pitchHarness();
  h.api.tracks.createPlaced.mockRejectedValueOnce(Object.assign(new Error("full"), { code: "CONFLICT", status: 409 }));
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.shown).toEqual([]);
  expect(h.spoken).toEqual(["[GUION] Justo ahora no queda lugar libre en la grilla; hablá con el staff."]);
  await h.answer();

  await h.tap();
  h.speak(2000);
  await h.wired.onRequestStop();
  await vi.advanceTimersByTimeAsync(50);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.wired.pitch).toBeNull();
  expect(h.wired.flow).toBeNull();
  expect(h.extract.card).toHaveBeenCalledOnce();
});

it("modo pitch: a write that timed out is looked for before trying again — no duplicate, no lost pitch", async () => {
  const h = pitchHarness();
  const lost = Object.assign(new Error("fetch failed"), { cause: "ECONNRESET" });
  // It did land: the board has it.
  h.api.tracks.createPlaced.mockRejectedValueOnce(lost);
  h.api.tracks.list.mockResolvedValueOnce([
    { id: "t9", title: "Effect en producción", speaker: "Ana", room: "Ventana", timeSlot: "16:00 - 16:45", createdAt: new Date().toISOString() },
  ]);
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
  expect(h.shown).toEqual([{ title: "Effect en producción", speaker: "Ana", room: "Ventana", timeSlot: "16:00 - 16:45" }]);
  await h.answer();

  // It did not: one more try.
  h.api.tracks.createPlaced.mockRejectedValueOnce(lost);
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.api.tracks.list).toHaveBeenCalledTimes(2);
  expect(h.api.tracks.createPlaced).toHaveBeenCalledTimes(3);
  expect(h.spoken.at(-1)).toBe(ANNOUNCED);

  // A plain refusal (4xx) is not retried.
  h.api.tracks.createPlaced.mockRejectedValueOnce(Object.assign(new Error("bad"), { code: "BAD_REQUEST", status: 400 }));
  await h.answer();
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledTimes(4);
  expect(h.spoken.at(-1)).toBe("[GUION] Perdón, se me trabó la propuesta. Probá de nuevo o contale al staff.");
});

it("modo pitch: a slow write is waited for, never raced by a second one", async () => {
  const h = pitchHarness();
  const placedLate = {
    note: { id: "t1", title: "Effect en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" },
    placement: { room: "Cueva", timeSlot: "15:00 - 15:45", reasoning: "Vacío", degraded: false, missing: [], skipped: [] },
  };
  h.api.tracks.createPlaced.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(placedLate), 25_000)));
  await h.tap();
  h.speak(3000);
  await h.submit();
  await vi.advanceTimersByTimeAsync(20_000); // past the first deadline: it looks, the card is not there yet
  expect(h.api.tracks.list).toHaveBeenCalledOnce();
  expect(h.shown).toEqual([]);
  await vi.advanceTimersByTimeAsync(5_000); // the same request lands
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
  expect(h.shown).toEqual([{ title: "Effect en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" }]);
  expect(h.spoken.at(-1)).toBe(ANNOUNCED);
});

it("modo pitch: a pitch the bridge could not understand is kept for the staff (COMPANION_LOG_DIR)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "owy-pitch-"));
  const h = pitchHarness({ logDir: dir });
  h.extract.card.mockRejectedValueOnce(new Error("gateway down"));
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.spoken).toEqual(["[GUION] Perdón, se me trabó la propuesta. Probá de nuevo o contale al staff."]);
  await vi.waitFor(() => expect(readdirSync(path.join(dir, "pitch-failures")).sort()).toHaveLength(2));
  const files = readdirSync(path.join(dir, "pitch-failures")).sort();
  expect(files[0]).toMatch(/-test\.json$/);
  expect(files[1]).toMatch(/-test\.wav$/);
  rmSync(dir, { recursive: true, force: true });
});

it("modo pitch, Callado: no voice at all — questions are the knob's own hint, the card on screen is the answer", async () => {
  const h = pitchHarness({ voice: "silent", clips: { "pitch-listen": 2500 } });
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.tap();
  expect(h.clips).toEqual([]); // not even «te escucho»
  h.speak(3000);
  await h.submit();
  expect(h.spoken).toEqual([]);
  expect(h.texts).toEqual([]);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.prompts).toEqual(["name"]);
  await h.tap("pitch-answer");
  h.speak(1200);
  await h.submit();
  expect(h.api.tracks.createPlaced.mock.calls[0][0]).toMatchObject({ speaker: "Ana" });
  expect(h.shown).toHaveLength(1);
  expect(h.spoken).toEqual([]);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.events.filter((e) => e === E.TTS_START)).toHaveLength(0);

  // An ending without a card goes on the screen.
  h.extract.card.mockResolvedValueOnce({ ...heardCard, kind: "not_pitch", title: null });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.texts).toEqual(["No escuché una propuesta. Tocá y contame tu charla."]);
});

it("modo pitch, Confirma y comenta: Owy's sentence comes in the same extraction, no second model on the way", async () => {
  const eve = { turn: vi.fn(), cancel: vi.fn(), reset: vi.fn() };
  const h = pitchHarness({ voice: "react", eve });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.spoken).toEqual([`${ANNOUNCED} Qué lindo tema, Ana.`]);
  expect(eve.turn).not.toHaveBeenCalled();
  await h.answer();

  // No sentence from the model: the announcement alone. Confirma never adds it.
  h.extract.card.mockResolvedValueOnce({ ...heardCard, reaction: null });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.spoken.at(-1)).toBe(ANNOUNCED);
  const plain = pitchHarness({ voice: "confirm" });
  await plain.tap();
  plain.speak(3000);
  await plain.submit();
  expect(plain.spoken).toEqual([ANNOUNCED]);
});

it("modo pitch: interrupted while Owy waits for the name, what it understood is still placed — silently", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.tap();
  h.speak(3000);
  await h.submit();
  await h.answer();
  await h.tap("pitch-answer");
  h.speak(600);
  await h.wired.onRequestStop(); // the mode switched off, a stop…
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.answer).not.toHaveBeenCalled();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
  expect(h.shown).toEqual([]); // the board moved on: no card pushed over whatever it shows now
  expect(h.spoken).toEqual(["[GUION] ¿Cómo te llamás?"]);
  expect(h.wired.flow).toBeNull();
});

it("modo pitch: the Mac's mic feeds the recording when the board routes to it, and the board's mic when it is down", async () => {
  const sink: { listener: ((pcm: Buffer) => void) | null } = { listener: null };
  const hostMic = {
    ready: true,
    status: () => ({ name: "DJI Mic 2", channel: "mix", health: hostMic.ready ? "open" : "gone" }),
    ensureOpen: vi.fn(),
    onPcm: (fn: (pcm: Buffer) => void) => {
      sink.listener = fn;
      return () => (sink.listener = null);
    },
  };
  const h = pitchHarness({ hostMic, mic: "host" });
  h.wired.listenToHostMic();
  expect(hostMic.ensureOpen).toHaveBeenCalled();
  await h.tap();
  // The board's own capture is ignored; the Mac's frames are the pitch.
  h.speak(3000);
  expect(h.events).not.toContain(E.STT_VAD_START);
  for (let i = 0; i < 150; i++) {
    sink.listener?.(loudFrame());
    vi.advanceTimersByTime(20);
  }
  expect(h.events).toContain(E.STT_VAD_START);
  await h.submit();
  expect(h.extract.card).toHaveBeenCalledOnce();
  await h.answer();

  hostMic.ready = false; // the receiver was unplugged
  await h.tap();
  h.speak(3000);
  expect(h.events.filter((e) => e === E.STT_VAD_START)).toHaveLength(2);
});

it("modo pitch: something not fit for the public board is turned away — nothing asked, nothing placed", async () => {
  const h = pitchHarness();
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null, appropriate: false });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.api.tracks.createPlaced).not.toHaveBeenCalled();
  expect(h.prompts).toEqual([]);
  expect(h.spoken).toEqual(["[GUION] Esa propuesta no la puedo cargar en la grilla. Si te parece un error, hablá con el staff."]);
});

it("modo pitch: a talk already on the board is not placed twice — Owy says where it is", async () => {
  const onBoard = { id: "t9", title: "Effect en producción, un año después", speaker: "Ana", room: "Ventana", timeSlot: "16:00 - 16:45" };
  const dedupe = { find: vi.fn(async () => 0) };
  const h = pitchHarness({ dedupe });
  h.api.tracks.list.mockResolvedValue([onBoard]);
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(dedupe.find).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Effect en producción", transcript: heardCard.transcript }),
    [onBoard],
    expect.anything()
  );
  expect(h.api.tracks.createPlaced).not.toHaveBeenCalled();
  expect(h.shown).toEqual([{ title: onBoard.title, speaker: "Ana", room: "Ventana", timeSlot: "16:00 - 16:45" }]);
  expect(h.spoken).toEqual(["[GUION] Esa charla ya está en la grilla: «Effect en producción, un año después», en Ventana a las 16:00."]);
});

it("modo pitch: the duplicate check runs while Owy asks for the name, and a failed check never blocks the card", async () => {
  const dedupe = { find: vi.fn(async (): Promise<number | null> => { throw new Error("jev down"); }) };
  const h = pitchHarness({ dedupe });
  h.extract.card.mockResolvedValueOnce({ ...heardCard, speaker: null });
  await h.tap();
  h.speak(3000);
  await h.submit();
  expect(h.spoken).toEqual(["[GUION] ¿Cómo te llamás?"]);
  expect(dedupe.find).toHaveBeenCalledOnce(); // already asked, before the answer exists
  await h.answer();
  await h.tap("pitch-answer");
  h.speak(1200);
  await h.submit();
  expect(dedupe.find).toHaveBeenCalledOnce();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
  expect(h.spoken.at(-1)).toBe(ANNOUNCED);
});

it("a normal run still streams the microphone to the model", async () => {
  const h = pitchHarness();
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.speak(200);
  expect(h.provider.sendAudio).toHaveBeenCalled();
  expect(h.wired.pitch).toBeNull();
  h.wired.turn.finish();
});

// ── The tap: the knob's, or the panel's virtual knob ────────────────────────

it("tap: starts a turn on the Mac's mic with no board; a second tap hands the words over", async () => {
  const sink: { listener: ((pcm: Buffer) => void) | null } = { listener: null };
  const hostMic = {
    ready: true,
    status: () => ({ name: "Wireless Microphone RX", channel: "mix", health: "open" }),
    ensureOpen: vi.fn(),
    onPcm: (fn: (pcm: Buffer) => void) => {
      sink.listener = fn;
      return () => (sink.listener = null);
    },
  };
  const faces: string[] = [];
  const provider = { status: "connected", isConnected: true, goAwayPending: false, resetConversation: vi.fn(), commitAudio: vi.fn(), sendAudio: vi.fn() };
  const session = new DeviceSession(
    { id: "owy-knob", host: "unused", port: 6053, psk: null },
    { logger: createLogger("test", "error"), config: { COMPANION_MIC_SOURCE: "host", COMPANION_AUDIO_OUTPUT: "host" }, hostMic } as unknown as SharedRuntime,
    { onFace: (face) => faces.push(face) }
  );
  const wired = session as unknown as { session: unknown; turn: VoiceTurn; listenToHostMic(): void };
  wired.session = provider;
  wired.listenToHostMic();
  session.tap();
  await vi.advanceTimersByTimeAsync(0);
  expect(wired.turn.phase).toBe("listening");
  expect(faces).toEqual(["listening"]);
  for (let i = 0; i < 50; i++) {
    sink.listener?.(loudFrame());
    vi.advanceTimersByTime(20);
  }
  expect(provider.sendAudio).toHaveBeenCalled();
  session.tap(); // done talking
  expect(provider.commitAudio).toHaveBeenCalledOnce();
  expect(wired.turn.phase).toBe("thinking");
  expect(faces.at(-1)).toBe("thinking");
  expect(session.deviceStatus()).toMatchObject({ connected: false, phase: "thinking" });
  wired.turn.finish();
});

it("tap: while Owy talks, a tap stops him with a plain face, not an error", async () => {
  const h = pitchHarness();
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.wired.turn.endListening("hola");
  h.wired.turn.beginSpeaking("Hola");
  expect(h.device.setFace).toHaveBeenLastCalledWith("speaking");
  h.session.tap();
  await vi.advanceTimersByTimeAsync(10);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.device.setFace).toHaveBeenLastCalledWith("idle");
  expect(h.events).not.toContain(E.ERROR);
});

it("tap in modo pitch: the first tap records, the second one sends", async () => {
  const h = pitchHarness({ pitchMode: true });
  h.session.tap();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.wired.pitch?.kind).toBe("pitch");
  h.speak(3000);
  h.session.tap();
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.card).toHaveBeenCalledOnce();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
});

it("the panel's pitch buttons: start records a pitch whatever the mode says, submit sends it", async () => {
  const h = pitchHarness();
  h.session.pitchAction("start");
  await vi.advanceTimersByTimeAsync(0);
  expect(h.wired.pitch?.kind).toBe("pitch");
  h.speak(3000);
  h.session.pitchAction("submit");
  await vi.advanceTimersByTimeAsync(50);
  expect(h.extract.card).toHaveBeenCalledOnce();
  expect(h.api.tracks.createPlaced).toHaveBeenCalledOnce();
});

it("a knob with the Mac's mic down and no browser: the tap says so, and the face recovers by itself", async () => {
  const events: number[] = [];
  const device = {
    canPlayAudio: false,
    isPlaybackReady: () => true,
    sendEvent: (type: number) => events.push(type),
    sendAudio: () => {},
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    setFace: vi.fn(),
    showCaption: vi.fn(),
    showText: vi.fn(),
    isStaffMode: () => false,
  };
  const session = new DeviceSession({ id: "owy-knob", host: "unused", port: 6053, psk: null }, {
    logger: createLogger("test", "error"),
    config: {},
  } as unknown as SharedRuntime);
  const wired = session as unknown as { device: unknown; session: unknown; turn: VoiceTurn };
  wired.device = device;
  wired.session = { status: "connected", isConnected: true, goAwayPending: false, resetConversation: vi.fn(), commitAudio: vi.fn() };
  session.tap();
  await vi.advanceTimersByTimeAsync(0);
  expect(device.showCaption).toHaveBeenCalledWith("No tengo micrófono: conectá el de la Mac o un navegador.");
  expect(device.setFace).toHaveBeenLastCalledWith("error");
  expect(wired.turn.finished).toBe(true);
  expect(events).toContain(E.ERROR);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(device.setFace).toHaveBeenLastCalledWith("idle");
});
