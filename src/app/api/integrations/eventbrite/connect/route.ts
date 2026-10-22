import { randomBytes } from "node:crypto";

import { Effect } from "effect";
import { NextResponse } from "next/server";

import { sessionFor } from "app/lib/auth-helpers";
import { principalFor } from "lib/authz/principal";
import { appUrl } from "lib/email/templates";
import { signLink } from "lib/links";
import { adminCommunity, authorizeUrl, eventbriteApp } from "lib/orpc/integrations/service";
import { liveServices } from "lib/orpc/services";

export const runtime = "nodejs";

/** Where the OAuth state lives while the admin is on Eventbrite. */
const STATE_COOKIE = "eventbrite_oauth";

/**
 * A community admin sends their browser to Eventbrite to connect the community's account. The
 * state is signed and bound to the community, the admin and a nonce, and comes back in a cookie.
 */
export async function GET(request: Request) {
  const communityId = new URL(request.url).searchParams.get("community") ?? "";
  // Only from OWU's own pages: another site linking here can't swap in the admin's Eventbrite account
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.redirect(appUrl("/organizar/panel"));
  const session = await sessionFor(request.headers);
  if (!session) {
    const next = `/api/integrations/eventbrite/connect?community=${encodeURIComponent(communityId)}`;
    return NextResponse.redirect(appUrl(`/login?next=${encodeURIComponent(next)}`));
  }
  const slug = await Effect.runPromiseWith(liveServices)(
    adminCommunity(communityId, await principalFor(session, request.headers))
  );
  if (!slug) return NextResponse.redirect(appUrl("/organizar/panel"));

  const app = eventbriteApp();
  if (!app) return NextResponse.redirect(appUrl(`/organizar/panel/${slug}/integraciones?eventbrite=sin-configurar`));

  const nonce = randomBytes(16).toString("hex");
  const state = await signLink("oauth", `${communityId}.${session.user.id}.${nonce}`, new Date(Date.now() + 600_000));
  const response = NextResponse.redirect(authorizeUrl(app.clientId, nonce));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl("/").startsWith("https:"),
    path: "/api/integrations/eventbrite",
    maxAge: 600,
  });

  return response;
}
