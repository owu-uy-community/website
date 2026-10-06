import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { BridgeRouter } from "../../../../owy/companion/bridge/src/web/rpc";
import type { AudioRoutingSnapshot, SetAudioRoutingInput } from "./schemas";

/**
 * The companion bridge is a Node process on the venue laptop (it needs the LAN,
 * the audio hardware and persistent sockets, none of which exist on Vercel).
 * It serves a typed oRPC router on its loopback settings port; these procedures
 * proxy it, so they only do something when this site runs on that laptop (or
 * COMPANION_BRIDGE_SETTINGS_URL points at a tunnel) — elsewhere: unreachable.
 */
const rpcUrl = () => process.env.COMPANION_BRIDGE_SETTINGS_URL ?? "http://127.0.0.1:3313/rpc";

function bridge(): RouterClient<BridgeRouter> {
  // oRPC v2 links take the host and the path apart (a URL's pathname always starts with "/").
  const settings = new URL(rpcUrl());
  const link = new RPCLink({
    origin: settings.origin,
    url: settings.pathname as `/${string}`,
    fetch: (request, init) => fetch(request, { ...init, cache: "no-store", signal: AbortSignal.timeout(5000) }),
  });
  return createORPCClient(link);
}

async function reach(
  run: (client: RouterClient<BridgeRouter>) => Promise<{ devices: AudioRoutingSnapshot["devices"] }>
): Promise<AudioRoutingSnapshot> {
  try {
    const snapshot = await run(bridge());
    return { reachable: true, devices: snapshot.devices };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error), devices: [] };
  }
}

export const getAudioRouting = () => reach((client) => client.settings.get());

export const setAudioRouting = (input: SetAudioRoutingInput) => reach((client) => client.settings.set(input));
