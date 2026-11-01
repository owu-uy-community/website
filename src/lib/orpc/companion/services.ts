import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { BridgeRouter } from "../../../../owy/companion/bridge/src/web/rpc";
import type {
  AudioRoutingSnapshot,
  HostMicProbe,
  SetAudioRoutingInput,
  SetHostMicInput,
  SetPitchInput,
} from "./schemas";

/**
 * The companion bridge is a Node process on the venue laptop (it needs the LAN,
 * the audio hardware and persistent sockets, none of which exist on Vercel).
 * It serves a typed oRPC router on its loopback settings port; these procedures
 * proxy it, so they only do something when this site runs on that laptop (or
 * COMPANION_BRIDGE_SETTINGS_URL points at a tunnel) — elsewhere: unreachable.
 */
const rpcUrl = () => process.env.COMPANION_BRIDGE_SETTINGS_URL ?? "http://127.0.0.1:3313/rpc";

function bridge(timeoutMs = 5000): RouterClient<BridgeRouter> {
  // oRPC v2 links take the host and the path apart (a URL's pathname always starts with "/").
  const settings = new URL(rpcUrl());
  const link = new RPCLink({
    origin: settings.origin,
    url: settings.pathname as `/${string}`,
    fetch: (request, init) => fetch(request, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) }),
  });
  return createORPCClient(link);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function reach(
  run: (client: RouterClient<BridgeRouter>) => Promise<Pick<AudioRoutingSnapshot, "devices" | "hostMic">>
): Promise<AudioRoutingSnapshot> {
  try {
    const snapshot = await run(bridge());
    return { reachable: true, devices: snapshot.devices, ...(snapshot.hostMic ? { hostMic: snapshot.hostMic } : {}) };
  } catch (error) {
    return { reachable: false, error: message(error), devices: [] };
  }
}

export const getAudioRouting = () => reach((client) => client.settings.get());

export const setAudioRouting = (input: SetAudioRoutingInput) => reach((client) => client.settings.set(input));

/** Modo pitch on/off and what Owy says back, per device. */
export const setPitch = (input: SetPitchInput) => reach((client) => client.settings.setPitch(input));

/** Which input of the Mac (and which side of a stereo receiver) feeds the `host` route. */
export const setHostMic = (input: SetHostMicInput) => reach((client) => client.settings.setHostMic(input));

/** Records a few seconds from the Mac's mic on the bridge and reports how loud it was. */
export async function probeHostMic(input: { ms: number }): Promise<HostMicProbe> {
  try {
    return { reachable: true, ...(await bridge(input.ms + 5000).settings.probeHostMic(input)) };
  } catch (error) {
    return { reachable: false, error: message(error), peak: 0, rms: 0, seconds: 0 };
  }
}
