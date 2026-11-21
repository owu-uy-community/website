import { Effect, Result } from "effect";
import { NextResponse } from "next/server";

import { applyWebhook } from "lib/orpc/attendees/service";
import { WebhookSchema } from "lib/orpc/eventbrite/schemas";
import { connectionByWebhookKey } from "lib/orpc/integrations/service";
import { liveServices } from "lib/orpc/services";

/**
 * Webhooks from a community's own Eventbrite account. Eventbrite can't sign them, so the path
 * carries a secret per connection; what the call names is read back with that account's token
 * and only mirrored into that community's events.
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const run = Effect.runPromiseWith(liveServices);
  const connection = await run(connectionByWebhookKey(key));
  if (!connection) return json({ ok: false, error: "Webhook desconocido" }, 404);

  const payload = WebhookSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return json({ ok: false, error: "No es un aviso de Eventbrite" }, 400);

  const outcome = await run(Effect.result(applyWebhook(payload.data.api_url, connection)));
  if (Result.isFailure(outcome)) {
    // Eventbrite retries what fails; the 30 s read catches up meanwhile
    return json({ ok: false, error: outcome.failure.message || "No pudimos guardar el aviso" }, 502);
  }

  return json({ ok: true, action: payload.data.config.action, changed: outcome.success ?? 0 });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
