/**
 * Every setting of the companion, in one place. The site stores and edits them
 * (/admin/companion → Control), the bridge applies them (devices through their
 * ESPHome entities, the rest in its own runtime), and Owy reads and changes the
 * ones its voice may touch (tool `ajustes`). Env vars stay as the defaults.
 *
 * zod only, like ./contract: the site imports this file.
 */
import { z } from "zod";
import { GEMINI_VOICES, MODELS } from "../../../../agent/lib/models";

/** When a change takes effect: right away, from the next turn, or when the bridge restarts (it waits for a quiet moment). */
export type SettingApply = "now" | "turn" | "restart";
/** Who may change it by voice: anyone talking to Owy, or staff only. Absent: nobody (the panel only). */
export type SettingVoice = "public" | "staff";
export type SettingGroup = "modo" | "audio" | "mac" | "sonido" | "pantalla" | "conversacion" | "pitch" | "voz" | "cerebro" | "avanzado";

export const SETTING_GROUPS: Record<SettingGroup, string> = {
  modo: "Modo",
  audio: "Audio",
  mac: "La Mac",
  sonido: "Sonido",
  pantalla: "Pantalla y movimiento",
  conversacion: "Conversación",
  pitch: "Modo pitch",
  voz: "Voz y modelos",
  cerebro: "Cerebro",
  avanzado: "Avanzado",
};

type Option = readonly [value: string, label: string];
type Kind =
  | { type: "boolean" }
  | { type: "number"; min: number; max: number; step: number; unit?: string }
  | { type: "enum"; options: readonly Option[] }
  | { type: "text"; max: number; nullable?: boolean };

type Common = {
  label: string;
  group: SettingGroup;
  apply: SettingApply;
  voice?: SettingVoice;
  /** The only values the voice may set (privacy: on, never off). */
  voiceValues?: readonly unknown[];
  hint?: string;
};

type Scope =
  | {
      scope: "device";
      /** ESPHome `domain.object_id`; the object id comes from the entity's *name*. Absent: the bridge holds it. */
      entity?: string;
      /** The board's option label for each value, when they differ. */
      board?: Readonly<Record<string, string>>;
      /** Env var with the bridge-wide default (boards without the entity, the web lab). */
      env?: string;
    }
  | { scope: "bridge"; env: string };

export type SettingSpec = Common & Scope & Kind;

