import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import type { AppRouter } from "./router";

/**
 * The browser's oRPC client. Calls made in the same tick share one HTTP request
 * (batching), except card reading: its payload is a photo and it streams, so
 * it travels alone — which also lets e2e tests intercept it by URL.
 *
 * Server components don't use this: they call procedures in-process through
 * `caller` (./server.ts).
 */
const link = new RPCLink({
  url: "/api/orpc",
  plugins: [
    new BatchLinkPlugin({
      groups: [{ condition: () => true, context: {} }],
      filter: ({ path }) => path[0] !== "ocr",
    }),
  ],
});

export const client: RouterClient<AppRouter> = createORPCClient(link);

/** TanStack Query helpers: `orpc.tracks.list.queryOptions({ input })`, `.mutationOptions()`, `.key()`. */
export const orpc = createTanstackQueryUtils(client);

export type { AppRouter };

// Re-export types from features for external usage
export type { StickyNote } from "./sticky-notes";
export type { CountdownState, UpdateCountdownStateInput } from "./countdown/schemas";
