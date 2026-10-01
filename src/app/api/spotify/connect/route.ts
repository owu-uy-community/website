import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "app/lib/auth";
import { isSiteAdmin } from "app/lib/auth-helpers";
import { spotifyAuthorizeUrl, spotifyConfigured, spotifyOrigin } from "lib/owy-stage/spotify";

export const runtime = "nodejs";

/** Admin-only: sends the director to Spotify to link the account that plays the music. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isSiteAdmin(session)) return NextResponse.redirect(new URL("/login", spotifyOrigin(request)));
  if (!spotifyConfigured())
    return NextResponse.redirect(new URL("/admin/owy/scenes?spotify=unconfigured", spotifyOrigin(request)));

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/spotify/callback", spotifyOrigin(request)).toString();
  const response = NextResponse.redirect(spotifyAuthorizeUrl(state, redirectUri));
  response.cookies.set("spotify_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
