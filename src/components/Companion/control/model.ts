/**
 * The Control tab's view of the companion, as plain functions: which devices there are, what each
 * setting shows and where it stands (stored, in effect, waiting), and the short texts around them.
 * The components next to this file only render what these return.
 */
import type { CompanionState } from "lib/orpc/companion/schemas";

import type {
  DeviceStatus,
  SettingRow,
  TurnPath,
  TurnSummary,
} from "../../../../owy/companion/bridge/src/web/contract";
import {
  BRIDGE_TARGET,
  MODES,
  modeOf,
  SETTING_GROUPS,
  SETTING_KEYS,
  settingSpec,
  type ModeKey,
  type SettingApply,
  type SettingGroup,
  type SettingKey,
} from "../../../../owy/companion/bridge/src/web/registry";

type Setting = Pick<SettingRow, "target" | "key">;

/** A bridge that hasn't reported for this long is offline (it reports every 15 s). */
export const OFFLINE_AFTER_MS = 45_000;

export const isOnline = (seenAt: string | null | undefined, now: number) =>
  !!seenAt && now - Date.parse(seenAt) < OFFLINE_AFTER_MS;

/** «hace 12 s», «hace 3 min», «hace 2 h», «hace 4 días». */
export function ago(at: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/** Every device: the ones the bridge reports, then any that only has stored rows (shown offline). */
export function deviceIds({ rows, status }: Pick<CompanionState, "rows" | "status">): string[] {
  const ids = new Set(status?.devices.map((device) => device.id));
  for (const row of rows) if (row.target !== BRIDGE_TARGET) ids.add(row.target);
  return [...ids];
}

const same = (a: Setting) => (b: Setting) => a.target === b.target && a.key === b.key;

/** `rows` with each of `incoming` in place of the stored row of its setting. */
export const mergeRows = (rows: SettingRow[], incoming: SettingRow[]): SettingRow[] => [
  ...rows.filter((row) => !incoming.some(same(row))),
  ...incoming,
];

/** Undoes an optimistic write: the settings in `changes` go back to what `before` had (or to no row). */
export const rollbackRows = (rows: SettingRow[], before: SettingRow[], changes: Setting[]): SettingRow[] => [
  ...rows.filter((row) => !changes.some(same(row))),
  ...before.filter((row) => changes.some(same(row))),
];

const WRITERS: Record<string, string> = { dispositivo: "en el dispositivo", voz: "por voz", local: "en la Mac" };

/** Who wrote a row: the admin's name, «en el dispositivo», «por voz» or «en la Mac». */
export const writerText = (setBy: string) =>
  setBy.startsWith("admin:") ? setBy.slice("admin:".length) || "el panel" : (WRITERS[setBy] ?? setBy);

const WHEN = new Intl.DateTimeFormat("es-UY", {
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** «Agustín · 1/11, 14:32». */
export const changedText = (row: SettingRow) => `${writerText(row.setBy)} · ${WHEN.format(new Date(row.setAt))}`;

export type Standing = { text: string; tone: "muted" | "pending" | "warn" };

const APPLY: Record<SettingApply, string | null> = { now: null, turn: "próximo turno", restart: "al reiniciar" };

/**
 * Where a setting stands, in a few words: refused by the bridge, waiting for it (and until when),
 * stuck because nobody can apply it, or not stored here at all (the bridge's own value). Plus
 * «lo guarda el bridge» for a key the board can't hold. Null: stored and in effect.
 */
export function standing(facts: {
  /** The panel stores a value for it. */
  stored: boolean;
  /** The bridge reports what is in effect for this target. */
  known: boolean;
  /** The stored value isn't the one in effect yet. */
  differs: boolean;
  online: boolean;
  apply?: SettingApply;
  held?: boolean;
  rejected?: boolean;
}): Standing | null {
  const parts: string[] = [];
  let tone: Standing["tone"] = "muted";
  if (facts.rejected) {
    parts.push("no se aplicó");
    tone = "warn";
  } else if (facts.stored && (facts.differs || !facts.known)) {
    tone = facts.online && facts.known ? "pending" : "warn";
    if (!facts.online) parts.push("sin aplicar · bridge sin conexión");
    else if (!facts.known) parts.push("sin aplicar · dispositivo sin conexión");
    else parts.push("pendiente", ...(facts.apply && APPLY[facts.apply] ? [APPLY[facts.apply] as string] : []));
  } else if (!facts.stored) parts.push(facts.known ? "valor del bridge" : "sin datos");
  if (facts.held) parts.push("lo guarda el bridge");

  return parts.length ? { text: parts.join(" · "), tone } : null;
}

/** The values in effect for a target, as the bridge last reported them (undefined: unknown). */
export const valuesOf = (status: CompanionState["status"], target: string) =>
  target === BRIDGE_TARGET ? status?.values : status?.devices.find((device) => device.id === target)?.values;

/** Stored and reported values compare as JSON; a missing value is null («sin definir»). */
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type SettingView = {
  key: SettingKey;
  /** What the control shows: the stored value, or the one in effect. */
  value: unknown;
  standing: Standing | null;
  /** Who changed it and when, and why the bridge refused it. */
  title?: string;
};

export function settingView(state: CompanionState, target: string, key: SettingKey, online: boolean): SettingView {
  const row = state.rows.find(same({ target, key }));
  const values = valuesOf(state.status, target);
  const device = state.status?.devices.find((item) => item.id === target);
  const rejected = state.status?.rejected.find(same({ target, key }))?.error;
  // A restart-scope key the bridge took, waiting for a moment without turns.
  const restarting = target === BRIDGE_TARGET && !!state.status?.pending.includes(key);
  const title = [row && changedText(row), rejected && `El bridge no lo aplicó: ${rejected}`].filter(Boolean).join("\n");

  return {
    key,
    value: row ? row.value : values?.[key],
    standing: standing({
      stored: !!row,
      known: values !== undefined,
      differs: !!row && (restarting || !sameValue(row.value, values?.[key])),
      online,
      apply: settingSpec(key).apply,
      held: device?.held.includes(key),
      rejected: rejected !== undefined,
    }),
    title: title || undefined,
  };
}

/** The settings a mode writes. */
const MODE_KEYS = new Set(Object.values(MODES).flatMap((mode) => Object.keys(mode.values)));

/**
 * A device's mode: the one its stored values ask for (over the values in effect), and whether it
 * is in effect yet.
 */
export function modeView(state: CompanionState, target: string, online: boolean) {
  const values = valuesOf(state.status, target);
  const stored = state.rows.filter((row) => row.target === target && MODE_KEYS.has(row.key));
  const mode: ModeKey = modeOf({ ...values, ...Object.fromEntries(stored.map((row) => [row.key, row.value])) });
  const differs = values !== undefined && modeOf(values) !== mode;
  const known = values !== undefined;

  return {
    mode,
    standing: differs || (!known && stored.length > 0) ? standing({ stored: true, known, differs, online }) : null,
  };
}

/** The setting groups of a scope, in order: a device's as the registry lists them; the bridge's mode and Mac first. */
export function settingGroups(scope: "bridge" | "device") {
  const order: SettingGroup[] =
    scope === "bridge"
      ? ["modo", "mac", "voz", "cerebro", "pitch", "avanzado"]
      : (Object.keys(SETTING_GROUPS) as SettingGroup[]);

  return order.flatMap((group) => {
    const keys = SETTING_KEYS.filter((key) => settingSpec(key).scope === scope && settingSpec(key).group === group);
    return keys.length > 0 ? [{ group, label: SETTING_GROUPS[group], keys }] : [];
  });
}

const PATHS: Record<TurnPath, string> = {
  realtime: "en vivo",
  fallback: "respaldo",
  cascade: "cascada",
  offline: "sin conexión",
  pitch: "pitch",
};

/** A device's last turns, newest first: how it was answered and how long until Owy's first sound (null: none). */
export const turnsView = (turns: TurnSummary[]) =>
  [...turns]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((turn) => ({
      at: turn.at,
      path: PATHS[turn.path] ?? turn.path,
      firstAudio:
        turn.ttfaMs === null
          ? null
          : `${(turn.ttfaMs / 1000).toLocaleString("es-UY", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`,
    }));

/** The device a board found on the network is, by name (`owy-knob.local` is `owy-knob`). */
export function matchFound(name: string, ids: string[]): string | undefined {
  const bare = name.trim().toLowerCase().split(".")[0];
  return ids.find((id) => id.toLowerCase() === bare);
}

/**
 * The Mac's input and output as pickers: the devices the bridge found, and what «nothing chosen»
 * means right now (the built-in mic; for the output, wherever macOS plays — a Bluetooth speaker
 * can only be reached that way, since ffmpeg gives it no name).
 */
export function macAudioChoices(status: CompanionState["status"]) {
  const system = status?.hostSpeaker?.systemDefault;

  return {
    host_mic: { items: status?.hostMic?.available ?? [], none: "el micrófono integrado" },
    host_speaker: {
      items: status?.hostSpeaker?.available ?? [],
      none: system ? `la salida del sistema (${system})` : "la salida del sistema",
    },
  };
}

/** The Mac's mic test, from the result's data: the loudest 20 ms and the average, 0..1. */
export function probeText(data: unknown): string {
  const { peak, rms } = (data ?? {}) as { peak?: unknown; rms?: unknown };
  if (typeof peak !== "number" || typeof rms !== "number") return "Listo, pero el bridge no mandó el nivel.";
  const level = (value: number) => `${Math.round(value * 100)}%`;

  return `pico ${level(peak)} · promedio ${level(rms)}${
    peak < 0.02 ? " — casi nada: ¿es esta entrada? ¿el transmisor está prendido?" : ""
  }`;
}

const PHASES: Record<DeviceStatus["phase"], string> = {
  idle: "libre",
  listening: "escuchando",
  thinking: "pensando",
  speaking: "hablando",
};

/** Where a device's turn is, in a word. */
export const phaseText = (phase: DeviceStatus["phase"]) => PHASES[phase] ?? phase;

const FACES: Record<string, string> = {
  idle: "tranquilo",
  listening: "escuchando",
  thinking: "pensando",
  speaking: "hablando",
  happy: "contento",
  error: "error",
  offline: "sin bridge",
};

/** The face the board shows, in a word (`select.face_state`). */
export const faceText = (face: string) => FACES[face] ?? face;

/** A realtime tier as the panel names it: `gateway:google/gemini-3.8-live` → `google/gemini-3.8-live`. */
export const tierText = (tier: string | null | undefined) => tier?.replace(/^gateway:/, "") ?? null;
