import { afterEach, expect, it } from "vitest";
import { request } from "node:http";
import { loadConfig } from "../src/config";
import type { ControlPlane } from "../src/control/plane";
import { createLogger } from "../src/log";
import { startSettingsServer } from "../src/web/settings";

// The bridge's own page (the panel's backup), against the real loopback server.
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

const SECRET = "clave-de-prueba";
const AUTH = { authorization: `Basic ${Buffer.from(`owy:${SECRET}`).toString("base64")}` };

async function server() {
  const port = 20000 + Math.floor(Math.random() * 20000); // ephemeral; the schema forbids 0
  const changes: unknown[][] = [];
  const commands: unknown[] = [];
  // What the page needs from the control plane, recorded.
  const control = {
    status: () => ({ version: "test", machine: "mac", values: {}, devices: [] }),
    rows: () => [],
    change: (...args: unknown[]) => (changes.push(args), { ok: true }),
    runLocal: async (command: unknown) => (commands.push(command), { ok: true, data: null }),
  } as unknown as ControlPlane;
  const started = await startSettingsServer({
    control,
    config: { ...loadConfig({}), COMPANION_SETTINGS_PORT: port, COMPANION_BRIDGE_SECRET: SECRET },
    logger: createLogger("settings-test", "error"),
  });
  cleanup.push(started.close);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(new URL(path, started.url), {
      method: "POST",
      headers: { "content-type": "application/json", ...AUTH, ...headers },
      body: JSON.stringify(body),
    });
  return { started, post, changes, commands, port };
}

it("asks for the bridge's secret, then reads and writes through the control plane", async () => {
  const { started, post, changes, commands } = await server();
  const anonymous = await fetch(started.url);
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers.get("www-authenticate")).toMatch(/^Basic/);
  const wrong = await fetch(started.url, { headers: { authorization: `Basic ${Buffer.from("owy:nope").toString("base64")}` } });
  expect(wrong.status).toBe(401);
  expect((await fetch(started.url, { headers: AUTH })).headers.get("content-type")).toMatch(/text\/html/);

  expect(await (await fetch(new URL("api/state", started.url), { headers: AUTH })).json()).toEqual({
    status: { version: "test", machine: "mac", values: {}, devices: [] },
    rows: [],
  });
  expect((await post("api/set", { target: "owy-knob", key: "volume", value: 40 })).status).toBe(200);
  expect(changes).toEqual([["owy-knob", "volume", 40, "local"]]);
  expect((await post("api/set", { key: "volume", value: 40 })).status).toBe(400);
  expect((await post("api/command", { type: "tone", target: "mac" })).status).toBe(200);
  expect((await post("api/command", { type: "format-disk" })).status).toBe(400);
  expect(commands).toEqual([{ type: "tone", target: "mac" }]);
});

it("refuses writes posted from another site, even as a plain form", async () => {
  const { started, post, changes } = await server();
  const evil = await post("api/set", { target: "owy-knob", key: "volume", value: 80 }, { "content-type": "text/plain", origin: "https://evil.example" });
  expect(evil.status).toBe(403);
  expect(changes).toEqual([]);
  // The page's own fetches carry the loopback origin and keep working.
  const own = await post("api/set", { target: "owy-knob", key: "volume", value: 40 }, { origin: new URL(started.url).origin });
  expect(own.status).toBe(200);
});

it("answers only to this machine's names (a rebound DNS name gets nothing)", async () => {
  const { port } = await server();
  const status = await new Promise<number>((resolve, reject) => {
    request({ host: "127.0.0.1", port, path: "/api/state", headers: { host: `evil.example:${port}`, ...AUTH } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    })
      .on("error", reject)
      .end();
  });
  expect(status).toBe(421);
});
