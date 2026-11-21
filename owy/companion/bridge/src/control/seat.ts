import type { BridgeConfig } from "../config";
import type { DeviceSession } from "../index";
import type { Logger } from "../log";
import { AskerSchema, OWY_TALK_CHANNEL, TalkContextSchema } from "../web/contract";
import type { ControlPlane } from "./plane";
import { z } from "zod";

/**
 * «Owy, en vivo» with no Mac tab: the bridge plays the talk console's seat.
 * While a board has talk mode on (Control → Charla) and no browser is attached
 * to it as the seat, the presenter's phone drives Owy through the site — its
 * commands arrive on private:owy-talk — and the bridge sends the seat's
 * heartbeat, so every console sees Owy online. With a browser attached, that
 * browser is the seat and the bridge stays out of the way (a command never
 * runs twice).
 */

/** The console's commands (src/lib/orpc/owy-stage/schemas.ts TalkCommandSchema). */
const TalkCommandSchema = z.object({
  id: z.string().trim().min(1).max(40),
  message: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("say"),
      text: z.string().trim().min(1).max(600),
      clip: z.string().regex(/^[\w-]{1,40}$/).optional(),
    }),
    z.object({ type: z.literal("ask"), text: z.string().trim().min(1).max(600), asker: AskerSchema.default("presenter") }),
    z.object({ type: z.literal("hush") }),
    z.object({ type: z.literal("talk"), talk: TalkContextSchema }),
    z.object({ type: z.literal("pitch"), mode: z.boolean() }),
    z.object({ type: z.literal("listen"), channel: z.enum(["L", "R", "mix"]) }),
  ]),
});

const BEAT_EVERY_MS = 5_000;

export interface TalkSeatOptions {
  config: BridgeConfig;
  sessions: DeviceSession[];
  plane: ControlPlane;
  /** The site's owyStage.talkStatus. */
  beat: (status: unknown) => Promise<unknown>;
  logger: Logger;
}

export class TalkSeat {
  private readonly seen = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private seated: string | null = null;
  private readonly log: Logger;

  constructor(private readonly options: TalkSeatOptions) {
    this.log = options.logger.child("charla");
  }

  start(): void {
    this.timer = setInterval(() => this.beat(), BEAT_EVERY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The board the bridge seats: talk mode on, no browser attached as its seat. */
  private device(): DeviceSession | undefined {
    return this.options.sessions.find((session) => session.setting("talk") === true && !session.hasPeer);
  }

  onEvent(channel: string, event: string, payload: unknown): void {
    if (channel !== OWY_TALK_CHANNEL || event !== "command") return;
    const session = this.device();
    if (!session) return;
    const command = TalkCommandSchema.safeParse(payload);
    if (!command.success || this.seen.has(command.data.id)) return;
    this.seen.add(command.data.id);
    if (this.seen.size > 200) for (const id of [...this.seen].slice(0, 100)) this.seen.delete(id);
    const message = command.data.message;
    const failed = (error: unknown) => this.log.warn(`${message.type} no salió`, error);
    switch (message.type) {
      case "say":
        void session.say(message.text, message.clip).catch(failed);
        break;
      case "ask":
        void session.ask(message.text, message.asker).catch(failed);
        break;
      case "hush":
        session.hush();
        break;
      case "talk":
        session.setTalk(message.talk);
        break;
      case "pitch":
        session.setPitchMode(message.mode);
        break;
      case "listen":
        this.options.plane.change("bridge", "host_mic_channel", message.channel, "local");
        break;
    }
    this.beat();
  }

  /** The seat's heartbeat while the bridge holds it; one last beat when it lets go. */
  private beat(): void {
    const session = this.device();
    if (!session && !this.seated) return;
    this.seated = session?.id ?? null;
    const voice = session?.voiceStatus();
    void this.options
      .beat({
        seat: "bridge",
        attached: session?.id ?? null,
        stage: session?.phase ?? "standby",
        listen: this.options.config.COMPANION_HOST_MIC_CHANNEL,
        talk: !!session,
        pitch: session ? session.pitchSettings().mode : null,
        voice: voice
          ? {
              tier: voice.tier,
              realtime: voice.realtime,
              lastPath: voice.lastPath,
              lastTurn: voice.lastTurn
                ? { path: voice.lastTurn.path, ttfaMs: voice.lastTurn.ttfaMs, totalMs: voice.lastTurn.totalMs }
                : null,
            }
          : null,
      })
      .catch((error: unknown) => this.log.debug("talkStatus no llegó", error));
  }
}
