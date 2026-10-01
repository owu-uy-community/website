import { NextResponse } from "next/server";

import { auth } from "app/lib/auth";
import { isSiteAdmin } from "app/lib/auth-helpers";
import {
  CommandSchema,
  fireCue,
  getObsStatus,
  listCues,
  loopAction,
  releaseExecutor,
  sendCommand,
  stepCue,
  type Command,
} from "lib/orpc/obs-control";

export const runtime = "nodejs";

/**
 * Plain HTTP for things that cannot speak oRPC: Bitfocus Companion / Stream
 * Deck (Generic HTTP module), curl, shortcuts. Auth is the same session or
 * `x-api-key` header the API uses — never a query parameter: the key is a full
 * admin credential and URLs end up in access logs. Commands are queued for
 * the executor tab (202), the status endpoint is what Companion polls for
 * button feedback.
 *
 *   POST /api/obs/scene/{name}            program (studio off) / preview+take (studio on)
 *   POST /api/obs/preview/{name}
 *   POST /api/obs/take | /cut
 *   POST /api/obs/studio/{on|off}
 *   POST /api/obs/transition/{name}[/{ms}]
 *   POST /api/obs/mute/{input}[/{on|off}]  (toggle without the last segment)
 *   POST /api/obs/stream/{start|stop|toggle} | /record/{…}
 *   POST /api/obs/cue/{id} | /cue/next | /cue/prev
 *   POST /api/obs/loop/{play|pause|stop|next|prev}
 *   POST /api/obs/release/{executorId}    executor tab giving the seat up on pagehide (keepalive fetch)
 *   GET  /api/obs/status | /cues
 *
 * GET works for every command too (Companion's "Image from URL"/simple
 * triggers), `?instance=2` targets the second rig.
 */
async function resolveSession(request: Request) {
  try {
    return await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    console.warn("[obs-http] Could not resolve a session:", error);

    return null;
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

const seg = (path: string[], index: number) => (path[index] ? decodeURIComponent(path[index]) : undefined);

function buildCommand(path: string[]): Command | null | "bad" {
  const [head] = path;
  const a = seg(path, 1);
  const b = seg(path, 2);
  switch (head) {
    case "scene":
      return a ? { type: "scene", payload: { sceneName: a } } : "bad";
    case "preview":
      return a ? { type: "preview", payload: { sceneName: a } } : "bad";
    case "take":
      return { type: "take", payload: {} };
    case "cut":
      return { type: "cut", payload: {} };
    case "studio":
      return a === "on" || a === "off" ? { type: "studio", payload: { enabled: a === "on" } } : "bad";
    case "transition":
      return a
        ? { type: "transition", payload: { name: a, ...(b && /^\d+$/.test(b) ? { durationMs: Number(b) } : {}) } }
        : "bad";
    case "mute":
      return a
        ? { type: "mute", payload: { inputName: a, ...(b === "on" || b === "off" ? { muted: b === "on" } : {}) } }
        : "bad";
    case "stream":
    case "record":
      return a === "start" || a === "stop" || a === "toggle" ? { type: head, payload: { action: a } } : "bad";
    default:
      return null;
  }
}

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await resolveSession(request);
  if (!session) return json({ ok: false, error: "unauthorized" }, 401);
  if (!isSiteAdmin(session)) return json({ ok: false, error: "forbidden" }, 403);

  const { path } = await params;
  const url = new URL(request.url);
  const instanceId = url.searchParams.get("instance") === "2" ? 2 : 1;
  const source = `http:${session.user.name || session.user.id}`;
  const [head] = path;

  if (head === "status") {
    const [status, cues] = await Promise.all([getObsStatus({ instanceId }), listCues({ instanceId })]);
    const current = cues.find((cue) => cue.id === status.currentCueId) ?? null;

    return json({
      ok: true,
      ...status,
      currentCue: current ? { id: current.id, name: current.name } : null,
      cues: cues.map((cue) => ({ id: cue.id, name: cue.name, active: cue.id === status.currentCueId })),
    });
  }
  if (head === "cues") return json({ ok: true, cues: await listCues({ instanceId }) });
  if (head === "release") {
    const executorId = seg(path, 1);
    if (!executorId) return json({ ok: false, error: "missing executor" }, 400);

    return json({ ok: true, status: await releaseExecutor({ instanceId, executorId }) });
  }

  if (head === "cue") {
    const target = seg(path, 1);
    if (!target) return json({ ok: false, error: "missing cue" }, 400);
    const result =
      target === "next" || target === "prev"
        ? await stepCue({ instanceId, direction: target }, source)
        : await fireCue({ id: target }, source).catch(() => null);
    if (!result) return json({ ok: false, error: "cue not found" }, 404);

    return json({ ok: true, cue: { id: result.cue.id, name: result.cue.name }, id: result.commandId }, 202);
  }

  if (head === "loop") {
    const action = seg(path, 1);
    if (!(action === "play" || action === "pause" || action === "stop" || action === "next" || action === "prev"))
      return json({ ok: false, error: "unknown loop action" }, 400);
    const state = await loopAction({ instanceId, action });

    return json({ ok: true, isPlaying: state.isPlaying, currentItemIndex: state.currentItemIndex });
  }

  const command = buildCommand(path);
  if (command === null) return json({ ok: false, error: "unknown command" }, 404);
  if (command === "bad") return json({ ok: false, error: "bad command" }, 400);
  const parsed = CommandSchema.safeParse(command);
  if (!parsed.success) return json({ ok: false, error: "bad command" }, 400);

  const sent = await sendCommand({ instanceId, ...parsed.data }, source);

  // 409 lets a Companion feedback turn the button red when nobody can execute.
  return json(
    { ok: sent.executorOnline, id: sent.id, executorOnline: sent.executorOnline },
    sent.executorOnline ? 202 : 409
  );
}

export const GET = handle;
export const POST = handle;