const ON_OFF: readonly Option[] = [
  ["on", "sí"],
  ["off", "no"],
];
const ROUTES: readonly Option[] = [
  ["device", "Owy"],
  ["host", "Mac"],
  ["laptop", "Navegador"],
];
const ROUTES_ON_BOARD = { device: "dispositivo", host: "mac", laptop: "laptop" } as const;
const spec = (value: string) => value.replace(/#.*$/, "");
const REALTIME_MODELS: readonly Option[] = [
  [MODELS.realtime, "Gemini 3.8 Live"],
  [spec(MODELS.realtimeFallbacks[0]), "GPT Realtime 2"],
  [spec(MODELS.realtimeFallbacks[1]), "Grok Voice 3"],
];

export const SETTINGS = {
  // ── Modo (per device) ──────────────────────────────────────────────────
  pitch_mode: {
    scope: "device",
    entity: "switch.pitch_mode",
    env: "COMPANION_PITCH_MODE",
    type: "boolean",
    label: "Modo pitch",
    group: "modo",
    apply: "turn",
    voice: "staff",
    hint: "Cada toque graba una propuesta de charla para la grilla.",
  },
  talk: {
    scope: "device",
    type: "boolean",
    label: "Modo charla",
    group: "modo",
    apply: "turn",
    voice: "staff",
    hint: "Owy co-presenta: la consola de la charla lo maneja.",
  },
  privacy: {
    scope: "device",
    entity: "switch.microphone_privacy",
    type: "boolean",
    label: "Micrófono en pausa",
    group: "modo",
    apply: "now",
    voice: "public",
    voiceValues: [true],
    hint: "Por voz sólo se puede pausar; para volver a escuchar, la pantalla o el panel.",
  },
  marketplace_open: {
    scope: "device",
    entity: "switch.marketplace_open",
    env: "COMPANION_MARKETPLACE_OPEN",
    type: "boolean",
    label: "Mercado abierto",
    group: "modo",
    apply: "now",
    voice: "staff",
    hint: "El público puede proponer charlas hablando con Owy.",
  },

  // ── Audio (per device) ─────────────────────────────────────────────────
  mic: {
    scope: "device",
    entity: "select.mic_source",
    board: ROUTES_ON_BOARD,
    env: "COMPANION_MIC_SOURCE",
    type: "enum",
    options: ROUTES,
    label: "Micrófono",
    group: "audio",
    apply: "turn",
    voice: "staff",
  },
  output: {
    scope: "device",
    entity: "select.audio_output",
    board: ROUTES_ON_BOARD,
    env: "COMPANION_AUDIO_OUTPUT",
    type: "enum",
    options: ROUTES,
    label: "Salida",
    group: "audio",
    apply: "turn",
    voice: "staff",
  },
  volume: {
    scope: "device",
    entity: "number.volumen",
    type: "number",
    min: 0,
    max: 80,
    step: 5,
    unit: "%",
    label: "Volumen",
    group: "sonido",
    apply: "now",
    voice: "public",
    hint: "El amplificador satura arriba de 80.",
  },
  quiet_mode: {
    scope: "device",
    entity: "switch.quiet_mode",
    type: "boolean",
    label: "Modo silencioso",
    group: "sonido",
    apply: "now",
    voice: "public",
    hint: "Sin anuncios ni tono de escucha.",
  },
  listening_chime: {
    scope: "device",
    entity: "switch.listening_chime",
    type: "boolean",
    label: "Tono de escucha",
    group: "sonido",
    apply: "now",
    voice: "public",
  },
  interaction_sounds: {
    scope: "device",
    entity: "switch.interaction_sounds",
    type: "boolean",
    label: "Sonidos al tocarlo",
    group: "sonido",
    apply: "now",
    voice: "staff",
  },

  // ── Conversación (per device) ──────────────────────────────────────────
  continuous_conversation: {
    scope: "device",
    entity: "switch.continuous_conversation",
    type: "boolean",
    label: "Charla continua",
    group: "conversacion",
    apply: "now",
    voice: "public",
    hint: "Después de cada respuesta vuelve a escuchar.",
  },
  wake_word: {
    scope: "device",
    entity: "switch.wake_word",
    type: "boolean",
    label: "Palabra de activación",
    group: "conversacion",
    apply: "now",
    voice: "staff",
  },

  // ── Pantalla y movimiento (per device) ─────────────────────────────────
  brightness: {
    scope: "device",
    entity: "number.screen_brightness",
    type: "number",
    min: 10,
    max: 100,
    step: 5,
    unit: "%",
    label: "Brillo",
    group: "pantalla",
    apply: "now",
    voice: "public",
  },
  reduced_motion: {
    scope: "device",
    entity: "switch.reduced_motion",
    type: "boolean",
    label: "Animaciones mínimas",
    group: "pantalla",
    apply: "now",
    voice: "public",
  },
  motion_face: {
    scope: "device",
    entity: "switch.motion_face",
    type: "boolean",
    label: "Seguir el movimiento",
    group: "pantalla",
    apply: "now",
    voice: "staff",
  },
  motion_reverse_x: {
    scope: "device",
    entity: "switch.motion_reverse_x",
    type: "boolean",
    label: "Invertir horizontal",
    group: "pantalla",
    apply: "now",
    voice: "staff",
  },
  motion_reverse_y: {
    scope: "device",
    entity: "switch.motion_reverse_y",
    type: "boolean",
    label: "Invertir vertical",
    group: "pantalla",
    apply: "now",
    voice: "staff",
  },

  // ── Modo pitch (per device + the bridge's knobs) ───────────────────────
  pitch_voice: {
    scope: "device",
    entity: "select.pitch_voice",
    env: "COMPANION_PITCH_VOICE",
    type: "enum",
    options: [
      ["silent", "Callado"],
      ["confirm", "Confirma"],
      ["react", "Confirma y comenta"],
    ],
    label: "Owy responde",
    group: "pitch",
    apply: "turn",
    voice: "staff",
  },
  pitch_silence_s: {
    scope: "bridge",
    env: "COMPANION_PITCH_SILENCE_S",
    type: "number",
    min: 3,
    max: 60,
    step: 1,
    unit: "s",
    label: "Silencio que termina un pitch",
    group: "pitch",
    apply: "turn",
    voice: "staff",
  },
  pitch_max_s: {
    scope: "bridge",
    env: "COMPANION_PITCH_MAX_S",
    type: "number",
    min: 20,
    max: 150,
    step: 5,
    unit: "s",
    label: "Pitch más largo",
    group: "pitch",
    apply: "turn",
    voice: "staff",
  },
  pitch_vad_rms: {
    scope: "bridge",
    env: "COMPANION_PITCH_VAD_RMS",
    type: "number",
    min: 0.001,
    max: 0.2,
    step: 0.001,
    label: "Umbral de voz",
    group: "pitch",
    apply: "turn",
    voice: "staff",
    hint: "Cuánto tiene que sonar un cuadro de 20 ms para contar como voz (pitch y turnos grabados).",
  },
  pitch_dedupe: {
    scope: "bridge",
    env: "COMPANION_PITCH_DEDUPE",
    type: "enum",
    options: ON_OFF,
    label: "Detectar pitches repetidos",
    group: "pitch",
    apply: "turn",
    voice: "staff",
  },
  pitch_event_id: {
    scope: "bridge",
    env: "COMPANION_PITCH_EVENT_ID",
    type: "text",
    max: 120,
    nullable: true,
    label: "Evento de la grilla",
    group: "pitch",
    apply: "restart",
    voice: "staff",
    hint: "Id o slug; vacío = el evento del bot.",
  },
  pitch_thinking: {
    scope: "bridge",
    env: "COMPANION_PITCH_THINKING",
    type: "enum",
    options: [
      ["low", "poco (3–4 s)"],
      ["medium", "medio"],
      ["high", "mucho"],
    ],
    label: "Cuánto piensa el pitch",
    group: "pitch",
    apply: "restart",
    voice: "staff",
  },

  // ── La Mac (the bridge's own audio) ────────────────────────────────────
  host_mic: {
    scope: "bridge",
    env: "COMPANION_HOST_MIC",
    type: "text",
    max: 120,
    nullable: true,
    label: "Entrada de la Mac",
    group: "mac",
    apply: "now",
    voice: "staff",
    hint: "Nombre o parte («Wireless Microphone RX»); vacío = el micrófono integrado.",
  },
  host_mic_channel: {
    scope: "bridge",
    env: "COMPANION_HOST_MIC_CHANNEL",
    type: "enum",
    options: [
      ["mix", "mezcla"],
      ["L", "izquierdo"],
      ["R", "derecho"],
    ],
    label: "Canal de la entrada",
    group: "mac",
    apply: "now",
    voice: "staff",
  },
  host_mic_gain_db: {
    scope: "bridge",
    env: "COMPANION_HOST_MIC_GAIN_DB",
    type: "number",
    min: -12,
    max: 30,
    step: 1,
    unit: "dB",
    label: "Ganancia de la entrada",
    group: "mac",
    apply: "now",
    voice: "staff",
  },
  host_speaker: {
    scope: "bridge",
    env: "COMPANION_HOST_SPEAKER",
    type: "text",
    max: 120,
    nullable: true,
    label: "Salida de la Mac",
    group: "mac",
    apply: "now",
    voice: "staff",
    hint: "Nombre o parte; vacío = la salida del sistema.",
  },
  host_speaker_latency_ms: {
    scope: "bridge",
    env: "COMPANION_HOST_SPEAKER_LATENCY_MS",
    type: "number",
    min: 0,
    max: 1000,
    step: 10,
    unit: "ms",
    label: "Demora de la salida",
    group: "mac",
    apply: "turn",
    voice: "staff",
    hint: "Para que la boca coincida con lo que suena en la sala.",
  },
  host_speaker_tail_ms: {
    scope: "bridge",
    env: "COMPANION_HOST_SPEAKER_TAIL_MS",
    type: "number",
    min: 0,
    max: 2000,
    step: 50,
    unit: "ms",
    label: "Eco de la sala",
    group: "mac",
    apply: "turn",
    voice: "staff",
    hint: "Cuánto después de hablar sigue sin escuchar el mic de la Mac.",
  },

  // ── Voz y modelos (the bridge) ─────────────────────────────────────────
  realtime_model: {
    scope: "bridge",
    env: "COMPANION_REALTIME_MODEL",
    type: "enum",
    options: REALTIME_MODELS,
    label: "Modelo de voz",
    group: "voz",
    apply: "restart",
    voice: "staff",
  },
  voice: {
    scope: "bridge",
    env: "COMPANION_VOICE",
    type: "enum",
    options: GEMINI_VOICES.map((name) => [name, name] as const),
    label: "Voz de Owy",
    group: "voz",
    apply: "restart",
    voice: "staff",
  },
  realtime_fallbacks: {
    scope: "bridge",
    env: "COMPANION_REALTIME_FALLBACKS",
    type: "text",
    max: 400,
    label: "Respaldos de voz",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
    hint: "Specs separados por coma; `#voz` elige la voz de cada uno.",
  },
  cascade: {
    scope: "bridge",
    env: "COMPANION_CASCADE",
    type: "enum",
    options: ON_OFF,
    label: "Responder sin modelo de voz",
    group: "voz",
    apply: "turn",
    voice: "staff",
    hint: "Si la voz en vivo no contesta: transcribir, pensar y decirlo igual.",
  },
  expressions: {
    scope: "bridge",
    env: "COMPANION_EXPRESSIONS",
    type: "enum",
    options: [
      ["jev", "jev"],
      ["guess", "locales"],
      ["off", "apagadas"],
    ],
    label: "Caras mientras habla",
    group: "voz",
    apply: "turn",
    voice: "staff",
  },
  transcribe_models: {
    scope: "bridge",
    env: "COMPANION_TRANSCRIBE_MODELS",
    type: "text",
    max: 400,
    label: "Transcripción (respaldo)",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  tts_models: {
    scope: "bridge",
    env: "COMPANION_TTS_MODELS",
    type: "text",
    max: 400,
    label: "Voz hablada (respaldo)",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  text_model: {
    scope: "bridge",
    env: "COMPANION_TEXT_MODEL",
    type: "text",
    max: 120,
    label: "Modelo de texto (respaldo)",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  text_fallback_models: {
    scope: "bridge",
    env: "COMPANION_TEXT_FALLBACK_MODELS",
    type: "text",
    max: 400,
    label: "Respaldos del modelo de texto",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  expression_model: {
    scope: "bridge",
    env: "COMPANION_EXPRESSION_MODEL",
    type: "text",
    max: 120,
    label: "Modelo de las caras",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  pitch_model: {
    scope: "bridge",
    env: "COMPANION_PITCH_MODEL",
    type: "text",
    max: 120,
    label: "Modelo del pitch",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  pitch_fallback_models: {
    scope: "bridge",
    env: "COMPANION_PITCH_FALLBACK_MODELS",
    type: "text",
    max: 400,
    label: "Respaldos del pitch",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  pitch_hedge_model: {
    scope: "bridge",
    env: "COMPANION_PITCH_HEDGE_MODEL",
    type: "text",
    max: 120,
    label: "Modelo rápido del pitch",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  pitch_hedge_ms: {
    scope: "bridge",
    env: "COMPANION_PITCH_HEDGE_MS",
    type: "number",
    min: 500,
    max: 20_000,
    step: 500,
    unit: "ms",
    label: "Cuándo pedirle al modelo rápido",
    group: "avanzado",
    apply: "turn",
    voice: "staff",
  },

  // ── Cerebro (the bridge) ───────────────────────────────────────────────
  brain: {
    scope: "bridge",
    env: "COMPANION_BRAIN",
    type: "enum",
    options: [
      ["eve", "eve (el Owy de Slack y Telegram)"],
      ["local", "local (el bridge)"],
    ],
    label: "Cerebro",
    group: "cerebro",
    apply: "restart",
    voice: "staff",
  },
  eve_idle_reset_s: {
    scope: "bridge",
    env: "COMPANION_EVE_IDLE_RESET_S",
    type: "number",
    min: 10,
    max: 3600,
    step: 10,
    unit: "s",
    label: "Olvida la charla tras",
    group: "cerebro",
    apply: "turn",
    voice: "staff",
  },
  event_name: {
    scope: "bridge",
    env: "COMPANION_EVENT_NAME",
    type: "text",
    max: 80,
    label: "Dónde está Owy",
    group: "cerebro",
    apply: "restart",
    voice: "staff",
  },
  proposal_cooldown_s: {
    scope: "bridge",
    env: "COMPANION_PROPOSAL_COOLDOWN_S",
    type: "number",
    min: 0,
    max: 3600,
    step: 10,
    unit: "s",
    label: "Espera entre propuestas",
    group: "cerebro",
    apply: "turn",
    voice: "staff",
  },

  // ── Avanzado (the bridge's timings) ────────────────────────────────────
  ack_ms: {
    scope: "bridge",
    env: "COMPANION_ACK_MS",
    type: "number",
    min: 500,
    max: 20_000,
    step: 100,
    unit: "ms",
    label: "Silencio que pasa al respaldo",
    group: "avanzado",
    apply: "turn",
    voice: "staff",
  },
  pacer_lead_ms: {
    scope: "bridge",
    env: "COMPANION_PACER_LEAD_MS",
    type: "number",
    min: 20,
    max: 1000,
    step: 10,
    unit: "ms",
    label: "Audio por adelantado",
    group: "avanzado",
    apply: "turn",
    voice: "staff",
  },
  mouth_latency_ms: {
    scope: "bridge",
    env: "COMPANION_MOUTH_LATENCY_MS",
    type: "number",
    min: 0,
    max: 2000,
    step: 10,
    unit: "ms",
    label: "Demora del navegador",
    group: "avanzado",
    apply: "turn",
    voice: "staff",
  },
  token_timeout_ms: {
    scope: "bridge",
    env: "COMPANION_TOKEN_TIMEOUT_MS",
    type: "number",
    min: 1000,
    max: 60_000,
    step: 500,
    unit: "ms",
    label: "Espera del token de voz",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },
  realtime_connect_ms: {
    scope: "bridge",
    env: "COMPANION_REALTIME_CONNECT_MS",
    type: "number",
    min: 2000,
    max: 60_000,
    step: 500,
    unit: "ms",
    label: "Espera de la conexión de voz",
    group: "avanzado",
    apply: "restart",
    voice: "staff",
  },

  // ── Plumbing the panel may fix without touching the Mac ────────────────
  host: {
    scope: "device",
    type: "text",
    max: 120,
    nullable: true,
    label: "Dirección en la red",
    group: "avanzado",
    apply: "restart",
    hint: "IP del dispositivo; vacío = la de COMPANION_DEVICES. Las claves quedan en secrets.yaml.",
  },
} as const satisfies Record<string, SettingSpec>;

export type SettingKey = keyof typeof SETTINGS;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const DEVICE_KEYS = SETTING_KEYS.filter((key) => SETTINGS[key].scope === "device");
export const BRIDGE_KEYS = SETTING_KEYS.filter((key) => SETTINGS[key].scope === "bridge");
/** Keys the voice tool may name at all (privacy included: it may only turn it on). */
export const VOICE_KEYS = SETTING_KEYS.filter((key) => "voice" in SETTINGS[key]);

/** The target of a bridge-wide setting; a device's are its id. */
export const BRIDGE_TARGET = "bridge";

export const isSettingKey = (key: string): key is SettingKey => Object.hasOwn(SETTINGS, key);
export const settingSpec = (key: SettingKey): SettingSpec => SETTINGS[key];

/** The zod schema a stored value of `key` must pass. */
export function settingSchema(key: SettingKey): z.ZodType<unknown> {
  const setting = settingSpec(key);
  switch (setting.type) {
    case "boolean":
      return z.boolean();
    case "number":
      return z.number().min(setting.min).max(setting.max);
    case "enum":
      return z.enum(setting.options.map(([value]) => value) as [string, ...string[]]);
    case "text":
      return setting.nullable
        ? z.string().trim().max(setting.max).nullable().transform((value) => (value ? value : null))
        : z.string().trim().min(1).max(setting.max);
  }
}

export type SettingCheck = { ok: true; value: unknown } | { ok: false; error: string };

/** Validates a value for `key` (as stored, sent by the panel, or reported by the bridge). */
export function checkSetting(key: string, value: unknown): SettingCheck {
  if (!isSettingKey(key)) return { ok: false, error: `no existe el ajuste «${key}»` };
  const parsed = settingSchema(key).safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: `${settingSpec(key).label}: ${parsed.error.issues[0]?.message ?? "valor inválido"}` };
}

/** The scope a target implies: "bridge" or any device id. */
export const targetScope = (target: string) => (target === BRIDGE_TARGET ? "bridge" : "device");

/** A value in words, as Owy (or the panel) says it. */
export function describeValue(key: SettingKey, value: unknown): string {
  const setting = settingSpec(key);
  if (value === null || value === undefined) return "sin definir";
  switch (setting.type) {
    case "boolean":
      return value ? "sí" : "no";
    case "number":
      return `${value}${setting.unit ? ` ${setting.unit}` : ""}`;
    case "enum":
      return setting.options.find(([option]) => option === value)?.[1] ?? String(value);
    case "text":
      return String(value);
  }
}

/**
 * Reads what a voice asked for into a value of `key`: «sí»/«apagá» for switches, a number or
 * a step (`delta`) clamped to the range, an option by value or by label. Returns an error in
 * words Owy can say back.
 */
export function voiceValue(key: SettingKey, raw: string | undefined, delta: number | undefined, current: unknown): SettingCheck {
  const setting = settingSpec(key);
  const text = (raw ?? "").trim().toLowerCase();
  switch (setting.type) {
    case "boolean": {
      if (/^(true|1|s[ií]|on|prend|encend|activ|abr)/.test(text)) return { ok: true, value: true };
      if (/^(false|0|no|off|apag|desactiv|cerr)/.test(text)) return { ok: true, value: false };
      return { ok: false, error: `${setting.label}: decime sí o no` };
    }
    case "number": {
      if (delta === undefined && !text) return { ok: false, error: `${setting.label}: necesito un número` };
      const base = typeof current === "number" ? current : setting.min;
      const asked = delta !== undefined ? base + delta : Number(text.replace(",", "."));
      if (!Number.isFinite(asked)) return { ok: false, error: `${setting.label}: necesito un número` };
      const stepped = Math.round(asked / setting.step) * setting.step;
      return { ok: true, value: Number(Math.min(setting.max, Math.max(setting.min, stepped)).toFixed(6)) };
    }
    case "enum": {
      const match = setting.options.find(
        ([value, label]) => value.toLowerCase() === text || label.toLowerCase() === text || label.toLowerCase().startsWith(text)
      );
      return match && text
        ? { ok: true, value: match[0] }
        : { ok: false, error: `${setting.label}: las opciones son ${setting.options.map(([, label]) => label).join(", ")}` };
    }
    case "text":
      return checkSetting(key, raw ?? null);
  }
}

/** Whether the voice may set `key` to `value`: public keys for anyone, staff keys in a staff session. */
export function voiceMay(key: SettingKey, value: unknown, staff: boolean): { ok: true } | { ok: false; error: string } {
  const setting = settingSpec(key);
  if (!setting.voice) return { ok: false, error: "eso se cambia desde el panel" };
  if (setting.voiceValues && !setting.voiceValues.includes(value))
    return { ok: false, error: "eso no lo puedo cambiar por voz: se hace en la pantalla o en el panel" };
  if (setting.voice === "staff" && !staff) return { ok: false, error: "eso lo cambia el staff" };
  return { ok: true };
}

/** One switch per device for how Owy behaves; each writes these values in one go. */
export const MODES = {
  conversacion: { label: "Conversación", values: { pitch_mode: false, talk: false, privacy: false } },
  pitch: { label: "Pitch", values: { pitch_mode: true, talk: false, privacy: false } },
  charla: { label: "Charla", values: { talk: true, pitch_mode: false, privacy: false, mic: "host", output: "host" } },
  pausa: { label: "Pausa", values: { privacy: true } },
} as const satisfies Record<string, { label: string; values: Partial<Record<SettingKey, unknown>> }>;
export type ModeKey = keyof typeof MODES;

/** The mode a device is in, from its values: a paused mic wins, then the talk, then modo pitch. */
export function modeOf(values: Partial<Record<SettingKey, unknown>>): ModeKey {
  if (values.privacy === true) return "pausa";
  if (values.talk === true) return "charla";
  if (values.pitch_mode === true) return "pitch";
  return "conversacion";
}
