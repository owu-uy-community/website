import { createHash, createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { tick } from "lib/dispatch/tick";

import { GET, POST } from "./route";

vi.mock(import("lib/dispatch/tick"), () => ({ tick: vi.fn<typeof tick>(async () => ({ email: { sent: 0 } })) }));

const URL = "https://www.owu.uy/api/cron/tick";
const KEY = "sig_current";

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

/** A QStash signature: an HS256 JWT over the URL and the body's hash. */
function sign(body: string, { key = KEY, url = URL } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: "Upstash",
      sub: url,
      iat: now,
      nbf: now,
      exp: now + 300,
      jti: "test",
      body: createHash("sha256").update(body).digest("base64url"),
    })
  );

  return `${head}.${claims}.${createHmac("sha256", key).update(`${head}.${claims}`).digest("base64url")}`;
}

const post = (signature: string, body = "{}") =>
  POST(new NextRequest(URL, { method: "POST", body, headers: { "upstash-signature": signature } }));

describe("the QStash tick", () => {
  beforeEach(() => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", KEY);
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "sig_next");
    vi.mocked(tick).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  test("a signed call runs the sweeps", async () => {
    const response = await post(sign("{}"));

    expect(response.status).toBe(200);
    expect(tick).toHaveBeenCalledWith(50_000);
  });

  test("a forged, re-aimed or tampered call is refused", async () => {
    for (const signature of [sign("{}", { key: "guess" }), sign("{}", { url: "https://evil.example/tick" }), "nope"]) {
      expect((await post(signature)).status).toBe(401);
    }
    expect((await post(sign("{}"), '{"more":1}')).status).toBe(401);
    expect(tick).not.toHaveBeenCalled();
  });

  test("without signing keys it refuses everything", async () => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");

    expect((await post(sign("{}"))).status).toBe(503);
  });
});

describe("the daily cron backstop", () => {
  afterEach(() => vi.unstubAllEnvs());

  const get = (authorization?: string, url = URL) =>
    GET(new NextRequest(url, { headers: authorization ? { authorization } : {} }));

  test("runs with the cron secret and refuses without it", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    expect((await get("Bearer s3cret")).status).toBe(200);
    expect(tick).toHaveBeenLastCalledWith(240_000, { daily: true, digestNow: false });
    expect((await get("Bearer wrong")).status).toBe(401);
    expect((await get()).status).toBe(401);
  });

  test("?digest=now also sends the weekly digest, whatever the day", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    expect((await get("Bearer s3cret", `${URL}?digest=now`)).status).toBe(200);
    expect(tick).toHaveBeenLastCalledWith(240_000, { daily: true, digestNow: true });
  });

  test("with no secret configured it refuses everything", async () => {
    vi.stubEnv("CRON_SECRET", "");

    expect((await get("Bearer ")).status).toBe(503);
  });
});
