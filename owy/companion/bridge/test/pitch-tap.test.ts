import { describe, expect, it } from "vitest";
import { pitchTap } from "../src/device/esphome";

describe("pitchTap", () => {
  it("reads the pulse's rising edge", () => {
    expect(pitchTap({ submit: false, audio: "listening" }, { submit: true, audio: "listening" })).toBe("pulse");
    expect(pitchTap({ submit: true, audio: "listening" }, { submit: true, audio: "listening" })).toBeNull();
  });
  it("reads the face turning to thinking when the pulse went missing", () => {
    expect(pitchTap({ submit: false, audio: "listening" }, { submit: false, audio: "thinking" })).toBe("face");
    expect(pitchTap({ submit: false, audio: "thinking" }, { submit: false, audio: "thinking" })).toBeNull();
  });
  it("prefers the pulse when both arrive together", () => {
    expect(pitchTap({ submit: false, audio: "listening" }, { submit: true, audio: "thinking" })).toBe("pulse");
  });
  it("ignores everything else", () => {
    expect(pitchTap({ submit: false, audio: "idle" }, { submit: false, audio: "listening" })).toBeNull();
    expect(pitchTap({ submit: true, audio: "listening" }, { submit: false, audio: "listening" })).toBeNull();
  });
});
