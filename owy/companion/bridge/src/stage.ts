import { randomUUID } from "node:crypto";
import type { OwuApi, StageFaceInput, StageFaceState } from "../../../agent/lib/owu-api";
import { systemClock, type ClockTimer, type RuntimeClock } from "./clock";
import type { DeviceTransport } from "./device/transport";
import type { Logger } from "./log";

/**
 * Mirrors a companion onto every Owy the site draws: the video wall (/owy/stage: `owy-face`, the
 * talk deck) and the knob's twin on /admin/owy. Everything rides the bridge's realtime socket
 * first — in order, at once, and outside the API key's 240 requests a minute — numbered (`boot` +
 * `seq`) so a page drops what arrives late or twice. While the socket is down, face events fall
 * back to `owyStage.setFace` (kept on the site and broadcast from there); a card is always kept, so
 * a wall that connects while it shows catches it. The lip track, the mic level and what the
 * knob's screen is told are live-only. A heartbeat repeats the face every few seconds: a page that
 * missed an event heals, and one that stops hearing it lets go of a turn instead of talking
 * forever. Fire-and-forget: nothing here touches the voice loop.
 */

const FLUSH_MS = 250;
/** How often the face is repeated (and pausa checked): pages let go after a few missed beats. */
const BEAT_MS = 4_000;
const PAUSE_CHECK_MS = 1_000;
/** The knob gets the mic level every 100 ms; so do the pages. */
const LEVEL_MS = 100;
const ERROR_LOG_INTERVAL_MS = 60_000;
/** What the knob's answer view can hold (show_caption keeps the newest words). */
const SCREEN_TEXT_MAX = 600;

type Payload = Omit<StageFaceInput, "state" | "source">;

export interface StageMirror {
  face(state: StageFaceState): void;
  transcript(who: "input" | "output", text: string): void;
  /** The feeling the device shows for the sentence being spoken; `leadMs` until it is heard. */
  expression(name: string, strength: number, leadMs?: number): void;
  /** Lip shapes for what Owy is saying (audio/mouth.ts frames), the first heard `leadMs` from now. */
  mouth(frames: string, leadMs: number): void;
  /** The tool Owy is running while thinking (`null` when it is done); any face change clears it. */
  tool(name: string | null): void;
  /** The level (0..100) of the mic Owy listens with: the halo on the wall and on the twin, like the knob's. */
  level(level: number): void;
  /** Tees what the transport is told — faces, cards, captions, what Owy heard, text, QR — into the mirror. */
  wrap<T extends DeviceTransport>(transport: T): T;
  /** Stops the heartbeat (a browser session that ended). */
  stop(): void;
}

export interface StageMirrorOptions {
  /** `null` (no OWY_API_KEY) makes the mirror a no-op. */
  api: { owyStage: Pick<OwuApi["owyStage"], "setFace"> } | null;
  logger: Logger;
  /** Device id / web session: the twin of a device shows only its events. */
  source: string;
  /** Publishes on the wall's channel over the bridge's socket; false when it is down. */
  publish?: (event: string, payload: unknown) => boolean;
  /** Pausa on this Owy: its faces show it, like the knob does. */
  paused?: () => boolean;
  clock?: RuntimeClock;
}

