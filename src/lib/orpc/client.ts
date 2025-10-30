import { RPCLink } from "@orpc/client/fetch";
import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "./router";

// Create a properly configured oRPC link
const link = new RPCLink({
  url: `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/orpc`,
  headers: async () => {
    // Could add authentication headers here in the future
    return {};
  },
  fetch: async (url, options) => {
    const response = await fetch(url, {
      ...options,
      credentials: "include", // Include cookies for authentication
    });
    return response;
  },
});

// Export the fully typed oRPC client
export const client: RouterClient<AppRouter> = createORPCClient(link);

// Export the official oRPC Tanstack Query utils
export const orpc = createTanstackQueryUtils(client);

// Export the router type for use in other parts of the app
export type { AppRouter };

// Re-export types from features for external usage
export type { StickyNote } from "./sticky-notes";
export type { CountdownState, UpdateCountdownStateInput } from "./countdown";
