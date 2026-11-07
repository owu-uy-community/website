import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config";
import {
  BRIDGE_KEYS,
  checkSetting,
  DEVICE_KEYS,
  MODES,
  modeOf,
  settingSpec,
  VOICE_KEYS,
  voiceMay,
  voiceValue,
  type SettingKey,
} from "../src/web/registry";

const packages = path.resolve(import.meta.dirname, "../../firmware/packages");

/** ESPHome derives an entity's object id from its name: lower case, spaces to underscores. */
const objectId = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Every `domain.object_id` the firmware declares, with a select's option labels. */
function firmwareEntities(): Map<string, string[]> {
  const entities = new Map<string, string[]>();
  const files = readdirSync(packages, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".yaml"));
  for (const file of files) {
    let domain = "";
    let current: string[] | null = null;
    let inOptions = false;
    for (const line of readFileSync(path.join(packages, file), "utf8").split("\n")) {
      const top = /^([a-z_]+):\s*$/.exec(line);
      if (top) {
        domain = top[1];
        current = null;
        continue;
      }
      const name = /^\s{4}name:\s*"?([^"#]+?)"?\s*$/.exec(line);
      if (name && ["switch", "select", "number"].includes(domain)) {
        current = [];
        entities.set(`${domain}.${objectId(name[1])}`, current);
        inOptions = false;
        continue;
      }
      if (/^\s{4}options:\s*$/.test(line)) {
        inOptions = true;
        continue;
      }
      const option = /^\s{6}-\s*"?(.+?)"?\s*$/.exec(line);
      if (inOptions && option && current) current.push(option[1]);
      else if (!/^\s{6}/.test(line)) inOptions = false;
    }
  }
  return entities;
}

describe("settings registry", () => {
  const entities = firmwareEntities();

  it("names every device entity the way the firmware does", () => {
    for (const key of DEVICE_KEYS) {
      const spec = settingSpec(key);
      if (spec.scope !== "device" || !spec.entity) continue;
      expect(entities.has(spec.entity), `${key} → ${spec.entity}`).toBe(true);
    }
  });

  it("maps every enum value to an option the board has", () => {
    // The board's option labels are the contract (the bridge writes them as-is).
    for (const key of DEVICE_KEYS) {
      const spec = settingSpec(key);
      if (spec.scope !== "device" || !spec.entity || spec.type !== "enum") continue;
      const options = entities.get(spec.entity) ?? [];
      for (const [value, label] of spec.options) {
        const onBoard = spec.board?.[value] ?? label;
        expect(options, `${key}=${value} → ${onBoard}`).toContain(onBoard);
      }
    }
  });

  it("overrides only env vars the bridge reads, and their defaults are valid values", () => {
    const shape = EnvSchema.shape as Record<string, unknown>;
    const defaults = EnvSchema.parse({}) as Record<string, unknown>;
    for (const key of [...BRIDGE_KEYS, ...DEVICE_KEYS]) {
      const spec = settingSpec(key);
      const env = "env" in spec ? spec.env : undefined;
      if (!env) continue;
      expect(shape[env], `${key} → ${env}`).toBeDefined();
      const value = defaults[env];
      if (value === undefined) continue;
      expect(checkSetting(key, value), `${key} default ${String(value)}`).toMatchObject({ ok: true });
    }
  });

  it("lets the voice change comfort settings, staff the rest, and never turn privacy off", () => {
    expect(voiceMay("brightness", 40, false)).toEqual({ ok: true });
    expect(voiceMay("pitch_mode", true, false)).toMatchObject({ ok: false });
    expect(voiceMay("pitch_mode", true, true)).toEqual({ ok: true });
    expect(voiceMay("privacy", true, false)).toEqual({ ok: true });
    expect(voiceMay("privacy", false, true)).toMatchObject({ ok: false });
    expect(VOICE_KEYS).not.toContain("host");
    for (const key of ["brightness", "reduced_motion", "privacy"] as SettingKey[]) expect(settingSpec(key).voice).toBe("public");
  });

  it("reads what a voice asks for", () => {
    expect(voiceValue("brightness", undefined, 15, 40)).toEqual({ ok: true, value: 55 });
    expect(voiceValue("brightness", undefined, 50, 70)).toEqual({ ok: true, value: 100 });
    expect(voiceValue("brightness", "33", undefined, 0)).toEqual({ ok: true, value: 35 });
    expect(voiceValue("brightness", undefined, undefined, 40)).toMatchObject({ ok: false });
    expect(voiceValue("reduced_motion", "apagalo", undefined, true)).toEqual({ ok: true, value: false });
    expect(voiceValue("pitch_voice", "confirma y comenta", undefined, null)).toEqual({ ok: true, value: "react" });
    expect(voiceValue("mic", "mac", undefined, null)).toEqual({ ok: true, value: "host" });
    expect(voiceValue("mic", "teléfono", undefined, null)).toMatchObject({ ok: false });
  });

  it("keeps the knob's own settings on the board and everything else in the bridge", () => {
    // The board holds pausa, brillo and animaciones; modes and routing have no entity: the bridge keeps them.
    expect(DEVICE_KEYS.filter((key) => "entity" in settingSpec(key)).sort()).toEqual(["brightness", "privacy", "reduced_motion"]);
    expect(settingSpec("marketplace_open").scope).toBe("bridge");
    expect(MODES.charla.values).not.toHaveProperty("mic");
  });

  it("names one mode per device from its values", () => {
    for (const [mode, { values }] of Object.entries(MODES)) expect(modeOf(values)).toBe(mode);
    expect(modeOf({ privacy: true, pitch_mode: true })).toBe("pausa");
    expect(modeOf({})).toBe("conversacion");
  });
});
