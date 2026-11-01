import { afterEach, expect, it } from "vitest";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { loadConfig } from "../src/config";
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

async function server(hostMic?: RoutableHostMic) {
  const config = loadConfig({});
  const port = 20000 + Math.floor(Math.random() * 20000); // ephemeral; the schema forbids 0
  const knob = fakeSession("owy-knob");
  const started = await startSettingsServer(
    [knob],
    { ...config, COMPANION_SETTINGS_PORT: port },
    createLogger("rpc-test", "error"),
    hostMic
  );
  cleanup.push(started.close);
  const rpc = new URL(started.rpcUrl);
  const client: RouterClient<BridgeRouter> = createORPCClient(new RPCLink({ origin: rpc.origin, url: rpc.pathname as `/${string}` }));
  return { knob, client, started };
}

it("serves the routing procedures over oRPC and mirrors them as plain JSON", async () => {
  const { knob, client, started } = await server();
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
  // The bridge page uses the plain-JSON mirror of the same procedures.
  const rest = await (await fetch(`${started.url}api/settings`)).json();
  expect(rest).toEqual(after);
  const posted = await (
    await fetch(`${started.url}api/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "owy-knob", mic: "laptop" }),
    })
  ).json();
  expect(posted.devices[0]).toMatchObject({ mic: "laptop", output: "laptop" });
});

it("flips modo pitch and what Owy says back per device, over oRPC and the JSON mirror", async () => {
  const { knob, client, started } = await server();
  const after = await client.settings.setPitch({ deviceId: "owy-knob", mode: true });
  expect(after.devices[0].pitch).toEqual({ mode: true, voice: "confirm", source: "env" });
  expect(knob.pitch.mode).toBe(true);
  const posted = await (
    await fetch(`${started.url}api/settings/pitch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "owy-knob", voice: "silent" }),
    })
  ).json();
  expect(posted.devices[0].pitch).toEqual({ mode: true, voice: "silent", source: "env" });
  // @ts-expect-error — three levels only
  await expect(client.settings.setPitch({ deviceId: "owy-knob", voice: "loud" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(client.settings.setPitch({ deviceId: "nope", mode: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("refuses writes posted from another site, even as a plain form", async () => {
  const { knob, started } = await server();
  const evil = await fetch(`${started.url}api/settings/pitch`, {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "https://evil.example" },
    body: JSON.stringify({ deviceId: "owy-knob", mode: true }),
  });
  expect(evil.status).toBe(403);
  expect(knob.pitch.mode).toBe(false);
  const rpc = await fetch(`${started.rpcUrl}/settings/set`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ json: { deviceId: "owy-knob", mic: "laptop" } }),
  });
  expect(rpc.status).toBe(403);
  expect(knob.routes.mic).toBe("device");
  // The page's own fetches carry the loopback origin and keep working.
  const own = await fetch(`${started.url}api/settings/pitch`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(started.url).origin },
    body: JSON.stringify({ deviceId: "owy-knob", mode: true }),
  });
  expect(own.status).toBe(200);
});

it("rejects unknown devices and invalid routes with oRPC errors", async () => {
  const { client } = await server();
  await expect(client.settings.set({ deviceId: "nope", mic: "laptop" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // @ts-expect-error — the contract only allows device | laptop | host
  await expect(client.settings.set({ deviceId: "owy-knob", mic: "ffmpeg" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

it("routes a device to the Mac's mic, picks the input and its side, and tests it", async () => {
  const hostMic = fakeHostMic();
  const { knob, client, started } = await server(hostMic);
  const before = await client.settings.get();
  expect(before.hostMic).toEqual({ name: null, channel: "mix", health: "off", available: ["MacBook Pro Microphone", "DJI Mic 2"] });
  const routed = await client.settings.set({ deviceId: "owy-knob", mic: "host" });
  expect(routed.devices[0].mic).toBe("host");
  expect(knob.routes.mic).toBe("host");
  const picked = await client.settings.setHostMic({ name: "DJI Mic 2" });
  expect(picked.hostMic).toMatchObject({ name: "DJI Mic 2", channel: "mix", health: "open" });
  // The page's JSON mirror: the side of a stereo receiver keeps the input.
  const side = await (
    await fetch(`${started.url}api/settings/host-mic`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "L" }),
    })
  ).json();
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
