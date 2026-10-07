import { Effect, Exit } from "effect";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { server } from "test/msw/server";

import { fetchJson } from "./http";

const URL_ = "https://api.example.test/weather";
const Weather = z.object({ temp: z.number() });

function setup(answer: () => Response | Promise<Response>) {
  server.use(http.get(URL_, answer));

  return (timeoutMs?: number) => Effect.runPromiseExit(fetchJson("Clima", URL_, Weather, { timeoutMs }));
}

describe(fetchJson, () => {
  test("returns the parsed answer", async () => {
    const fetchWeather = setup(() => HttpResponse.json({ temp: 22, extra: true }));

    await expect(fetchWeather()).resolves.toStrictEqual(Exit.succeed({ temp: 22 }));
  });

  test.each([
    ["an error status", () => HttpResponse.json({ error: "down" }, { status: 503 })],
    ["an unexpected shape", () => HttpResponse.json({ temperature: "22" })],
    ["a network failure", () => HttpResponse.error()],
  ])("fails as UpstreamFailed on %s", async (_case, answer) => {
    const exit = await setup(answer)();

    expect(Exit.isFailure(exit) && exit.cause.toString()).toContain("UpstreamFailed");
  });

  test("gives up after the timeout", async () => {
    const fetchWeather = setup(() => new Promise<Response>(() => undefined));

    const exit = await fetchWeather(50);

    expect(Exit.isFailure(exit) && exit.cause.toString()).toContain("No pudimos hablar con Clima");
  });
});
