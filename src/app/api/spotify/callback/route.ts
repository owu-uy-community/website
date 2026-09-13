import { NextResponse } from "next/server";

import { auth } from "app/lib/auth";
import { isSiteAdmin } from "app/lib/auth-helpers";
import { connectSpotify, spotifyOrigin } from "lib/owy-stage/spotify";

export const runtime = "nodejs";

/** Spotify sends the code here; we swap it for a refresh token and go back to the director. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isSiteAdmin(session)) return NextResponse.redirect(new URL("/login", spotifyOrigin(request)));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers.get("cookie")?.match(/(?:^|;\s*)spotify_oauth_state=([^;]+)/)?.[1];
  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`/admin/owy/scenes?spotify=${result}`, spotifyOrigin(request)));
    response.cookies.delete("spotify_oauth_state");
    return response;
  };
  if (!code || !state || state !== cookieState) return back("error");

  try {
    await connectSpotify(code, new URL("/api/spotify/callback", spotifyOrigin(request)).toString());
    return back("ok");
  } catch (error) {
    console.error("[spotify] connect", error);
    return back("error");
  }
}
