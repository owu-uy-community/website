import { VoiceAssistantEvent } from "esphome-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceTurn, wantsFollowUp, type VoiceLink } from "../src/device/pipeline";
import { createLogger } from "../src/log";

class FakeLink implements VoiceLink {
  ready = true;
  isPlaybackReady() { return this.ready; }
  events: { type: number; data?: { name: string; value: string }[] }[] = [];
  audio: Buffer[] = [];
  sendEvent(type: number, data?: { name: string; value: string }[]) {
    this.events.push({ type, data });
  }
  sendAudio(buffer: Buffer) {
    this.audio.push(buffer);
  }
  types() {
    return this.events.map((e) => e.type);
  }
}

const E = VoiceAssistantEvent;

function makeTurn(link: FakeLink, extra: Partial<ConstructorParameters<typeof VoiceTurn>[0]> = {}) {
  return new VoiceTurn({ link, logger: createLogger("test", "error"), conversationId: "conv-1", ...extra });
}

describe("VoiceTurn", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("follows the Home Assistant event order for a spoken reply", () => {
    const link = new FakeLink();
    const phases: string[] = [];
    const turn = makeTurn(link, { onPhase: (phase) => phases.push(phase) });

    turn.start();
    turn.endListening("hola owy");
    turn.beginSpeaking("Hola");
    turn.pushAudio(Buffer.alloc(1024));
    turn.endSpeaking({ continueConversation: true, speech: "Hola, ¿cómo estás?" });

    expect(link.types()).toEqual([
      E.RUN_START,
      E.STT_START,
      E.STT_VAD_END,
      E.STT_END,
      E.INTENT_END,
      E.TTS_START,
      E.TTS_END,
      E.TTS_STREAM_START,
      E.INTENT_END,
      E.TTS_STREAM_END,
      E.RUN_END,
    ]);
    expect(link.events[3].data).toEqual([{ name: "text", value: "hola owy" }]);
    const finalIntent = link.events[8].data ?? [];
    expect(finalIntent).toContainEqual({ name: "continue_conversation", value: "1" });
    expect(finalIntent).toContainEqual({ name: "conversation_id", value: "conv-1" });
    expect(link.audio).toHaveLength(1);
    expect(phases).toEqual(["listening", "thinking", "speaking", "finished"]);
    expect(turn.finished).toBe(true);
  });

  it("jumps straight from listening to speaking when audio arrives first", () => {
    const link = new FakeLink();
    const turn = makeTurn(link);
    turn.start();
    turn.beginSpeaking("");
    expect(link.types()).toEqual([E.RUN_START, E.STT_START, E.STT_VAD_END, E.STT_END, E.INTENT_END, E.TTS_START, E.TTS_END, E.TTS_STREAM_START]);
    expect(link.events.find(e => e.type === E.TTS_START)?.data?.[0].value).not.toBe("");
    expect(link.events.find(e => e.type === E.TTS_END)?.data).toEqual([{ name: "url", value: "api://owy/response" }]);
  });

  it("always terminates: finish() is idempotent and late calls are ignored", () => {
    const link = new FakeLink();
    const turn = makeTurn(link);
    turn.start();
    turn.beginSpeaking("x");
    turn.finish();
    turn.finish();
    turn.pushAudio(Buffer.alloc(10));
    turn.endSpeaking();
    turn.beginSpeaking("again");
    expect(link.types()).toEqual([E.RUN_START, E.STT_START, E.STT_VAD_END, E.STT_END, E.INTENT_END, E.TTS_START, E.TTS_END, E.TTS_STREAM_START, E.TTS_STREAM_END, E.RUN_END]);
    expect(link.audio).toHaveLength(0);
  });

  it("ends a silent listening window normally, without an error or TTS", () => {
    const link = new FakeLink();
    const onNoSpeech = vi.fn();
    const turn = makeTurn(link, { onNoSpeech, timers: { noSpeechMs: 1000 } });
    turn.start();
    vi.advanceTimersByTime(1001);
    expect(onNoSpeech).toHaveBeenCalledOnce();
    expect(link.types()).toEqual([E.RUN_START, E.STT_START, E.RUN_END]);
    expect(turn.finished).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not cut off speech that starts inside the listening window", () => {
    const link = new FakeLink();
    const onNoSpeech = vi.fn();
    const turn = makeTurn(link, { onNoSpeech, timers: { noSpeechMs: 1000 } });
    turn.start();
    vi.advanceTimersByTime(900);
    turn.markSpeechStarted();
    turn.markSpeechStarted();
    vi.advanceTimersByTime(3000);
    expect(turn.phase).toBe("listening");
    expect(onNoSpeech).not.toHaveBeenCalled();
    expect(link.types().filter(e => e === E.STT_VAD_START)).toHaveLength(1);
    turn.finish();
  });

  it("closes a stalled TTS stream", () => {
    const link = new FakeLink();
    const turn = makeTurn(link, { timers: { ttsStallMs: 500 } });
    turn.start();
    turn.endListening("x");
    turn.beginSpeaking("y");
    turn.pushAudio(Buffer.alloc(4));
    vi.advanceTimersByTime(400);
    turn.pushAudio(Buffer.alloc(4));
    vi.advanceTimersByTime(400);
    expect(turn.finished).toBe(false);
    vi.advanceTimersByTime(200);
    expect(turn.finished).toBe(true);
    expect(link.types().slice(-2)).toEqual([E.TTS_STREAM_END, E.RUN_END]);
  });

  it("does not stay in thinking forever", () => {
    const link = new FakeLink();
    const turn = makeTurn(link, { timers: { thinkingMs: 1000 } });
    turn.start();
    turn.endListening("x");
    vi.advanceTimersByTime(1001);
    expect(turn.finished).toBe(true);
    expect(link.types().slice(-2)).toEqual([E.ERROR, E.RUN_END]);
  });

  it("waits for actual microphone release, even after a slow handoff", () => {
    const link = new FakeLink();
    link.ready = false;
    const turn = makeTurn(link);
    turn.start();
    turn.endListening("hola");
    turn.beginSpeaking("respuesta");
    expect(turn.deferred).toBe(true);
    expect(turn.phase).toBe("thinking");
    expect(link.types()).toEqual([E.RUN_START, E.STT_START, E.STT_VAD_END, E.STT_END]);
    expect(link.audio).toHaveLength(0);

    vi.advanceTimersByTime(1200);
    expect(turn.deferred).toBe(true);
    expect(link.types()).not.toContain(E.TTS_START);
    link.ready = true;
    vi.advanceTimersByTime(20);
    expect(turn.deferred).toBe(false);
    expect(turn.phase).toBe("speaking");
    expect(link.types().slice(4)).toEqual([E.INTENT_END, E.TTS_START, E.TTS_END, E.TTS_STREAM_START]);
    expect(link.audio).toHaveLength(0);
  });

  it("does not bypass the handoff when a very short reply ends first", () => {
    const link = new FakeLink();
    link.ready = false;
    const turn = makeTurn(link);
    turn.start();
    turn.endListening("hola");
    turn.beginSpeaking("");
    turn.endSpeaking({ speech: "ok" });
    expect(link.types()).not.toContain(E.TTS_START);
    expect(turn.finished).toBe(false);
    link.ready = true;
    vi.advanceTimersByTime(20);
    expect(link.types().slice(-3)).toEqual([E.INTENT_END, E.TTS_STREAM_END, E.RUN_END]);
    expect(turn.finished).toBe(true);
  });

  it("fails and releases timers when the microphone never becomes ready", () => {
    const link = new FakeLink();
    link.ready = false;
    const turn = makeTurn(link, { playbackReadyTimeoutMs: 500 });
    turn.start();
    turn.beginSpeaking("hola");
    vi.advanceTimersByTime(600);
    expect(turn.finished).toBe(true);
    expect(link.types()).not.toContain(E.TTS_START);
    expect(link.types().slice(-2)).toEqual([E.ERROR, E.RUN_END]);
    link.ready = true;
    vi.advanceTimersByTime(1000);
    expect(link.types()).not.toContain(E.TTS_START);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not resurrect a cancelled handoff when the device becomes ready", () => {
    const link = new FakeLink();
    link.ready = false;
    const turn = makeTurn(link);
    turn.start();
    turn.beginSpeaking();
    turn.finish();
    link.ready = true;
    vi.advanceTimersByTime(500);
    expect(link.types()).not.toContain(E.TTS_START);
  });

  it("fails cleanly mid-speech", () => {
    const link = new FakeLink();
    const turn = makeTurn(link);
    turn.start();
    turn.beginSpeaking("");
    turn.fail("server_error", "boom");
    expect(link.types().slice(-3)).toEqual([E.TTS_STREAM_END, E.ERROR, E.RUN_END]);
  });
});

describe("wantsFollowUp", () => {
  it("re-opens the mic only after a question", () => {
    expect(wantsFollowUp("¿Cómo te llamás?")).toBe(true);
    expect(wantsFollowUp("Tengo Cueva o Rincón, ¿cuál preferís?")).toBe(true);
    expect(wantsFollowUp("Listo, quedó en Cueva a las quince y treinta.")).toBe(false);
    expect(wantsFollowUp("")).toBe(false);
  });
});
