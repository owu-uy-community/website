import { expect, it } from "vitest";
import { buildSessionConfig } from "../src/index";
import type { RealtimeProvider } from "../src/realtime/models";

const config = (spec: string) => {
  const [, modelId] = spec.split(":");
  const provider = { spec, provider: "gateway", modelId } as unknown as RealtimeProvider;
  return buildSessionConfig({ provider, instructions: "", voice: "v", tools: [], modality: "audio" });
};

it("each realtime vendor gets the turn detection it accepts", () => {
  // The gateway rejects turnDetection for Gemini Live (its own activity detection applies).
  expect(config("gateway:google/gemini-3.8-live").turnDetection).toBeUndefined();
  expect(config("gateway:openai/gpt-realtime-2.1").turnDetection).toStrictEqual({ type: "server-vad", silenceDurationMs: 600 });
  expect(config("gateway:spacexai/grok-voice-3.0").turnDetection).toStrictEqual({ type: "server-vad", silenceDurationMs: 600 });
  // ElevenLabs rejects server_vad: semantic or none.
  expect(config("gateway:elevenlabs/eleven-realtime-v1-max").turnDetection).toStrictEqual({ type: "semantic-vad" });
});
