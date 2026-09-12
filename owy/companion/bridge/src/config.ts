import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Bridge configuration, read once from the environment.
 *
 * The bridge runs on a laptop at the venue, on the same Wi-Fi as the companion
 * device(s). It reuses the agent's own variables for the site API
 * (`OWU_API_URL`, `OWY_API_KEY`, `OWY_EVENT_ID` — see `agent/lib/owu-api.ts`
 * and `agent/lib/board.ts`) and adds the `COMPANION_*` set below.
 */

const boolFromEnv = z
  .string()
  .optional()
  .transform((value) => value !== undefined && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()));

export const DeviceSpecSchema = z.object({
  /** Stable id used in logs, session keys and tool context (`device:<id>`). */
  id: z.string().min(1),
  /** Hostname or IP of the ESPHome device (native API, port 6053). */
  host: z.string().min(1),
  port: z.number().int().positive().default(6053),
  /** Base64 `api.encryption.key` from the firmware; null = plaintext API. */
  psk: z.string().nullable().default(null),
});
export type DeviceSpec = z.infer<typeof DeviceSpecSchema>;

const EnvSchema = z.object({
  // --- Realtime model ---
  COMPANION_REALTIME_MODEL: z.string().default("google:gemini-3.1-flash-live-preview"),
  COMPANION_VOICE: z.string().default("Kore"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),

  // --- Devices ---
  /**
   * JSON array of DeviceSpec, or shorthand `id@host[:port][#psk]` entries separated by commas.
   * `#secrets` as the psk reads `api_key` from companion/firmware/secrets.yaml.
   */
  COMPANION_DEVICES: z.string().default(""),
  COMPANION_WEB_BRIDGE: boolFromEnv,
  COMPANION_WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3312),
  COMPANION_WEB_ORIGINS: z.string().default("http://127.0.0.1:3311,http://localhost:3311"),
  COMPANION_BRIDGE_SECRET: z.string().optional(),
  COMPANION_BRIDGE_PUBLIC_URL: z.string().optional(),

  // --- Site (same names as the agent) ---
  OWU_API_URL: z.string().optional(),
  OWY_API_KEY: z.string().optional(),
  OWY_EVENT_ID: z.string().optional(),
  COMPANION_PUBLIC_SITE_URL: z.string().default("https://owu.uy"),
  COMPANION_SITE_WS_URL: z.string().optional(),

  // --- Behaviour ---
  /** Fallbacks used when the device does not expose the mode switches (text REPL, tests). */
  COMPANION_MARKETPLACE_OPEN: boolFromEnv,
  COMPANION_STAFF_MODE: boolFromEnv,
  /** Seconds a person must wait between two proposals from the same device (staff exempt). */
  COMPANION_PROPOSAL_COOLDOWN_S: z.coerce.number().int().nonnegative().default(60),
  /** Directory for opt-in JSONL transcripts; unset = no transcript persisted. */
  COMPANION_LOG_DIR: z.string().optional(),
  COMPANION_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type BridgeConfig = z.infer<typeof EnvSchema> & { devices: DeviceSpec[] };

/** Parses `id@host[:port][#psk]` (shorthand) or a JSON array of DeviceSpec. */
export function parseDevices(raw: string): DeviceSpec[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.startsWith("[")) {
    return z.array(DeviceSpecSchema).parse(JSON.parse(trimmed));
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const match = /^(?<id>[^@#]+)@(?<host>[^:#]+)(?::(?<port>\d+))?(?:#(?<psk>.+))?$/.exec(entry);
      if (!match?.groups) {
        throw new Error(`COMPANION_DEVICES: entrada inválida "${entry}" (esperado id@host[:port][#psk])`);
      }
      return DeviceSpecSchema.parse({
        id: match.groups.id,
        host: match.groups.host,
        port: match.groups.port ? Number(match.groups.port) : undefined,
        psk: match.groups.psk ?? null,
      });
    });
}

/** Firmware secrets file the `#secrets` psk shorthand reads `api_key` from (never logged). */
export const FIRMWARE_SECRETS_PATH = path.resolve(import.meta.dirname, "../../firmware/secrets.yaml");

/** Resolves the `#secrets` shorthand to the firmware's `api_key`, so the key never has to be typed or exported. */
export function resolveDevicePsk(psk: string | null, secretsPath = FIRMWARE_SECRETS_PATH): string | null {
  if (psk !== "secrets") return psk;
  let text: string;
  try {
    text = readFileSync(secretsPath, "utf8");
  } catch {
    throw new Error(`COMPANION_DEVICES usa #secrets pero no se pudo leer ${secretsPath}`);
  }
  const match = /^\s*api_key:\s*["']?([^"'\n#]+)["']?/m.exec(text);
  if (!match) throw new Error(`No hay api_key en ${secretsPath}`);
  return match[1].trim();
}

/** `owy/.env.local` — the same file `eve dev` reads; existing variables win. */
export const ENV_LOCAL_PATH = path.resolve(import.meta.dirname, "../../../.env.local");

/** Loads `owy/.env.local` into process.env when present (Node ≥ 21 built-in, never overrides). */
export function loadEnvLocal(file = ENV_LOCAL_PATH): boolean {
  try {
    process.loadEnvFile(file);
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  if (env === process.env) loadEnvLocal();
  const parsed = EnvSchema.parse(env);
  const devices = parseDevices(parsed.COMPANION_DEVICES).map((device) => ({
    ...device,
    psk: resolveDevicePsk(device.psk),
  }));
  return { ...parsed, devices };
}
