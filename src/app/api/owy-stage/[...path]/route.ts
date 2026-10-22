import { COMMON_ERROR_STATUS_MAP, ORPCError } from "@orpc/server";
import { NextResponse } from "next/server";

import { callerFor } from "lib/orpc/server";
import { presetLabel } from "lib/owy-stage/scenes";

export const runtime = "nodejs";

/**
 * The desk's presets over plain HTTP, for what can't speak oRPC: Bitfocus
 * Companion / Stream Deck (Generic HTTP module), curl. Same rules as
 * /api/obs: a session or an `x-api-key` header, never a query parameter (the
 * key is a full admin credential and URLs end up in access logs), and
 * anything but POST only with the key, since a browser sends its cookies
 * along with any link.
 *
 *   POST /api/owy-stage/preset/{n|id}       into preview: TAKE on the desk sends it
 *   POST /api/owy-stage/preset/{n|id}/air   straight on air
 *
 * `{n}` is the preset's number on the desk (1–9 are its keys too). The id
 * stays with the preset when the list is reordered: ⋯ → Copiar URL Stream
 * Deck copies it.
 */

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Not just GET: Next answers HEAD with this same handler.
  if (request.method !== "POST" && !request.headers.has("x-api-key")) {
    return json({ ok: false, error: "Los comandos van por POST (o por GET con x-api-key)" }, 405);
  }
  // Next has already decoded each segment.
  const [head, ref, mode, ...rest] = path;
  if (head !== "preset" || !ref || (mode !== undefined && mode !== "air") || rest.length > 0) {
    return json({ ok: false, error: "Comando desconocido" }, 404);
  }

  try {
    const { preset, to } = await callerFor(request.headers).owyStage.firePreset({
      preset: ref,
      to: mode === "air" ? "air" : "preview",
    });

    return json({ ok: true, to, preset: { id: preset.id, name: presetLabel(preset), scene: preset.scene } });
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
