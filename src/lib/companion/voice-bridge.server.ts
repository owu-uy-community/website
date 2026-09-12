// Server only. Authenticated webapp -> existing Node bridge -> same gadget session.
export class VoiceHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export function assertVoiceRequest(request: Request) {
  if (!request.headers.get("origin") || request.headers.get("origin") !== new URL(request.url).origin)
    throw new VoiceHttpError(403, "Same-origin request required.");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw new VoiceHttpError(403, "Cross-site voice requests are blocked.");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new VoiceHttpError(415, "JSON required.");
}
export type VoiceScopes = { writes: boolean; staff: boolean; marketplace: boolean };
export async function readVoiceScopes(request: Request): Promise<VoiceScopes> {
  const reader = request.body?.getReader();
  let text = "";
  if (reader) {
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > 1024) {
        await reader.cancel();
        throw new VoiceHttpError(413, "Request too large.");
      }
    }
  }
  let input;
  try {
    input = JSON.parse(text || "{}");
  } catch {
    throw new VoiceHttpError(400, "Invalid JSON.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !["writes", "staff", "marketplace"].includes(k)) ||
    Object.values(input).some((v) => typeof v !== "boolean")
  )
    throw new VoiceHttpError(400, "Invalid voice permissions.");
  return { writes: input.writes === true, staff: input.staff === true, marketplace: input.marketplace === true };
}
export class VoiceQuota {
  private entries = new Map<string, number[]>();
  take(id: string, now = Date.now()) {
    for (const [key, times] of this.entries) {
      const recent = times.filter((t) => now - t < 3_600_000);
      if (!recent.length) this.entries.delete(key);
      else this.entries.set(key, recent);
    }
    const times = this.entries.get(id) ?? [];
    if (
      times.length >= 20 ||
      times.filter((t) => now - t < 60_000).length >= 3 ||
      (!this.entries.has(id) && this.entries.size >= 1000)
    )
      throw new VoiceHttpError(429, "Please wait before starting another voice session.");
    this.entries.set(id, [...times, now]);
  }
}
export async function requestBridgeTicket(
  identity: string,
  origin: string,
  scopes: VoiceScopes,
  connection: { url?: string; secret?: string },
  fetcher = fetch
) {
  if (!connection.url || !connection.secret)
    throw new VoiceHttpError(
      503,
      "The companion bridge is not configured. Start it with COMPANION_WEB_BRIDGE=1 and configure the webapp's bridge connection."
    );
  const url = new URL(connection.url);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
  )
    throw new VoiceHttpError(503, "Bridge URL must be HTTPS or local loopback.");
  let response;
  try {
    response = await fetcher(new URL("/sessions", url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.secret}` },
      body: JSON.stringify({ identity, origin, ...scopes }),
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new VoiceHttpError(502, "The companion bridge is offline. Start the bridge and try again.");
  }
  if (!response.ok)
    throw new VoiceHttpError(
      [409, 429].includes(response.status) ? response.status : 502,
      response.status === 409
        ? "A conversation is already open, or the bridge is full. End the other session first."
        : response.status === 429
          ? "Please wait before starting another conversation."
          : "The bridge rejected the connection. Check its secret and allowed web origins."
    );
  const data = await response.json();
  if (
    data.protocol !== 1 ||
    typeof data.token !== "string" ||
    !/^[\w-]{43}$/.test(data.token) ||
    typeof data.url !== "string" ||
    !Number.isFinite(data.expiresAt)
  )
    throw new VoiceHttpError(502, "Invalid bridge session.");
  return data;
}
export function voiceResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" },
  });
}
export function voiceFailure(error: unknown) {
  return voiceResponse(
    { error: error instanceof VoiceHttpError ? error.message : "Unable to start web voice." },
    error instanceof VoiceHttpError ? error.status : 500
  );
}
