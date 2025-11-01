import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "./router";

/**
 * oRPC Client with Batch Request Support
 *
 * This client is configured with the BatchLinkPlugin to automatically combine
 * multiple oRPC requests into a single HTTP request, reducing network overhead.
 *
 * Benefits:
 * - Reduces the number of HTTP requests on page load
 * - Lower latency by avoiding multiple round-trips
 * - Better performance on slower connections
 * - Efficient use of serverless function invocations
 *
 * Mode:
 * - Streaming (browser): Responses are sent as they arrive, no blocking
 * - Buffered (server): All responses are collected before sending (SSR compatibility)
 *
 * All requests are batched by default unless they involve unsupported data types
 * (File, Blob, AsyncIterator). The plugin will automatically fall back to
 * individual requests for these cases.
 */
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
  plugins: [
    new BatchLinkPlugin({
      // Use streaming mode for better performance (unless in environments that don't support it)
      mode: typeof window === "undefined" ? "buffered" : "streaming",
      groups: [
        {
          // Batch all requests by default
          condition: () => true,
          context: {}, // Context for the batch request
        },
      ],
    }),
  ],
});

// Export the fully typed oRPC client
export const client: RouterClient<AppRouter> = createORPCClient(link);

// Export the official oRPC Tanstack Query utils
export const orpc = createTanstackQueryUtils(client);

// Export the router type for use in other parts of the app
export type { AppRouter };

// Re-export types from features for external usage
export type { StickyNote } from "./sticky-notes";
export type { CountdownState, UpdateCountdownStateInput } from "./countdown/schemas";
