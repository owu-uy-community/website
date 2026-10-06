import { afterEach, expect, it } from "vitest";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { loadConfig } from "../src/config";
import { createLogger } from "../src/log";
import { startSettingsServer } from "../src/web/settings";
import type { BridgeRouter, RoutableSession } from "../src/web/rpc";

// The same typed client the Next.js admin uses, against the real loopback server.
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

function fakeSession(id: string): RoutableSession & { routes: Record<"mic" | "output", "device" | "laptop"> } {
  const routes = { mic: "device" as const, output: "device" as const } as Record<"mic" | "output", "device" | "laptop">;
  return {
    id,
    connected: true,
    hasPeer: false,
    routes,
    audioRouting: () => ({ ...routes, source: "device" as const }),
    setAudioRouting: (which, route) => {
      routes[which] = route;
    },
  };
}

async function server() {
  const config = loadConfig({});
  const port = 20000 + Math.floor(Math.random() * 20000); // ephemeral; the schema forbids 0
  const knob = fakeSession("owy-knob");
  const started = await startSettingsServer([knob], { ...config, COMPANION_SETTINGS_PORT: port }, createLogger("rpc-test", "error"));
  cleanup.push(started.close);
  const rpc = new URL(started.rpcUrl);
  const client: RouterClient<BridgeRouter> = createORPCClient(new RPCLink({ origin: rpc.origin, url: rpc.pathname as `/${string}` }));
  return { knob, client, started };
}

it("serves the routing procedures over oRPC and mirrors them as plain JSON", async () => {
  const { knob, client, started } = await server();
  expect(await client.settings.get()).toEqual({
    devices: [{ id: "owy-knob", connected: true, mic: "device", output: "device", source: "device", peer: false }],
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

it("rejects unknown devices and invalid routes with oRPC errors", async () => {
  const { client } = await server();
  await expect(client.settings.set({ deviceId: "nope", mic: "laptop" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // @ts-expect-error — the contract only allows device | laptop
  await expect(client.settings.set({ deviceId: "owy-knob", mic: "ffmpeg" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
