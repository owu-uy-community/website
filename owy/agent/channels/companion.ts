import { defineChannel, GET, POST } from "eve/channels";
import { type AuthFn, httpBasic, localDev, placeholderAuth, routeAuth } from "eve/channels/auth";
import { z } from "zod";

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
 *   POST /companion/:deviceId/turns   { text, staff?, marketplaceOpen?, eventName? } → { sessionId, streamIndex }
 *   GET  /companion/sessions/:sessionId/stream?startIndex=N               NDJSON event stream
 *   POST /companion/:deviceId/cancel                                      stop the active turn (tap)
 *   POST /companion/:deviceId/reset                                       retire the conversation (next visitor)
 *
 * Staff status is per turn: the device toggles staff mode with its PIN page,
 * and `agent/lib/staff.ts` already understands the `companion` /
 * `companion-staff` authenticators.
 */

const TurnBody = z.object({
  text: z.string().trim().min(1).max(4000),
  staff: z.boolean().default(false),
  marketplaceOpen: z.boolean().default(false),
  eventName: z.string().max(120).optional(),
});

export interface CompanionState {
  deviceId: string;
  eventName: string | null;
  /** Epoch ms of the last accepted proposal from this device (kiosk cooldown). */
  lastProposalAt: number | null;
}

const username = process.env.ROUTE_AUTH_BASIC_USER?.trim();
const password = process.env.ROUTE_AUTH_BASIC_PASSWORD;
const configuredAuth = username && password ? httpBasic({ username, password }) : placeholderAuth();
const productionAuth: AuthFn<Request> = (request) => {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (new URL(request.url).protocol !== "https:" && forwardedProtocol !== "https") return null;
  return configuredAuth(request);
};
const auth: AuthFn<Request>[] = process.env.NODE_ENV === "production" ? [productionAuth] : [localDev(), productionAuth];

const NDJSON = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" };

/** Serializes runtime events as NDJSON lines (the handle yields event objects). */
function ndjson(events: ReadableStream<unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return events.pipeThrough(
    new TransformStream<unknown, Uint8Array>({
      transform(event, controller) {
        if (event instanceof Uint8Array) return controller.enqueue(event);
        controller.enqueue(encoder.encode(`${typeof event === "string" ? event : JSON.stringify(event)}\n`));
      },
    })
  );
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
    POST<CompanionState>("/companion/:deviceId/turns", async (request, { from, params, resolveSession }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      const body = TurnBody.parse(await request.json());
      const deviceId = params.deviceId;

      // Tail *before* sending: the bridge streams from the next index, so a
      // continued session never replays the previous turn's events.
      const current = await resolveSession(deviceId);
      const streamIndex = current ? (await current.getStreamTailIndex()) + 1 : 0;

      const session = await from(deviceId).send(body.text, {
        auth: {
          authenticator: body.staff ? "companion-staff" : "companion",
          principalType: "service",
          principalId: deviceId,
          attributes: {
            device_id: deviceId,
            marketplace_open: body.marketplaceOpen ? "true" : "false",
          },
        },
        state: { deviceId, eventName: body.eventName ?? null, lastProposalAt: null },
        title: `Owy físico · ${deviceId}`,
      });
      return Response.json({ sessionId: session.id, streamIndex: session.id === current?.id ? streamIndex : 0 });
    }),

    GET<CompanionState>("/companion/sessions/:sessionId/stream", async (request, { attachSession, params }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      const raw = new URL(request.url).searchParams.get("startIndex");
      const startIndex = raw === null ? undefined : Number(raw);
      const stream = await attachSession(params.sessionId).getEventStream(
        Number.isFinite(startIndex) ? { startIndex } : undefined
      );
      return new Response(ndjson(stream), { headers: NDJSON });
    }),

    POST<CompanionState>("/companion/:deviceId/cancel", async (request, { from, params }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      return Response.json(await from(params.deviceId).cancel());
    }),

    POST<CompanionState>("/companion/:deviceId/reset", async (request, { from, params }) => {
      const verdict = await routeAuth(request, auth);
      if (verdict instanceof Response) return verdict;
      return Response.json(await from(params.deviceId).reset({ reason: "Fin de la conversación en el dispositivo" }));
    }),
  ],

  events: {
    // Kiosk anti-spam: the companion-only `propose_talk` reads this back from metadata.
    "action.result"(event, channel) {
      const result = event.result;
      if (result.kind !== "tool-result" || result.toolName !== "propose_talk" || result.isError) return;
      const output = result.output as { ok?: boolean } | null;
      if (output && typeof output === "object" && output.ok === true) channel.state.lastProposalAt = Date.now();
    },
  },
});
