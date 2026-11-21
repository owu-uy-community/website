import { defineChannel, GET, POST } from "eve/channels";
import { type AuthFn, localDev, routeAuth } from "eve/channels/auth";
import { call } from "eve/events";
import { type Delivery, SessionNotActiveError } from "eve/sessions";
import { z } from "zod";

import { verifyOwuKey } from "../lib/owu-api";

/**
 * Voice channel for the physical Owys (owy/companion).
 *
 * The companion bridge (a Node process on the venue laptop) is the ears and
 * mouth: a realtime speech model transcribes the visitor and speaks the reply.
 * The *brain* is this agent — the same Owy as Slack/Telegram, with the same
 * knowledge, tools, memory and staff gating. One durable session per device
 * (`from(deviceId)`), steered by default so a visitor who keeps talking while
 * Owy is still thinking corrects the turn instead of queueing behind it.
 *
 * Routes (bridge → agent; Basic auth in production, loopback in `eve dev`):
 *   POST /companion/:deviceId/turns   { text, staff?, marketplaceOpen?, eventName?, kind?, pitch?, talk? } → { sessionId, streamIndex }
 *   GET  /companion/sessions/:sessionId/stream?startIndex=N               NDJSON session events (stream line N on)
 *   POST /companion/:deviceId/cancel                                      stop the active turn (tap)
 *   POST /companion/:deviceId/reset                                       retire the conversation (next visitor)
 *
 * Staff status is per turn: the device toggles staff mode with its PIN page,
 * and `agent/lib/staff.ts` already understands the `companion` /
 * `companion-staff` authenticators.
 *
 * Anything that changes from turn to turn travels in the turn's auth
 * attributes (`session.auth.current`), never in channel state: `send(…, { state })`
 * only seeds a session when the device has none, and a device's session spans
 * many taps (until `/reset`).
 */

/** What the bridge already made of a spoken pitch (modo pitch); the card is on the board when this arrives. */
const PitchContext = z.object({
  title: z.string().max(200),
  speaker: z.string().max(200).nullable(),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
  description: z.string().max(2000).nullable(),
  topics: z.array(z.string().max(60)).max(8),
});
export type PitchContext = z.infer<typeof PitchContext>;

const TurnBody = z.object({
  text: z.string().trim().min(1).max(4000),
  staff: z.boolean().default(false),
  marketplaceOpen: z.boolean().default(false),
  eventName: z.string().max(120).optional(),
  /** `pitch`: `text` is the transcript of a pitch whose card already exists; Owy only reacts. */
  kind: z.enum(["chat", "pitch"]).default("chat"),
  pitch: PitchContext.optional(),
  /** «Owy, en vivo»: Owy is co-presenting a talk; what is on the screen and who is talking to him. */
  talk: z.object({ slide: z.string().max(600), asker: z.enum(["presenter", "audience"]) }).optional(),
});

export interface CompanionState {
  deviceId: string;
  eventName: string | null;
  /** Epoch ms of the last accepted proposal from this device (kiosk cooldown). */
  lastProposalAt: number | null;
}

/**
 * Devices call these routes with their OWU API key (`x-api-key`); only keys the site says may
 * operate Owy (`owy:operate`, the "companion" preset has it) get in. Revoked there, locked here.
 */
const productionAuth: AuthFn<Request> = async (request) => {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (new URL(request.url).protocol !== "https:" && forwardedProtocol !== "https") return null;
  const key = request.headers.get("x-api-key");
  const device = key ? await verifyOwuKey(key) : null;

  return device
    ? { authenticator: "owu-key", principalId: device.id, principalType: "user", attributes: { name: device.name } }
    : null;
};
const auth: AuthFn<Request>[] = process.env.NODE_ENV === "production" ? [productionAuth] : [localDev(), productionAuth];

const NDJSON = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" };

/** Serializes session events as NDJSON lines, starting with the one the route already read. */
function ndjson(first: IteratorResult<unknown>, events: AsyncIterator<unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let pending: IteratorResult<unknown> | null = first;
  return new ReadableStream({
    async pull(controller) {
      const next = pending ?? (await events.next());
      pending = null;
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
    },
    async cancel() {
      await events.return?.();
    },
  });
}

