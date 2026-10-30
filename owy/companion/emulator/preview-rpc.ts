// Loopback-only preview: the two audio-routing procedures the workbench's
// AudioRoutingCard calls, served without the site (no DB, no admin session) so
// a browser on the venue laptop can attach as a physical device's laptop audio.
// Same services and batch protocol as src/app/api/orpc; preview.mjs only
// accepts 127.0.0.1/localhost:3311.
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";

import { SetAudioRoutingSchema } from "../../../src/lib/orpc/companion/schemas";
import { getAudioRouting, setAudioRouting } from "../../../src/lib/orpc/companion/services";

const router = {
  companion: {
    getAudioRouting: os.handler(() => getAudioRouting()),
    setAudioRouting: os.input(SetAudioRoutingSchema).handler(({ input }) => setAudioRouting(input)),
  },
};

const handler = new RPCHandler(router, { plugins: [new BatchHandlerPlugin()] });

export async function handleRpc(request: Request): Promise<Response | undefined> {
  const { response } = await handler.handle(request, { prefix: "/api/orpc", context: {} });
  return response;
}
