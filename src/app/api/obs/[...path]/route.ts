import { COMMON_ERROR_STATUS_MAP, ORPCError } from "@orpc/server";
import { NextResponse } from "next/server";

import type { Command } from "lib/orpc/obs-control/schemas";
import { callerFor } from "lib/orpc/server";

export const runtime = "nodejs";

/**
 * Plain HTTP for things that cannot speak oRPC: Bitfocus Companion / Stream
 * Deck (Generic HTTP module), curl, shortcuts. Every path calls the same
 * procedures as the site, with the same auth: a session or an `x-api-key`
 * header — never a query parameter: the key is a full admin credential and
 * URLs end up in access logs. Commands are queued for the executor tab (202),
 * the status endpoint is what Companion polls for button feedback.
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
 * Commands also work as GET with an `x-api-key` (Companion's simple
 * triggers), but never with just a session cookie: a browser sends its
 * cookies along with any link it follows. `?instance=2` targets the second rig.
 */

const READS = new Set(["status", "cues"]);
const LOOP_ACTIONS = new Set(["play", "pause", "stop", "next", "prev"] as const);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

const seg = (path: string[], index: number) => (path[index] ? decodeURIComponent(path[index]) : undefined);

/** The command a path names: null for an unknown path, "bad" for a known one missing its argument. */
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

async function run(path: string[], headers: Headers, instanceId: number) {
  const api = callerFor(headers);
  const [head] = path;

  if (head === "status") {
    const [status, cues] = await Promise.all([api.obsControl.status({ instanceId }), api.obsCue.list({ instanceId })]);
    const current = cues.find((cue) => cue.id === status.currentCueId) ?? null;

    return json({
      ok: true,
      ...status,
      currentCue: current ? { id: current.id, name: current.name } : null,
      cues: cues.map((cue) => ({ id: cue.id, name: cue.name, active: cue.id === status.currentCueId })),
    });
  }
  if (head === "cues") return json({ ok: true, cues: await api.obsCue.list({ instanceId }) });
  if (head === "release") {
    return json({ ok: true, status: await api.obsControl.release({ instanceId, executorId: seg(path, 1) ?? "" }) });
  }

  if (head === "cue") {
    const target = seg(path, 1) ?? "";
    const result =
      target === "next" || target === "prev"
        ? await api.obsCue.step({ instanceId, direction: target })
        : await api.obsCue.fire({ id: target });
    if (!result) return json({ ok: false, error: "El guion está vacío" }, 404);

    return json({ ok: true, cue: { id: result.cue.id, name: result.cue.name }, id: result.commandId }, 202);
  }

  if (head === "loop") {
    const action = seg(path, 1);
    if (!LOOP_ACTIONS.has(action as never)) return json({ ok: false, error: "Acción de loop desconocida" }, 400);
    const state = await api.obsQueue.loop({ instanceId, action: action as "play" });

    return json({ ok: true, isPlaying: state.isPlaying, currentItemIndex: state.currentItemIndex });
  }

  const command = buildCommand(path);
  if (command === null) return json({ ok: false, error: "Comando desconocido" }, 404);
  if (command === "bad") return json({ ok: false, error: "Al comando le falta un dato" }, 400);
  const sent = await api.obsControl.send({ instanceId, ...command });

  // 409 lets a Companion feedback turn the button red when nobody can execute.
  return json(
    { ok: sent.executorOnline, id: sent.id, executorOnline: sent.executorOnline },
    sent.executorOnline ? 202 : 409
  );
}

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (request.method === "GET" && !READS.has(path[0]) && !request.headers.has("x-api-key")) {
    return json({ ok: false, error: "Los comandos van por POST (o por GET con x-api-key)" }, 405);
  }

  try {
    return await run(path, request.headers, new URL(request.url).searchParams.get("instance") === "2" ? 2 : 1);
  } catch (error) {
    // Procedures only throw typed errors (crashes are already reported and sanitized).
    if (error instanceof ORPCError) {
      const status = COMMON_ERROR_STATUS_MAP[error.code as keyof typeof COMMON_ERROR_STATUS_MAP] ?? 500;

      return json({ ok: false, code: error.code, error: error.message }, status);
    }
    throw error;
  }
}

export const GET = handle;
export const POST = handle;
