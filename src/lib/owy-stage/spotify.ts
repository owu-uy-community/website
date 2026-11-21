import "server-only";

import { eq } from "drizzle-orm";

import { db } from "../db";
import { owyStageState } from "../db/schema";

/**
 * Spotify "currently playing" for the wall. The account that plays the
 * playlist authorizes once from the admin; we keep its refresh token in the
 * stage row and exchange it for short-lived access tokens on demand.
 */

const ROW_ID = "global";
const SCOPES = "user-read-currently-playing user-read-playback-state";
/** The wall polls this; a slow Spotify must not hold requests open. */
const timeout = () => AbortSignal.timeout(5000);

export type SpotifyTrack = {
  song: string;
  artist: string;
  album: string;
  art: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
  /** Server time of the reading, so the wall can extrapolate progress between polls. */
  at: string;
};

function credentials() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not set");
  return { id, secret, basic: Buffer.from(`${id}:${secret}`).toString("base64") };
}

/**
 * The public origin for redirects. Spotify must see the exact registered
 * redirect URI, and dev servers rewrite the host, so the configured base URL wins.
 */
export function spotifyOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
}

export function spotifyConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

export function spotifyAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: credentials().id,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials().basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
    signal: timeout(),
  });
  if (!response.ok) throw new Error(`Spotify token endpoint: ${response.status}`);
  return (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

/** Finishes the OAuth dance and stores the refresh token with the account's name. */
export async function connectSpotify(code: string, redirectUri: string): Promise<string> {
  const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (!token.refresh_token) throw new Error("Spotify did not return a refresh token");
  const me = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
    signal: timeout(),
  });
  const profile = me.ok ? ((await me.json()) as { display_name?: string; id?: string }) : {};
  const account = profile.display_name || profile.id || "Spotify";
  const spotify = { refreshToken: token.refresh_token, account, connectedAt: new Date().toISOString() };
  await db
    .insert(owyStageState)
    .values({ id: ROW_ID, spotify })
    .onConflictDoUpdate({ target: owyStageState.id, set: { spotify } });
  access = { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return account;
}

export async function disconnectSpotify(): Promise<void> {
  await db.update(owyStageState).set({ spotify: null }).where(eq(owyStageState.id, ROW_ID));
  access = null;
  last = null;
}

export async function spotifyStatus(): Promise<{ configured: boolean; account: string | null }> {
  const [row] = await db
    .select({ spotify: owyStageState.spotify })
    .from(owyStageState)
    .where(eq(owyStageState.id, ROW_ID));
  return { configured: spotifyConfigured(), account: row?.spotify?.account ?? null };
}

// Per-instance caches: the access token (valid ~1 h) and the last reading
// (a few seconds), so a wall plus previews polling don't multiply calls.
let access: { token: string; expiresAt: number } | null = null;
let last: { track: SpotifyTrack | null; at: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (access && access.expiresAt - 60_000 > Date.now()) return access.token;
  const [row] = await db
    .select({ spotify: owyStageState.spotify })
    .from(owyStageState)
    .where(eq(owyStageState.id, ROW_ID));
  if (!row?.spotify?.refreshToken) return null;
  const token = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.spotify.refreshToken });
  access = { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return access.token;
}

/** What the linked account is playing right now; `null` when nothing (or not linked). */
export async function getSpotifyNowPlaying(): Promise<SpotifyTrack | null> {
  if (last && Date.now() - last.at < 4000) return last.track;
  if (!spotifyConfigured()) return null;
  let token: string | null;
  try {
    token = await accessToken();
  } catch (error) {
    // Revoked token or Spotify hiccup: the wall falls back to the typed song.
    console.error("[spotify] token", error);
    last = { track: null, at: Date.now() };
    return null;
  }
  if (!token) return null;
  const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=track", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: timeout(),
  });
  let track: SpotifyTrack | null = null;
  if (response.status === 200) {
    const data = (await response.json()) as {
      is_playing: boolean;
      progress_ms: number | null;
      item: {
        name: string;
        duration_ms: number;
        artists?: { name: string }[];
        album?: { name: string; images?: { url: string; width: number }[] };
      } | null;
    };
    if (data.item) {
      track = {
        song: data.item.name,
        artist: (data.item.artists ?? []).map((a) => a.name).join(", "),
        album: data.item.album?.name ?? "",
        art: data.item.album?.images?.[0]?.url ?? null,
        progressMs: data.progress_ms ?? 0,
        durationMs: data.item.duration_ms,
        isPlaying: data.is_playing,
        at: new Date().toISOString(),
      };
    }
  } else if (response.status === 401) {
    access = null;
  }
  last = { track, at: Date.now() };
  return track;
}
