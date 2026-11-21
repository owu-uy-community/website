import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { principalFromRequest } from "app/lib/auth-helpers";
import { can } from "lib/authz/principal";
import { spotifyAuthorizeUrl, spotifyConfigured, spotifyOrigin } from "lib/owy-stage/spotify";

/** Admin-only: sends the director to Spotify to link the account that plays the music. */
export async function GET(request: Request) {
  if (!(await can(await principalFromRequest(request.headers), "stage:operate")))
    return NextResponse.redirect(new URL("/login", spotifyOrigin(request)));
  if (!spotifyConfigured())
    return NextResponse.redirect(new URL("/admin/owy/scenes?spotify=unconfigured", spotifyOrigin(request)));

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/spotify/callback", spotifyOrigin(request)).toString();
  const response = NextResponse.redirect(spotifyAuthorizeUrl(state, redirectUri));
  response.cookies.set("spotify_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
