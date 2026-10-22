import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { NOT_FOUND_MARKDOWN } from "lib/community/markdown";
import { server } from "test/msw/server";

import { proxy } from "./proxy";

const SITE = "https://www.owu.uy";

const get = (path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`${SITE}${path}`, { headers: { host: "www.owu.uy", ...headers } }));

/** The status the page answers to the existence check, and the requests that check made */
function pageAnswers(status: number) {
  const seen: Request[] = [];
  server.use(
    http.head(`${SITE}/*`, ({ request }) => {
      seen.push(request);
      return new HttpResponse(null, { status });
    })
  );

  return seen;
}

describe("Markdown negotiation", () => {
  test("the home page answers Markdown to agents that ask for it, through its twin", async () => {
    const response = await get("/", { accept: "text/markdown" });

    expect(response.headers.get("x-middleware-rewrite")).toBe(`${SITE}/index.md`);
  });

  test("browsers keep getting the HTML", async () => {
    for (const accept of ["text/html,application/xhtml+xml,*/*;q=0.8", "*/*", ""]) {
      const response = await get("/", accept ? { accept } : {});

      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  test("406 when the client takes neither HTML nor Markdown", async () => {
    const response = await get("/", { accept: "application/pdf" });

    expect(response.status).toBe(406);
    await expect(response.text()).resolves.toContain("text/markdown");
    expect(response.headers.get("vary")).toBe("Accept");
  });

  test("a page that doesn't exist answers 404 in Markdown", async () => {
    const seen = pageAnswers(404);
    const response = await get("/no-existe", { accept: "text/markdown" });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("vary")).toBe("Accept");
    await expect(response.text()).resolves.toBe(NOT_FOUND_MARKDOWN);
    // The check asks as a browser, so it goes through as a plain page request
    expect(seen.map((request) => request.headers.get("accept"))).toStrictEqual(["text/html"]);
  });

  test("the existence check only asks this site: its hosts, or this server on loopback", async () => {
    vi.stubEnv("PORT", "3461");
    const seen: string[] = [];
    server.use(
      http.head("*", ({ request }) => {
        seen.push(request.url);
        return new HttpResponse(null, { status: 404 });
      })
    );
    const ask = (url: string) => proxy(new NextRequest(url, { headers: { accept: "text/markdown" } }));

    expect((await ask("http://169.254.169.254/latest")).headers.get("x-middleware-next")).toBe("1");
    expect((await ask("http://localhost:6379/x")).headers.get("x-middleware-next")).toBe("1");
    expect((await ask("http://localhost:3461/no-existe")).status).toBe(404);
    expect(seen).toStrictEqual(["http://localhost:3461/no-existe"]);
    vi.unstubAllEnvs();
  });

  test("a page without a twin stays HTML for agents", async () => {
    pageAnswers(200);
    const response = await get("/eventos", { accept: "text/markdown" });

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("a launch-flagged page answers the Markdown 404 without asking", async () => {
    const seen = pageAnswers(200);
    const response = await get("/semanario", { accept: "text/markdown" });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe(NOT_FOUND_MARKDOWN);
    expect(seen).toStrictEqual([]);
  });

  test("RSC fetches and files are left alone", async () => {
    const seen = pageAnswers(404);

    for (const response of [
      await get("/", { accept: "text/markdown", rsc: "1" }),
      await get("/eventos.ics", { accept: "text/markdown" }),
      await get("/llms.txt", { accept: "text/markdown" }),
    ]) {
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(seen).toStrictEqual([]);
  });

  test("redirects still win", async () => {
    const response = await get("/c/python", { accept: "text/markdown" });

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${SITE}/comunidad/python`);
  });
});
