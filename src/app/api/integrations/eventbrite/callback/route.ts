import { Effect, Result } from "effect";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "app/lib/auth";
import { appUrl } from "lib/email/templates";
import { later } from "lib/later";
import { readLink } from "lib/links";
import { adminCommunity, connect, pushSoon } from "lib/orpc/integrations/service";
import { liveServices } from "lib/orpc/services";

export const runtime = "nodejs";

const STATE_COOKIE = "eventbrite_oauth";

/**
 * Eventbrite sends the admin back here with a code. It only counts with the state this browser
 * was given, for the same admin, who still runs the community; then the account is connected.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const run = Effect.runPromiseWith(liveServices);
  const signed = await readLink("oauth", request.cookies.get(STATE_COOKIE)?.value ?? "");
  const [communityId = "", userId, nonce] = signed?.split(".") ?? [];
  const session = await auth.api.getSession({ headers: request.headers });
  const slug = session && session.user.id === userId ? await run(adminCommunity(communityId, session.user)) : null;

  const back = (result: string) => {
    const response = NextResponse.redirect(
      appUrl(slug ? `/organizar/panel/${slug}/integraciones?eventbrite=${result}` : "/organizar/panel")
    );
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/integrations/eventbrite" });
    return response;
  };
  const code = url.searchParams.get("code");
  if (!slug || !session || !nonce || url.searchParams.get("state") !== nonce) return back("error");
  if (!code) return back("cancelado");

  const outcome = await run(Effect.result(connect({ communityId, userId: session.user.id, code })));
  if (Result.isFailure(outcome)) {
    console.error("[eventbrite] connect", outcome.failure);
    return back("error");
  }

  // What was waiting for this account (failed publications) goes right away
  later(pushSoon);

  return back("conectado");
}
