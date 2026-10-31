import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Experimental_RealtimeServerEvent, ToolSet } from "ai";
import { VoiceAssistantEvent as E, type VoiceAssistantAudioData, type VoiceAssistantRequest } from "esphome-client";
import { DeviceSession, type SharedRuntime } from "../src/index";
import type { VoiceTurn } from "../src/device/pipeline";
import { createLogger } from "../src/log";

/**
 * The voice loop on a bad network: a tap is never declined because the
 * realtime model is down, a dead socket moves the turn to the cascade
 * (transcribe → answer → speak), and nothing ends in a stuck or red face.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function loudFrame(): Buffer {
  const pcm = Buffer.alloc(640);
  for (let i = 0; i < 320; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 3) * 6000), i * 2);
  return pcm;
}

function harness(
  options: {
    live?: boolean;
    transcribe?: () => Promise<string>;
    speak?: () => AsyncGenerator<Buffer>;
    clips?: Record<string, Buffer>;
    authorizeTool?: (name: string) => string | null;
    idleResetS?: number;
  } = {}
) {
  const events: number[] = [];
  const eventData: unknown[] = [];
  const texts: string[] = [];
  let audioBytes = 0;
  const realtime = {
    status: options.live ? "connected" : "error",
    isConnected: options.live ?? false,
    goAwayPending: false,
    tierSpec: "gateway:google/gemini-3.8-live",
    resetConversation: vi.fn(),
    commitAudio: vi.fn(),
    sendAudio: vi.fn(),
    sendText: vi.fn(),
    whenSettled: async () => {},
    connect: vi.fn(async () => {
      throw new Error("sin red");
    }),
    reconnect: vi.fn(async () => {}),
  };
  const device = {
    isPlaybackReady: () => true,
    sendEvent: (type: number, data?: unknown) => {
      events.push(type);
      eventData.push(data);
    },
    sendAudio: (data: Buffer) => {
      audioBytes += data.length;
    },
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    setFace: vi.fn(),
    showText: (text: string) => texts.push(text),
    showQr: vi.fn(),
    isStaffMode: () => false,
  };
  const cascade = {
    transcribe: vi.fn(options.transcribe ?? (async () => "¿Dónde es la charla de Effect?")),
    answer: vi.fn(async () => "En la Cueva, a las tres."),
    speak: vi.fn(
      options.speak ??
        async function* () {
          yield Buffer.alloc(32_000); // 1 s at 16 kHz
        }
    ),
  };
  const session = new DeviceSession(
    { id: "test", host: "unused", port: 6053, psk: null },
    {
      logger: createLogger("test", "error"),
      config: { COMPANION_ACK_MS: 2500, COMPANION_PITCH_VAD_RMS: 0.012, COMPANION_EVE_IDLE_RESET_S: options.idleResetS },
      brain: "local",
      provider: { spec: "gateway:google/gemini-3.8-live", provider: "gateway", modelId: "google/gemini-3.8-live" },
      instructions: "Sos Owy.",
      cascade,
      fallbackClips: options.clips ?? {},
      gridUrl: "https://owu.uy/grilla",
    } as unknown as SharedRuntime,
    { authorizeTool: options.authorizeTool }
  );
  const wired = session as unknown as {
    device: unknown;
    session: unknown;
    turn: VoiceTurn;
    tools: ToolSet;
    path: string;
    eveAnswer: string | null;
    inputTranscript: string;
    onRequestStart(request: VoiceAssistantRequest): Promise<void>;
    onDeviceAudio(chunk: VoiceAssistantAudioData): void;
    onModelEvent(event: Experimental_RealtimeServerEvent): void;
    onRealtimeDropped(reason: string): void;
    cascadeTools(): ToolSet;
    historyNote(): string;
  };
  wired.device = device;
  wired.session = realtime;
  const speakFor = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      wired.onDeviceAudio({ data: loudFrame(), end: false });
      vi.advanceTimersByTime(20);
    }
  };
  return { wired, realtime, device, cascade, events, eventData, texts, speakFor, audio: () => audioBytes };
}

it("a tap with no realtime session is answered through the cascade, never declined", async () => {
  const h = harness({ live: false });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  expect(h.device.acceptRequest).toHaveBeenCalledOnce();
  expect(h.device.declineRequest).not.toHaveBeenCalled();
  expect(h.wired.path).toBe("cascade");

  h.speakFor(1000);
  // The bridge's own VAD tells the device someone is talking (its idle guard cancels at 9 s otherwise).
  expect(h.events).toContain(E.STT_VAD_START);
  expect(h.realtime.sendAudio).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(900); // the pause ends the utterance
  expect(h.cascade.transcribe).toHaveBeenCalledOnce();
  expect(h.eventData).toContainEqual([{ name: "text", value: "¿Dónde es la charla de Effect?" }]);
  expect(h.cascade.answer).toHaveBeenCalledWith(expect.objectContaining({ text: "¿Dónde es la charla de Effect?" }));

  await vi.advanceTimersByTimeAsync(1500);
  expect(h.audio()).toBe(32_000);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.events).toContain(E.TTS_START);
  expect(h.events).toContain(E.RUN_END);
  expect(h.events).not.toContain(E.ERROR);
});

it("a realtime socket that goes silent hands the turn to the cascade after the pause", async () => {
  const h = harness({ live: true });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  expect(h.wired.path).toBe("realtime");
  h.speakFor(1000);
  expect(h.realtime.sendAudio).toHaveBeenCalled();
  // The pause (900 ms after the last loud frame), then the ack window, checked every 250 ms.
  await vi.advanceTimersByTimeAsync(880 + 2400);
  expect(h.cascade.transcribe).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(400);
  expect(h.realtime.resetConversation).toHaveBeenCalled(); // late replies from the dead socket must not land
  expect(h.cascade.transcribe).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1500);
  expect(h.audio()).toBe(32_000);
  expect(h.events).not.toContain(E.ERROR);
  expect(h.wired.turn.finished).toBe(true);
});

it("a model that reacts to the pause keeps the turn on the realtime road", async () => {
  const h = harness({ live: true });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.speakFor(1000);
  await vi.advanceTimersByTimeAsync(1500); // paused; the model takes its time but reacts
  h.wired.onModelEvent({ type: "input-transcription-completed", itemId: "u1", transcript: "Hola", raw: {} });
  h.wired.turn.endListening("Hola"); // e.g. its tool call
  await vi.advanceTimersByTimeAsync(4000);
  h.wired.onModelEvent({ type: "response-created", responseId: "r1", raw: {} } as Experimental_RealtimeServerEvent);
  await vi.advanceTimersByTimeAsync(4000);
  expect(h.cascade.transcribe).not.toHaveBeenCalled();
  expect(h.wired.path).toBe("realtime");
  h.wired.turn.finish();
});

it("a model that goes quiet after taking the turn hands it to the cascade", async () => {
  const h = harness({ live: true });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.speakFor(1000);
  h.wired.onModelEvent({ type: "input-transcription-completed", itemId: "u1", transcript: "Hola", raw: {} });
  h.wired.turn.endListening("Hola");
  await vi.advanceTimersByTimeAsync(4800);
  expect(h.cascade.transcribe).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(500);
  expect(h.cascade.transcribe).toHaveBeenCalledOnce(); // from the turn's own recording
  await vi.advanceTimersByTimeAsync(1500);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.events).not.toContain(E.ERROR);
});

it("a tool the model waits on (eve thinking) is not silence", async () => {
  const h = harness({ live: true });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.speakFor(1000);
  h.wired.turn.endListening("Hola");
  (h.wired as unknown as { toolsRunning: number }).toolsRunning = 1;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(h.cascade.transcribe).not.toHaveBeenCalled();
  expect(h.wired.path).toBe("realtime");
  h.wired.turn.finish();
});

it("a socket that dies while Owy talks ends on what arrived, without an error", async () => {
  const h = harness({ live: true });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.wired.turn.endListening("hola");
  h.wired.onModelEvent({
    type: "audio-delta",
    responseId: "r1",
    itemId: "i1",
    delta: Buffer.alloc(24_000).toString("base64"), // 0.5 s at 24 kHz
    raw: {},
  });
  h.wired.onRealtimeDropped("socket cerrado 1006");
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.audio()).toBe(16_000);
  expect(h.events).toContain(E.RUN_END);
  expect(h.events).not.toContain(E.ERROR);
  expect(h.cascade.transcribe).not.toHaveBeenCalled();
});

it("eve's answer, ready when the socket died, is spoken by the cascade instead of replayed", async () => {
  const h = harness({ live: true });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.wired.turn.endListening("¿qué hay ahora?");
  h.wired.eveAnswer = "Ahora hay tres charlas.";
  h.wired.onRealtimeDropped("socket cerrado 1006");
  await vi.advanceTimersByTimeAsync(1500);
  expect(h.cascade.transcribe).not.toHaveBeenCalled();
  expect(h.cascade.speak).toHaveBeenCalledWith("Ahora hay tres charlas.", expect.anything());
  expect(h.wired.turn.finished).toBe(true);
  expect(h.events).not.toContain(E.ERROR);
});

it("no network at all: the pre-rendered line plays and the grid QR shows, no error face", async () => {
  const h = harness({
    live: false,
    transcribe: async () => {
      throw new Error("fetch failed");
    },
    clips: { offline: Buffer.alloc(16_000) },
  });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.speakFor(1000);
  await vi.advanceTimersByTimeAsync(900);
  expect(h.wired.path).toBe("offline");
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.audio()).toBe(16_000);
  expect(h.device.showQr).toHaveBeenCalledWith("https://owu.uy/grilla", expect.any(String));
  expect(h.wired.turn.finished).toBe(true);
  expect(h.events).not.toContain(E.ERROR);
});

it("no voice: the answer goes on the screen and the run still ends cleanly", async () => {
  const h = harness({
    live: false,
    // eslint-disable-next-line require-yield
    speak: async function* () {
      throw new Error("TTS 503");
    },
  });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  h.speakFor(1000);
  await vi.advanceTimersByTimeAsync(900);
  await vi.advanceTimersByTimeAsync(10);
  expect(h.texts).toEqual(["En la Cueva, a las tres."]);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.events).toContain(E.RUN_END);
  expect(h.events).not.toContain(E.ERROR);
});

it("a tap with nothing said ends quietly on the cascade too", async () => {
  const h = harness({ live: false });
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  await vi.advanceTimersByTimeAsync(8000);
  expect(h.wired.turn.finished).toBe(true);
  expect(h.cascade.transcribe).not.toHaveBeenCalled();
  expect(h.events).not.toContain(E.ERROR);
});

it("cumulative input transcripts replace, delta ones append, and listeners get only the new words", async () => {
  const heard: string[] = [];
  const h = harness({ live: true });
  (h.wired as unknown as { options: { onTranscript: (who: string, text: string) => void } }).options.onTranscript = (
    _who,
    text
  ) => heard.push(text);
  await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
  const transcript = (itemId: string, text: string) =>
    h.wired.onModelEvent({ type: "input-transcription-completed", itemId, transcript: text, raw: {} });
  transcript("u1", "Hola");
  transcript("u1", "Hola Owy,"); // google ≥4.0.84: the utterance so far
  transcript("u1", "Hola Owy,"); // a repeat adds nothing
  transcript("u2", "¿qué"); // a codec sending deltas
  transcript("u2", " hay hoy?");
  expect(h.wired.inputTranscript).toBe("Hola Owy, ¿qué hay hoy?");
  expect(heard).toEqual(["Hola", " Owy,", "¿qué", " hay hoy?"]);
  h.wired.turn.finish();
});

it("the cascade's local tools obey the browser grant like the realtime model's", async () => {
  const execute = vi.fn(async () => ({ ok: true }));
  const h = harness({ authorizeTool: (name) => (name === "create_track" ? "Solo lectura" : null) });
  h.wired.tools = { create_track: { execute }, get_board: { execute } } as unknown as ToolSet;
  const tools = h.wired.cascadeTools();
  const options = { toolCallId: "c1", messages: [] } as never;
  expect(await tools.create_track.execute!({}, options)).toEqual({ ok: false, denied: true, error: "Solo lectura" });
  expect(execute).not.toHaveBeenCalled();
  expect(await tools.get_board.execute!({}, options)).toEqual({ ok: true });
});

it("each tap remembers the taps before it, until nobody talks for a while", async () => {
  const h = harness({ live: false, idleResetS: 180 });
  const tap = async (question: string) => {
    h.cascade.transcribe.mockResolvedValueOnce(question);
    await h.wired.onRequestStart({ start: true } as VoiceAssistantRequest);
    h.speakFor(1000);
    await vi.advanceTimersByTimeAsync(900 + 1500);
    expect(h.wired.turn.finished).toBe(true);
  };
  await tap("¿Dónde es la charla de Effect?");
  await vi.advanceTimersByTimeAsync(60_000); // a minute later, same person
  await tap("¿Y a qué hora empieza?");
  expect(h.cascade.answer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: "¿Y a qué hora empieza?",
      history: [
        { role: "user", content: "¿Dónde es la charla de Effect?" },
        { role: "assistant", content: "En la Cueva, a las tres." },
      ],
    })
  );
  // A fresh realtime session (after a reset or a reconnect) starts knowing it too.
  expect(h.wired.historyNote()).toContain("Persona: ¿Y a qué hora empieza?");

  await vi.advanceTimersByTimeAsync(180_000); // the visitor left
  expect(h.wired.historyNote()).toBe("");
  expect(h.realtime.resetConversation).toHaveBeenCalled(); // the live session forgets them too
  await tap("Hola, ¿qué es OWU?");
  expect(h.cascade.answer).toHaveBeenLastCalledWith(expect.objectContaining({ history: [] }));
});
