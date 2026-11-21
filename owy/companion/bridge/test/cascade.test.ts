import { describe, expect, it, vi } from "vitest";
import { toWav } from "../src/audio/pcm";
import { createLogger } from "../src/log";
import { gatewayCascade, speechChunks, speechPcm, type CascadeCalls } from "../src/realtime/cascade";

const logger = createLogger("test", "error");
const modelIdOf = (options: { model: unknown }) => (options.model as { modelId: string }).modelId;

function cascade(calls: Partial<CascadeCalls>, stream = "elevenlabs/eleven-flash-v2.5") {
  return gatewayCascade({
    apiKey: "test",
    transcribeModels: ["mistral/voxtral-small-transcribe-3", "microsoft/mai-transcribe-2"],
    speechModels: ["google/gemini-3.8-flash-tts", "google/gemini-3.8-flash-lite-tts"],
    speechVoice: "Kore",
    speechStreamModel: stream,
    textModel: "google/gemini-3.8-flash",
    textFallbacks: [],
    logger,
    calls,
  });
}

async function collect(stream: AsyncIterable<Buffer>): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

const wav24k = (ms: number) => ({ uint8Array: toWav(Buffer.alloc((24_000 * 2 * ms) / 1000), 24_000), mediaType: "audio/wav" });

describe("cascade speech", () => {
  it("says the first sentence alone, then whole sentences in chunks", () => {
    const text = `Hola. ${"Una frase larga sobre la grilla del open space. ".repeat(8)}Chau.`;
    const chunks = speechChunks(text);
    expect(chunks[0]).toBe("Hola.");
    expect(chunks.slice(1).every((chunk) => chunk.length <= 220 || !chunk.includes(". "))).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " ").trim());
    expect(speechChunks("sin punto final")).toEqual(["sin punto final"]);
  });

  it("decodes WAV and raw PCM to the device's 16 kHz", () => {
    expect(speechPcm(wav24k(1000)).length).toBe(32_000);
    expect(speechPcm({ uint8Array: Buffer.alloc(48_000), mediaType: "audio/L16;rate=24000" }).length).toBe(32_000);
    expect(() => speechPcm({ uint8Array: Buffer.from("ID3"), mediaType: "audio/mpeg" })).toThrow(/ni WAV ni PCM/);
  });

  it("speaks every sentence in Owy's voice, with no retention at the provider", async () => {
    const generateSpeech = vi.fn(async () => ({ audio: wav24k(500) })) as unknown as CascadeCalls["generateSpeech"];
    const chunks = await collect(cascade({ generateSpeech }).speak("Hola. ¿Qué tal?", AbortSignal.timeout(5000)));
    expect(chunks).toHaveLength(2);
    const call = (generateSpeech as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0][0];
    expect(call).toMatchObject({ voice: "Kore", language: "es", providerOptions: { gateway: { zeroDataRetention: true } } });
  });

  it("tries the next speech model, then the streaming voice for the rest, then gives up", async () => {
    const seen: string[] = [];
    const generateSpeech = vi.fn(async (options: { model: unknown; text: string }) => {
      seen.push(`${modelIdOf(options)}:${options.text}`);
      // Flash speaks the first sentence only; lite never works.
      if (modelIdOf(options) === "google/gemini-3.8-flash-tts" && options.text === "Hola.") return { audio: wav24k(250) };
      throw new Error("no");
    }) as unknown as CascadeCalls["generateSpeech"];
    const streamed: string[] = [];
    const streamSpeech = vi.fn((options: { text: string }) => {
      streamed.push(options.text);
      return {
        fullStream: (async function* () {
          yield { type: "audio", audio: new Uint8Array(4800), audioFormat: { type: "audio/pcm", rate: 24_000 } };
        })(),
      };
    }) as unknown as CascadeCalls["streamSpeech"];
    const chunks = await collect(cascade({ generateSpeech, streamSpeech }).speak("Hola. Segunda frase.", AbortSignal.timeout(5000)));
    expect(chunks.map((chunk) => chunk.length)).toEqual([8000, 3200]);
    expect(seen).toContain("google/gemini-3.8-flash-lite-tts:Segunda frase.");
    expect(streamed).toEqual(["Segunda frase."]);

    const silent = cascade({ generateSpeech: vi.fn(async () => Promise.reject(new Error("no"))) as never }, "");
    await expect(collect(silent.speak("Hola.", AbortSignal.timeout(5000)))).rejects.toThrow(/sin voz de respaldo/);
  });

  it("transcribes with the next model when one fails, keeping zero data retention", async () => {
    const transcribe = vi.fn(async (options: { model: unknown; providerOptions: unknown }) => {
      expect(options.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
      if (modelIdOf(options) === "mistral/voxtral-small-transcribe-3") throw new Error("down");
      return { text: " ¿Dónde es la charla? " };
    }) as unknown as CascadeCalls["transcribe"];
    await expect(cascade({ transcribe }).transcribe(Buffer.alloc(10), AbortSignal.timeout(5000))).resolves.toBe("¿Dónde es la charla?");
  });
});
