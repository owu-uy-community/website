import { afterEach, expect, it } from "vitest";
import { request } from "node:http";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { loadConfig } from "../src/config";
import type { ControlPlane } from "../src/control/plane";
import { createLogger } from "../src/log";
import { startSettingsServer } from "../src/web/settings";
import type { BridgeRouter, RoutableHostMic, RoutableSession } from "../src/web/rpc";
import type { MicRoute } from "../src/audio/route";
import type { PitchVoice } from "../src/pitch-flow";

// The same typed client the Next.js admin uses, against the real loopback server.
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

const SECRET = "clave-de-prueba";
const AUTH = { authorization: `Basic ${Buffer.from(`owy:${SECRET}`).toString("base64")}` };

function fakeSession(id: string): RoutableSession & {
  routes: { mic: MicRoute; output: "device" | "laptop" };
  pitch: { mode: boolean; voice: PitchVoice };
} {
  const routes: { mic: MicRoute; output: "device" | "laptop" } = { mic: "device", output: "device" };
  const pitch: { mode: boolean; voice: PitchVoice } = { mode: false, voice: "confirm" };
  return {
    id,
    connected: true,
    hasPeer: false,
    routes,
    pitch,
    audioRouting: () => ({ ...routes, source: "device" as const }),
    setAudioRouting: (which: "mic" | "output", route: MicRoute) => {
      if (which === "mic") routes.mic = route;
      else routes.output = route === "laptop" ? "laptop" : "device";
    },
    pitchSettings: () => ({ ...pitch, source: "env" as const }),
    setPitchMode: (on) => {
      pitch.mode = on;
    },
    setPitchVoice: (voice) => {
      pitch.voice = voice;
    },
  };
}

function fakeHostMic(): RoutableHostMic & { selected: [string | null, string][] } {
  const state = { name: null as string | null, channel: "mix" as "L" | "R" | "mix" };
  const selected: [string | null, string][] = [];
  return {
    selected,
    status: () => ({ ...state, health: state.name ? ("open" as const) : ("off" as const) }),
    devices: async () => ["MacBook Pro Microphone", "DJI Mic 2"],
    select: (name, channel = "mix") => {
      state.name = name;
      state.channel = channel;
      selected.push([name, channel]);
    },
    probe: async () => ({ peak: 0.31, rms: 0.08, seconds: 4, health: "open" as const }),
  };
}

/** What the page needs from the control plane, recorded. */
function fakeControl() {
  const changes: unknown[][] = [];
  const commands: unknown[] = [];
  const control = {
    status: () => ({ version: "test", machine: "mac", values: {}, devices: [] }),
    rows: () => [],
    change: (...args: unknown[]) => (changes.push(args), { ok: true }),
    runLocal: async (command: unknown) => (commands.push(command), { ok: true, data: null }),
  } as unknown as ControlPlane;
  return { control, changes, commands };
}

async function server(hostMic?: RoutableHostMic) {
  const config = loadConfig({});
  const port = 20000 + Math.floor(Math.random() * 20000); // ephemeral; the schema forbids 0
  const knob = fakeSession("owy-knob");
  const { control, changes, commands } = fakeControl();
  const started = await startSettingsServer({
    control,
    config: { ...config, COMPANION_SETTINGS_PORT: port, COMPANION_BRIDGE_SECRET: SECRET },
    logger: createLogger("rpc-test", "error"),
    sessions: [knob],
    hostMic,
  });
  cleanup.push(started.close);
  const rpc = new URL(started.rpcUrl);
  const client: RouterClient<BridgeRouter> = createORPCClient(new RPCLink({ origin: rpc.origin, url: rpc.pathname as `/${string}` }));
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(new URL(path, started.url), {
      method: "POST",
      headers: { "content-type": "application/json", ...AUTH, ...headers },
      body: JSON.stringify(body),
    });
  return { knob, client, started, post, changes, commands, port };
}

it("serves the routing procedures over oRPC", async () => {
  const { knob, client } = await server();
  expect(await client.settings.get()).toEqual({
    devices: [
      {
        id: "owy-knob",
        connected: true,
        mic: "device",
        output: "device",
        source: "device",
        peer: false,
        pitch: { mode: false, voice: "confirm", source: "env" },
      },
    ],
  });
  const after = await client.settings.set({ deviceId: "owy-knob", output: "laptop" });
  expect(after.devices[0]).toMatchObject({ mic: "device", output: "laptop" });
  expect(knob.routes.output).toBe("laptop");
});

it("flips modo pitch and what Owy says back per device", async () => {
  const { knob, client } = await server();
  const after = await client.settings.setPitch({ deviceId: "owy-knob", mode: true });
  expect(after.devices[0].pitch).toEqual({ mode: true, voice: "confirm", source: "env" });
  expect(knob.pitch.mode).toBe(true);
  // @ts-expect-error — three levels only
  await expect(client.settings.setPitch({ deviceId: "owy-knob", voice: "loud" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(client.settings.setPitch({ deviceId: "nope", mode: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("rejects unknown devices and invalid routes with oRPC errors", async () => {
  const { client } = await server();
  await expect(client.settings.set({ deviceId: "nope", mic: "laptop" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // @ts-expect-error — the contract only allows device | laptop | host
  await expect(client.settings.set({ deviceId: "owy-knob", mic: "ffmpeg" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

it("routes a device to the Mac's mic, picks the input and its side, and tests it", async () => {
  const hostMic = fakeHostMic();
  const { knob, client } = await server(hostMic);
  const before = await client.settings.get();
  expect(before.hostMic).toEqual({ name: null, channel: "mix", health: "off", available: ["MacBook Pro Microphone", "DJI Mic 2"] });
  const routed = await client.settings.set({ deviceId: "owy-knob", mic: "host" });
  expect(routed.devices[0].mic).toBe("host");
  expect(knob.routes.mic).toBe("host");
  const picked = await client.settings.setHostMic({ name: "DJI Mic 2" });
  expect(picked.hostMic).toMatchObject({ name: "DJI Mic 2", channel: "mix", health: "open" });
  // The side of a stereo receiver keeps the input.
  const side = await client.settings.setHostMic({ channel: "L" });
  expect(side.hostMic).toMatchObject({ name: "DJI Mic 2", channel: "L" });
  expect(hostMic.selected).toEqual([
    ["DJI Mic 2", "mix"],
    ["DJI Mic 2", "L"],
  ]);
  expect(await client.settings.probeHostMic({ ms: 1000 })).toEqual({ peak: 0.31, rms: 0.08, seconds: 4, health: "open" });
});

it("a settings server without the Mac's mic reports none and refuses to pick one", async () => {
  const { client } = await server();
  expect((await client.settings.get()).hostMic).toBeUndefined();
  await expect(client.settings.setHostMic({ name: "DJI" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("the page asks for the bridge's secret, then reads and writes through the control plane", async () => {
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
  const { knob, started, post, changes } = await server();
  const evil = await post("api/set", { target: "owy-knob", key: "volume", value: 80 }, { "content-type": "text/plain", origin: "https://evil.example" });
  expect(evil.status).toBe(403);
  expect(changes).toEqual([]);
  const rpc = await fetch(`${started.rpcUrl}/settings/set`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ json: { deviceId: "owy-knob", mic: "laptop" } }),
  });
  expect(rpc.status).toBe(403);
  expect(knob.routes.mic).toBe("device");
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
