/**
 * Minimal leveled logger with a prefix, shaped like esphome-client's
 * `EspHomeLogging` so one instance can be handed to the device client too.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, ...parameters: unknown[]): void;
  info(message: string, ...parameters: unknown[]): void;
  warn(message: string, ...parameters: unknown[]): void;
  error(message: string, ...parameters: unknown[]): void;
  child(prefix: string): Logger;
}

function format(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createLogger(prefix: string, level: LogLevel = "info"): Logger {
  const threshold = LEVELS[level];
  const emit = (lvl: LogLevel, message: string, parameters: unknown[]) => {
    if (LEVELS[lvl] < threshold) return;
    const stamp = new Date().toISOString().slice(11, 23);
    const line = `${stamp} ${lvl.padEnd(5)} [${prefix}] ${message}${parameters.length ? " " + parameters.map(format).join(" ") : ""}`;
    if (lvl === "error") console.error(line);
    else if (lvl === "warn") console.warn(line);
    else console.log(line);
  };

  return {
    debug: (m, ...p) => emit("debug", m, p),
    info: (m, ...p) => emit("info", m, p),
    warn: (m, ...p) => emit("warn", m, p),
    error: (m, ...p) => emit("error", m, p),
    child: (sub) => createLogger(`${prefix}:${sub}`, level),
  };
}
