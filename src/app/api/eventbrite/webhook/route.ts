import { timingSafeEqual } from "node:crypto";

import { Effect, Result } from "effect";
import { NextResponse } from "next/server";

import { applyWebhook } from "lib/orpc/attendees/service";
import { WebhookSchema } from "lib/orpc/eventbrite/schemas";
import { liveServices } from "lib/orpc/services";

/**
 * Eventbrite's webhooks (`attendee.checked_in`, `attendee.updated`, `order.placed`): each one
 * names an API URL; we read it with our key and mirror what it points at. Eventbrite can't
 * sign its calls, so the URL carries a shared secret: `?secret=<EVENTBRITE_WEBHOOK_SECRET>`.
 * Without that env var the webhook is off, and the 30 s poll alone keeps the mirror current.
 */
export async function POST(request: Request) {
  const expected = process.env.EVENTBRITE_WEBHOOK_SECRET;
  if (!expected) return json({ ok: false, error: "El webhook de Eventbrite no está configurado" }, 503);
  if (!sameSecret(new URL(request.url).searchParams.get("secret") ?? "", expected)) {
    return json({ ok: false, error: "Secreto inválido" }, 401);
  }

  const payload = WebhookSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return json({ ok: false, error: "No es un aviso de Eventbrite" }, 400);

  const outcome = await Effect.runPromiseWith(liveServices)(Effect.result(applyWebhook(payload.data.api_url)));
  if (Result.isFailure(outcome)) {
    // Eventbrite retries what fails; the poll catches up meanwhile.
    return json({ ok: false, error: outcome.failure.message || "No pudimos guardar el aviso" }, 502);
  }

  return json({ ok: true, action: payload.data.config.action, changed: outcome.success ?? 0 });
}

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
