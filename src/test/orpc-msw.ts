import { createHTTPUtils } from "@orpc/experimental-msw";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";

import { router } from "lib/orpc/router";

/**
 * Typed MSW handlers for any procedure, served by a real RPC handler, so the
 * wire format, validation and error envelopes are the production ones:
 * `server.use(api.countdown.getState.handler(() => state))`.
 */
export const api = createHTTPUtils(router, {
  prefix: "/api/orpc",
  handler: (procedures) => new RPCHandler(procedures, { plugins: [new BatchHandlerPlugin()] }),
});