export function createStageMirror({
  api,
  logger,
  source,
  publish,
  paused,
  clock = systemClock,
}: StageMirrorOptions): StageMirror {
  if (!api) {
    logger.info("stage mirror off (OWY_API_KEY not set)");
    return {
      face() {},
      transcript() {},
      expression() {},
      mouth() {},
      tool() {},
      level() {},
      wrap: (transport) => transport,
      stop() {},
    };
  }

  /** This process's events, in order: a restarted bridge counts again under a new boot. */
  const boot = randomUUID().slice(0, 8);
  let seq = 0;
  let state: StageFaceState = "idle";
  // Not read here: the session that answers `paused` is created right after its mirror.
  let privacy = false;
  let who: "input" | "output" | null = null;
  let text = "";
  let dirty = false;
  let timer: ClockTimer | null = null;
  let lastErrorAt = -Infinity;
  let running: string | null = null;
  let levelAt = -Infinity;
  let stopped = false;

  const post = (input: StageFaceInput) => {
    api.owyStage.setFace(input).catch((error: unknown) => {
      const now = clock.now();
      if (now - lastErrorAt < ERROR_LOG_INTERVAL_MS) return;
      lastErrorAt = now;
      logger.warn("stage mirror: could not reach the site", error);
    });
  };

  const stamp = (extra: Payload = {}): StageFaceInput => ({
    state,
    source,
    boot,
    seq: ++seq,
    ...(privacy ? { privacy: true } : {}),
    ...extra,
  });

  /** A face event: over the socket, or kept and broadcast by the site when the socket is down. */
  const send = (extra: Payload = {}, keep = false) => {
    const event = stamp(extra);
    if (!publish?.("face", event) || keep) post(event);
  };

  const flush = () => {
    if (timer) clock.clearTimeout(timer);
    timer = null;
    if (!dirty || !who || !text) return;
    dirty = false;
    send({ transcript: { who, text: text.slice(-2000) } });
  };

  const face = (next: StageFaceState) => {
    if (next === state) return;
    flush();
    state = next;
    running = null;
    // A new listening window is a new turn: the wall starts a fresh caption.
    if (next === "listening") {
      who = null;
      text = "";
    }
    send();
  };

  const transcript = (nextWho: "input" | "output", delta: string) => {
    if (nextWho !== who) {
      flush();
      who = nextWho;
      text = "";
    }
    text += delta;
    dirty = true;
    if (!timer) timer = clock.setTimeout(flush, FLUSH_MS);
  };

  const expression = (name: string, strength: number, leadMs = 0) =>
    send({ expression: { name, strength, at: Date.now() + Math.max(0, leadMs) } });

  // Without the socket the wall's face babbles on its own while Owy speaks.
  const mouth = (frames: string, leadMs: number) => void publish?.("mouth", { source, at: Date.now() + leadMs, frames });

  const tool = (name: string | null) => {
    if (name === running) return;
    running = name;
    send(name ? { tool: name.slice(0, 60) } : {});
  };

  const level = (value: number) => {
    const now = clock.now();
    if (state !== "listening" || now - levelAt < LEVEL_MS) return;
    levelAt = now;
    publish?.("level", { source, level: Math.max(0, Math.min(100, Math.round(value))) });
  };

  /** What the knob's screen was told besides its face: the twin shows it the same way. */
  const screen = (kind: "caption" | "heard" | "text" | "qr", body: string, url?: string) =>
    void publish?.("screen", { source, kind, text: body.slice(-SCREEN_TEXT_MAX), ...(url ? { url } : {}) });

  // The heartbeat: the face as it stands (same `seq`: nothing new happened), and pausa when it changes.
  let ticks = 0;
  let beat: ClockTimer | null = null;
  const arm = () => {
    beat = clock.setTimeout(tick, PAUSE_CHECK_MS);
    beat.unref?.();
  };
  /** What the session says about pausa; what it said last when it can't answer. */
  const pausedNow = () => {
    try {
      return paused ? paused() === true : privacy;
    } catch (error) {
      const at = clock.now();
      if (at - lastErrorAt >= ERROR_LOG_INTERVAL_MS) {
        lastErrorAt = at;
        logger.warn("stage mirror: could not read pausa", error);
      }
      return privacy;
    }
  };
  const tick = () => {
    if (stopped) return;
    // An exception in a timer would exit the process: nothing here may throw.
    const now = pausedNow();
    if (now !== privacy) {
      privacy = now;
      send();
    } else if (++ticks % (BEAT_MS / PAUSE_CHECK_MS) === 0) {
      publish?.("face", { state, source, boot, seq, beat: true, ...(privacy ? { privacy: true } : {}) });
    }
    arm();
  };
  arm();

  const wrap = <T extends DeviceTransport>(transport: T): T => {
    const setFace = transport.setFace.bind(transport);
    transport.setFace = (next) => {
      setFace(next);
      face(next);
    };
    // Partial transports (tests, links) may not show cards or text.
    const showCard = transport.showCard?.bind(transport);
    if (showCard) {
      transport.showCard = (card) => {
        showCard(card);
        send(
          {
            card: {
              title: card.title,
              ...(card.speaker ? { speaker: card.speaker } : {}),
              ...(card.room ? { room: card.room } : {}),
              ...(card.timeSlot ? { timeSlot: card.timeSlot } : {}),
            },
          },
          true
        );
      };
    }
    const showCaption = transport.showCaption?.bind(transport);
    if (showCaption)
      transport.showCaption = (body) => {
        showCaption(body);
        screen("caption", body);
      };
    const showHeard = transport.showHeard?.bind(transport);
    if (showHeard)
      transport.showHeard = (body) => {
        showHeard(body);
        screen("heard", body);
      };
    const showText = transport.showText?.bind(transport);
    if (showText)
      transport.showText = (body) => {
        showText(body);
        screen("text", body);
      };
    const showQr = transport.showQr?.bind(transport);
    if (showQr)
      transport.showQr = (url, caption) => {
        showQr(url, caption);
        screen("qr", caption ?? "", url);
      };
    return transport;
  };

  const stop = () => {
    stopped = true;
    if (beat) clock.clearTimeout(beat);
    beat = null;
    flush();
  };

  return { face, transcript, expression, mouth, tool, level, wrap, stop };
}
