import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const WEB_SESSION_MS = 5 * 60_000;
export type WebGrant = {
  identity: string;
  origin: string;
  writes: boolean;
  staff: boolean;
  marketplace: boolean;
};
const hash = (value: string) => createHash("sha256").update(value).digest();
export function matchesSecret(actual: unknown, expected: string): boolean {
  return typeof actual === "string" && actual.length < 512 && timingSafeEqual(hash(actual), hash(expected));
}

/** One-use, origin-bound capability. No provider/device credential reaches JS. */
export class WebTickets {
  private tickets = new Map<string, WebGrant & { until: number }>();
  issue(grant: WebGrant, now = Date.now()) {
    for (const [key, item] of this.tickets) if (item.until <= now) this.tickets.delete(key);
    if (this.tickets.size >= 128) throw Error("Too many pending voice sessions");
    const token = randomBytes(32).toString("base64url");
    this.tickets.set(hash(token).toString("hex"), { ...grant, until: now + 60_000 });
    return token;
  }
  consume(token: unknown, origin: string, now = Date.now()): WebGrant | null {
    if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) return null;
    const key = hash(token).toString("hex"),
      item = this.tickets.get(key);
    if (!item || item.until <= now || item.origin !== origin) return null;
    this.tickets.delete(key);
    return item;
  }
}

// Fail closed for newly added tools: only audited reads and virtual-screen/audio
// commands are permitted without the user's explicit real-action opt-in.
const READ_TOOLS = new Set([
  "get_agenda",
  "get_openspace_board",
  "find_track",
  "find_free_slot",
  "event_stats",
  "get_countdown",
  "get_obs_state",
  "get_staff_tasks",
  "get_staff_announcements",
  "event_now",
  "show_on_screen",
  "set_volume",
]);
export function toolDenial(grant: WebGrant, name: string): string | null {
  return grant.writes || READ_TOOLS.has(name)
    ? null
    : "El laboratorio está en modo solo lectura. Activá 'Permitir cambios reales' e iniciá otra sesión para ejecutar esta acción. No se hizo ningún cambio.";
}
