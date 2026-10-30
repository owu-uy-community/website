import type { OwuApi, StageFaceInput, StageFaceState } from "../../../agent/lib/owu-api";
import { systemClock, type RuntimeClock } from "./clock";
import type { DeviceTransport } from "./device/transport";
import type { Logger } from "./log";

/**
 * Mirrors a companion onto the video wall's Owy (site: /owy/stage, scene
 * `owy-face`): every face change, the running transcript of each turn, the
 * feeling per sentence and the card a pitch just placed go to
 * `owyStage.setFace`, so whoever talks to the little Owy shows up on the big
 * one. Fire-and-forget over the site API — a failed post never touches the
 * voice loop.
 */

const FLUSH_MS = 250;
const ERROR_LOG_INTERVAL_MS = 60_000;

export interface StageMirror {
  face(state: StageFaceState): void;
  transcript(who: "input" | "output", text: string): void;
  /** The feeling the device shows for the sentence being spoken. */
  expression(name: string, strength: number): void;
  /** Tees the transport's explicit face changes (happy after a card, error…) and the cards it shows into the mirror. */
  wrap<T extends DeviceTransport>(transport: T): T;
}

export interface StageMirrorOptions {
  /** `null` (no OWY_API_KEY) makes the mirror a no-op. */
  api: Pick<OwuApi, "owyStage"> | null;
  logger: Logger;
  /** Device id / web session, informational on the wall. */
  source: string;
  clock?: RuntimeClock;
}

export function createStageMirror({ api, logger, source, clock = systemClock }: StageMirrorOptions): StageMirror {
  if (!api) {
    logger.info("stage mirror off (OWY_API_KEY not set)");
    return { face() {}, transcript() {}, expression() {}, wrap: (transport) => transport };
  }

  let state: StageFaceState = "idle";
  let who: "input" | "output" | null = null;
  let text = "";
  let dirty = false;
  let timer: ReturnType<RuntimeClock["setTimeout"]> | null = null;
  let lastErrorAt = -Infinity;

  const post = (extra: Omit<StageFaceInput, "state" | "source"> = {}) => {
    api.owyStage.setFace({ state, ...extra, source }).catch((error: unknown) => {
      const now = clock.now();
      if (now - lastErrorAt < ERROR_LOG_INTERVAL_MS) return;
      lastErrorAt = now;
      logger.warn("stage mirror: could not reach the site", error);
    });
  };

  const flush = () => {
    if (timer) clock.clearTimeout(timer);
    timer = null;
    if (!dirty || !who || !text) return;
    dirty = false;
    post({ transcript: { who, text } });
  };

  const face = (next: StageFaceState) => {
    if (next === state) return;
    flush();
    state = next;
    // A new listening window is a new turn: the wall starts a fresh caption.
    if (next === "listening") {
      who = null;
      text = "";
    }
    post();
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

  const expression = (name: string, strength: number) => post({ expression: { name, strength } });

  const wrap = <T extends DeviceTransport>(transport: T): T => {
    const setFace = transport.setFace.bind(transport);
    transport.setFace = (next) => {
      setFace(next);
      face(next);
    };
    // Partial transports (tests, links) may not show cards.
    const showCard = transport.showCard?.bind(transport);
    if (showCard) {
      transport.showCard = (card) => {
        showCard(card);
        post({
          card: {
            title: card.title,
            ...(card.speaker ? { speaker: card.speaker } : {}),
            ...(card.room ? { room: card.room } : {}),
            ...(card.timeSlot ? { timeSlot: card.timeSlot } : {}),
          },
        });
      };
    }
    return transport;
  };

  return { face, transcript, expression, wrap };
}
