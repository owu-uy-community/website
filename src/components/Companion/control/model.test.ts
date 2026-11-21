import { describe, expect, test } from "vitest";

import type { CompanionState } from "lib/orpc/companion/schemas";

import type { BridgeStatus, DeviceStatus, SettingRow } from "../../../../owy/companion/bridge/src/web/contract";
import {
  ago,
  deviceIds,
  isOnline,
  macAudioChoices,
  matchFound,
  mergeRows,
  modeView,
  probeText,
  rollbackRows,
  settingGroups,
  settingView,
  turnsView,
  writerText,
} from "./model";

const NOW = Date.parse("2026-11-01T15:00:00.000Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();

const device = (id: string, values: Record<string, unknown>, held: string[] = []): DeviceStatus => ({
  id,
  host: "192.168.1.20",
  connected: true,
  phase: "idle",
  peer: false,
  staff: false,
  voice: { tier: "gateway:google/gemini-3.8-live", realtime: "connected", lastPath: "realtime" },
  turns: [],
  values: values as DeviceStatus["values"],
  held,
});

const status = (patch: Partial<BridgeStatus> = {}): BridgeStatus => ({
  version: "abc1234",
  startedAt: at(3600),
  machine: "owy-mac",
  values: { brain: "eve", voice: "Kore", host_mic: null },
  pending: [],
  rejected: [],
  devices: [device("owy-knob", { brightness: 40, pitch_mode: false, talk: false, privacy: false }, ["talk"])],
  ...patch,
});

const row = (target: string, key: string, value: unknown, setBy = "admin:Agustín"): SettingRow => ({
  target,
  key,
  value: value as SettingRow["value"],
  setBy,
  setAt: at(60),
});

const state = (rows: SettingRow[], bridge: BridgeStatus | null = status()): CompanionState => ({
  rows,
  status: bridge,
  seenAt: bridge ? at(5) : null,
});

describe("the bridge's presence", () => {
  test("is online for 45 s after its last report", () => {
    expect(isOnline(at(44), NOW)).toBe(true);
    expect(isOnline(at(46), NOW)).toBe(false);
    expect(isOnline(null, NOW)).toBe(false);
  });

  test("says how long ago, in the largest unit", () => {
    expect(ago(at(12), NOW)).toBe("hace 12 s");
    expect(ago(at(180), NOW)).toBe("hace 3 min");
    expect(ago(at(7300), NOW)).toBe("hace 2 h");
    expect(ago(at(86_400), NOW)).toBe("hace 1 día");
  });
});

describe("devices", () => {
  test("lists the reported ones, then those with only stored rows", () => {
    const rows = [
      row("owy-companion", "brightness", 30),
      row("bridge", "voice", "Leda"),
      row("owy-knob", "brightness", 50),
    ];
    expect(deviceIds(state(rows))).toStrictEqual(["owy-knob", "owy-companion"]);
  });

  test("matches a board found on the network by name", () => {
    expect(matchFound("owy-knob.local", ["owy-companion", "owy-knob"])).toBe("owy-knob");
    expect(matchFound("Owy-Knob", ["owy-knob"])).toBe("owy-knob");
    expect(matchFound("esp32-abc", ["owy-knob"])).toBeUndefined();
  });
});

describe("rows", () => {
  test("merge by setting and roll back only what a failed write touched", () => {
    const before = [row("owy-knob", "brightness", 40), row("bridge", "voice", "Kore")];
    const optimistic = mergeRows(before, [row("owy-knob", "brightness", 60), row("owy-knob", "reduced_motion", true)]);
    expect(optimistic).toHaveLength(3);
    expect(optimistic.find((r) => r.key === "brightness")?.value).toBe(60);

    // Meanwhile another panel changed the voice: the rollback keeps it.
    const later = mergeRows(optimistic, [row("bridge", "voice", "Leda")]);
    const undone = rollbackRows(later, before, [
      { target: "owy-knob", key: "brightness" },
      { target: "owy-knob", key: "reduced_motion" },
    ]);
    expect(undone.find((r) => r.key === "brightness")?.value).toBe(40);
    expect(undone.find((r) => r.key === "reduced_motion")).toBeUndefined();
    expect(undone.find((r) => r.key === "voice")?.value).toBe("Leda");
  });

  test("name who wrote them", () => {
    expect(writerText("admin:Agustín")).toBe("Agustín");
    expect(writerText("dispositivo")).toBe("en el dispositivo");
    expect(writerText("voz")).toBe("por voz");
    expect(writerText("local")).toBe("en la Mac");
  });
});

describe("where a setting stands", () => {
  const text = (s: CompanionState, target: string, key: Parameters<typeof settingView>[2], online = true) =>
    settingView(s, target, key, online).standing?.text ?? null;

  test("is quiet when the stored value is in effect", () => {
    expect(text(state([row("owy-knob", "brightness", 40)]), "owy-knob", "brightness")).toBeNull();
  });

  test("waits for the bridge, and says until when", () => {
    const s = state([
      row("owy-knob", "brightness", 60),
      row("owy-knob", "mic", "host"),
      row("bridge", "voice", "Leda"),
    ]);
    expect(text(s, "owy-knob", "brightness")).toBe("pendiente");
    expect(text(s, "owy-knob", "mic")).toBe("pendiente · próximo turno");
    expect(text(s, "bridge", "voice")).toBe("pendiente · al reiniciar");
  });

  test("is pending while a restart-scope key waits for a quiet moment, even if reported", () => {
    const s = state([row("bridge", "voice", "Kore")], status({ pending: ["voice"] }));
    expect(text(s, "bridge", "voice")).toBe("pendiente · al reiniciar");
  });

  test("can't be applied with the bridge offline, or a device it doesn't know", () => {
    const s = state([row("owy-knob", "brightness", 60), row("owy-companion", "brightness", 30)]);
    expect(text(s, "owy-knob", "brightness", false)).toBe("sin aplicar · bridge sin conexión");
    expect(text(s, "owy-companion", "brightness")).toBe("sin aplicar · dispositivo sin conexión");
    expect(text(state([row("owy-knob", "brightness", 60)], null), "owy-knob", "brightness", false)).toBe(
      "sin aplicar · bridge sin conexión"
    );
  });

  test("shows the bridge's own value when nothing is stored", () => {
    const view = settingView(state([]), "owy-knob", "brightness", true);
    expect(view.value).toBe(40);
    expect(view.standing?.text).toBe("valor del bridge");
    expect(settingView(state([], null), "owy-knob", "brightness", false).standing?.text).toBe("sin datos");
  });

  test("treats a cleared value and a missing one alike", () => {
    expect(text(state([row("bridge", "host_mic", null)]), "bridge", "host_mic")).toBeNull();
  });

  test("flags keys the board can't hold and rows the bridge refused", () => {
    const s = state(
      [row("owy-knob", "talk", false), row("bridge", "voice", "Nadie")],
      status({ rejected: [{ target: "bridge", key: "voice", error: "voz desconocida" }] })
    );
    expect(text(s, "owy-knob", "talk")).toBe("lo guarda el bridge");
    const refused = settingView(s, "bridge", "voice", true);
    expect(refused.standing).toStrictEqual({ text: "no se aplicó", tone: "warn" });
    expect(refused.title).toMatch(/^Agustín · .*\nEl bridge no lo aplicó: voz desconocida$/);
  });
});

describe("the mode switch", () => {
  test("shows the mode asked for, pending until the bridge applies it", () => {
    const asked = state([row("owy-knob", "pitch_mode", true)]);
    expect(modeView(asked, "owy-knob", true)).toStrictEqual({
      mode: "pitch",
      standing: { text: "pendiente", tone: "pending" },
    });

    const applied = state(
      [row("owy-knob", "pitch_mode", true)],
      status({ devices: [device("owy-knob", { pitch_mode: true, talk: false, privacy: false })] })
    );
    expect(modeView(applied, "owy-knob", true)).toStrictEqual({ mode: "pitch", standing: null });
  });

  test("counts only what a mode writes for a device the bridge doesn't report", () => {
    expect(modeView(state([row("owy-mini", "brightness", 30)]), "owy-mini", true).standing).toBeNull();
    expect(modeView(state([row("owy-mini", "talk", true)]), "owy-mini", true)).toStrictEqual({
      mode: "charla",
      standing: { text: "sin aplicar · dispositivo sin conexión", tone: "warn" },
    });
  });

  test("puts a paused mic first", () => {
    const s = state([row("owy-knob", "pitch_mode", true), row("owy-knob", "privacy", true)]);
    expect(modeView(s, "owy-knob", false).mode).toBe("pausa");
  });
});

describe("groups, turns and the mic test", () => {
  test("orders the bridge's groups with the mode and the Mac first", () => {
    expect(settingGroups("bridge").map((g) => g.group)).toStrictEqual([
      "modo",
      "mac",
      "voz",
      "cerebro",
      "pitch",
      "avanzado",
    ]);
    expect(settingGroups("bridge")[0]?.keys).toStrictEqual(["marketplace_open"]);
    expect(settingGroups("device")[0]).toMatchObject({ group: "modo", label: "Modo" });
    expect(settingGroups("device").flatMap((g) => g.keys)).not.toContain("voice");
  });

  test("lists turns newest first with the time to first audio", () => {
    const turns = turnsView([
      { path: "realtime", ttfaMs: 1240, totalMs: 4000, at: at(120) },
      { path: "cascade", ttfaMs: null, totalMs: 9000, at: at(10) },
    ]);
    expect(turns.map((t) => [t.path, t.firstAudio])).toStrictEqual([
      ["cascada", null],
      ["en vivo", "1,2 s"],
    ]);
  });

  test("reads the level from a probe's data", () => {
    expect(probeText({ peak: 0.31, rms: 0.05 })).toBe("pico 31% · promedio 5%");
    expect(probeText({ peak: 0.01, rms: 0.002 })).toMatch(/casi nada/);
    expect(probeText(null)).toMatch(/no mandó el nivel/);
  });
});

describe(macAudioChoices, () => {
  const status = (hostSpeaker?: Partial<BridgeStatus["hostSpeaker"]>) =>
    ({
      hostMic: {
        name: null,
        channel: "mix",
        health: "open",
        available: ["MacBook Pro Microphone", "Wireless Microphone RX"],
      },
      ...(hostSpeaker ? { hostSpeaker: { name: null, health: "open", available: [], ...hostSpeaker } } : {}),
    }) as unknown as BridgeStatus;

  test("offers the inputs and outputs the bridge found", () => {
    const choices = macAudioChoices(status({ available: ["MacBook Pro Speakers", "External Headphones"] }));
    expect(choices.host_mic).toStrictEqual({
      items: ["MacBook Pro Microphone", "Wireless Microphone RX"],
      none: "el micrófono integrado",
    });
    expect(choices.host_speaker.items).toStrictEqual(["MacBook Pro Speakers", "External Headphones"]);
  });

  test("names where «la salida del sistema» plays, when the bridge knows", () => {
    expect(macAudioChoices(status({ systemDefault: "AirPods Pro" })).host_speaker.none).toBe(
      "la salida del sistema (AirPods Pro)"
    );
    expect(macAudioChoices(status({})).host_speaker.none).toBe("la salida del sistema");
    expect(macAudioChoices(null)).toStrictEqual({
      host_mic: { items: [], none: "el micrófono integrado" },
      host_speaker: { items: [], none: "la salida del sistema" },
    });
  });
});
