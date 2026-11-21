import { describe, expect, test } from "vitest";

import { clockText, countdownLeft, knobAction, latestNote, phaseOfFace, tail } from "./ops";

describe("the virtual knob", () => {
  test("taps when idle, ends the turn while listening, stops while Owy talks", () => {
    expect(knobAction("owy-knob", "idle", false)).toMatchObject({ label: "Tocar", command: { type: "tap" } });
    expect(knobAction("owy-knob", "listening", false)).toMatchObject({ label: "Listo", command: { type: "tap" } });
    expect(knobAction("owy-knob", "listening", true)).toMatchObject({
      label: "Enviar",
      command: { type: "pitch", deviceId: "owy-knob", action: "submit" },
    });
    expect(knobAction("owy-knob", "speaking", true)).toMatchObject({ label: "Frenar", command: { type: "hush" } });
    expect(knobAction("owy-knob", "thinking", false).command).toStrictEqual({ type: "hush", deviceId: "owy-knob" });
  });

  test("shows the newest words of a long transcript", () => {
    expect(tail("  hola Owy  ", 280)).toBe("hola Owy");
    expect(tail("uno dos tres cuatro", 6)).toBe("…cuatro");
  });

  test("reads the phase off a face", () => {
    expect(phaseOfFace("listening")).toBe("listening");
    expect(phaseOfFace("happy")).toBe("idle");
    expect(phaseOfFace("offline")).toBe("idle");
  });
});

describe("the room", () => {
  test("picks the newest card, whatever the order", () => {
    const notes = [
      { id: "a", createdAt: "2026-11-07T18:00:00.000Z" },
      { id: "c", createdAt: "2026-11-07T18:20:00.000Z" },
      { id: "b", createdAt: "2026-11-07T18:10:00.000Z" },
    ];
    expect(latestNote(notes)?.id).toBe("c");
    expect(latestNote([])).toBeNull();
  });

  test("ticks the countdown from its target, never below zero", () => {
    const now = Date.parse("2026-11-07T18:00:00.000Z");
    const target = new Date(now + 90_000).toISOString();
    expect(countdownLeft({ isRunning: true, remainingSeconds: 0, targetTime: target }, now)).toBe(90);
    expect(countdownLeft({ isRunning: true, remainingSeconds: 0, targetTime: target }, now + 200_000)).toBe(0);
    expect(countdownLeft({ isRunning: false, remainingSeconds: 42 }, now)).toBe(42);
  });

  test("writes the clock", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(725)).toBe("12:05");
    expect(clockText(3750)).toBe("1:02:30");
  });
});