/** The stream line that admitted a delivery: the bridge reads its turn from there on. */
async function admittedAt(delivery: Delivery, signal: AbortSignal): Promise<number> {
  for await (const event of delivery.stream({ signal })) return event.meta.position.line;
  throw new Error(`eve: delivery ${delivery.deliveryId} has no events`);
}

/** eve 0.x answered a control with nothing to act on with "nothing to do"; 1.0 throws, and the bridge expects a 200. */
function inactive(error: unknown): null {
  if (SessionNotActiveError.is(error)) return null;
  throw error;
}

const initialState: CompanionState = { deviceId: "", eventName: null, lastProposalAt: null };

export default defineChannel({
  turnPolicy: "steer",
  state: initialState,

  // Event handlers get `channel.state` (live adapter state, written back after each handler).
  context(state) {
    return { state };
  },

  // Read by the voice-mode instructions and the companion-only tools.
  metadata(state) {
    return {
      surface: "voice" as const,
      deviceId: state.deviceId,
      eventName: state.eventName,
      lastProposalAt: state.lastProposalAt,
    };
  },

  routes: [
    POST<CompanionState>("/companion/:deviceId/turns", async (request, { from, params }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      const body = TurnBody.parse(await request.json());
      const deviceId = params.deviceId;

      const delivery = await from(deviceId).send(body.text, {
        auth: {
          authenticator: body.staff ? "companion-staff" : "companion",
          principalType: "service",
          principalId: deviceId,
          attributes: {
            device_id: deviceId,
            marketplace_open: body.marketplaceOpen ? "true" : "false",
            // Per turn: a chat turn, a pitch reaction and a talk turn share the device's session.
            turn_kind: body.kind === "pitch" ? "pitch" : body.talk ? "talk" : "chat",
            pitch_title: body.kind === "pitch" ? (body.pitch?.title ?? "") : "",
            talk_slide: body.talk?.slide ?? "",
            talk_asker: body.talk?.asker ?? "",
          },
        },
        // Seeds a new session only (an existing one keeps its state, e.g. the proposal cooldown).
        state: { deviceId, eventName: body.eventName ?? null, lastProposalAt: null },
        title: `Owy físico · ${deviceId}`,
      });
      // The bridge streams from the line that admitted this message, so a continued session never
      // replays the previous turn's events.
      return Response.json({ sessionId: delivery.sessionId, streamIndex: await admittedAt(delivery, request.signal) });
    }),

    GET<CompanionState>("/companion/sessions/:sessionId/stream", async (request, { attachSession, params }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      const raw = new URL(request.url).searchParams.get("startIndex");
      const startIndex = raw === null ? undefined : Number(raw);
      const events = attachSession(params.sessionId)
        .stream({ ...(Number.isFinite(startIndex) ? { startIndex } : {}), signal: request.signal })
        [Symbol.asyncIterator]();
      // Read once before the headers, so a missing or stranded session answers with an error status.
      const first = await events.next();
      return new Response(ndjson(first, events), { headers: NDJSON });
    }),

    POST<CompanionState>("/companion/:deviceId/cancel", async (request, { from, params }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      return Response.json((await from(params.deviceId).cancel().catch(inactive)) ?? { status: "no_active_turn" });
    }),

    POST<CompanionState>("/companion/:deviceId/reset", async (request, { from, params }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      // `end` retires the session for good; the device's next turn starts a new one.
      const ended = await from(params.deviceId).end({ reason: "Fin de la conversación en el dispositivo" }).catch(inactive);
      return Response.json(ended ?? { status: "no_active_session" });
    }),
  ],

  events: {
    // Kiosk anti-spam: the companion-only `propose_talk` reads this back from metadata.
    "call.settled"(event, ctx) {
      const settled = call(ctx.view, event.data.callId);
      if (settled?.name !== "propose_talk" || settled.outcome !== "completed") return;
      const output = settled.output as { ok?: boolean } | null | undefined;
      if (output && typeof output === "object" && output.ok === true) ctx.channel.state.lastProposalAt = Date.now();
    },
  },
});
