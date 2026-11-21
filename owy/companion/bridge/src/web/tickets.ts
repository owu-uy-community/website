import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const WEB_SESSION_MS = 30 * 60_000;
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

/** What a self-signed ticket proves is fresh: never accept one that claims to live longer than this. */
const SIGNED_TICKET_MAX_MS = 120_000;

/**
 * The MAC of a webapp-signed ticket. The site and the bridge compute it the same way
 * (src/lib/companion/voice-bridge.server.ts `signBridgeTicket`); keep them in step.
 */
export const signTicketPayload = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(`owy-voice-ticket:v1.${payload}`).digest("base64url");

/**
 * One-use, origin-bound capability. No provider/device credential reaches JS.
 *
 * Two kinds: the random ones this bridge issued on `POST /sessions`, and `v1.<payload>.<mac>`
 * tickets the webapp signed itself with the shared secret — a site on Vercel can't reach a
 * bridge on the venue laptop's loopback, but the browser on that laptop can. Both are short-lived,
 * bound to the page's origin, and burnt on first use.
 */
export class WebTickets {
  constructor(private secret?: string) {}
  private tickets = new Map<string, WebGrant & { until: number }>();
  private spent = new Map<string, number>();
  issue(grant: WebGrant, now = Date.now()) {
    for (const [key, item] of this.tickets) if (item.until <= now) this.tickets.delete(key);
    if (this.tickets.size >= 128) throw Error("Too many pending voice sessions");
    const token = randomBytes(32).toString("base64url");
    this.tickets.set(hash(token).toString("hex"), { ...grant, until: now + 60_000 });
    return token;
  }
  consume(token: unknown, origin: string, now = Date.now()): WebGrant | null {
    if (typeof token === "string" && token.startsWith("v1.")) return this.consumeSigned(token, origin, now);
    if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) return null;
    const key = hash(token).toString("hex"),
      item = this.tickets.get(key);
    if (!item || item.until <= now || item.origin !== origin) return null;
    this.tickets.delete(key);
    return item;
  }
  private consumeSigned(token: string, origin: string, now: number): WebGrant | null {
    const [, payload, mac, extra] = token.split(".");
    if (!this.secret || extra !== undefined || !payload || payload.length > 1200 || !/^[\w-]{43}$/.test(mac ?? ""))
      return null;
    const expected = Buffer.from(signTicketPayload(this.secret, payload));
    if (expected.length !== mac.length || !timingSafeEqual(expected, Buffer.from(mac))) return null;
    let claim: Record<string, unknown>;
    try {
      claim = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      return null;
    }
    const { i, o, w, s, m, e, n } = claim;
    if (
      typeof i !== "string" ||
      i.length < 1 ||
      i.length > 200 ||
      o !== origin ||
      ![w, s, m].every((v) => typeof v === "boolean") ||
      typeof e !== "number" ||
      e <= now ||
      e > now + SIGNED_TICKET_MAX_MS ||
      typeof n !== "string" ||
      !/^[\w-]{16,64}$/.test(n)
    )
      return null;
    for (const [nonce, until] of this.spent) if (until <= now) this.spent.delete(nonce);
    if (this.spent.has(n) || this.spent.size >= 1024) return null;
    this.spent.set(n, e);
    return { identity: i, origin: o as string, writes: w as boolean, staff: s as boolean, marketplace: m as boolean };
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
  // eve brain: talking to the agent is the conversation itself; the read-only
  // lab still reaches eve as a non-staff visitor with the marketplace closed.
  "hablar_con_owy",
]);
export function toolDenial(grant: WebGrant, name: string): string | null {
  return grant.writes || READ_TOOLS.has(name)
    ? null
    : "El laboratorio está en modo solo lectura. Activá 'Permitir cambios reales' e iniciá otra sesión para ejecutar esta acción. No se hizo ningún cambio.";
}
