import * as z from "zod";

/**
 * What this server has set up, for the settings pages. Booleans and public facts only: a key,
 * a token or a connection string never leaves the server, not even masked.
 */
export const IntegrationsSchema = z.object({
  /** Owy's outbound channels (lib/owy/messaging). */
  owy: z.object({ telegram: z.boolean(), slack: z.boolean(), staffDm: z.boolean() }),
  /** The AI Gateway: an API key, or the deployment's OIDC token. */
  ai: z.object({ configured: z.boolean() }),
  eventbrite: z.object({ apiKey: z.boolean(), webhookSecret: z.boolean() }),
  realtime: z.object({
    /** Redis carries broadcasts between server instances. */
    redis: z.boolean(),
    /** Sockets live on the separate sidecar (local development and e2e). */
    sidecar: z.boolean(),
  }),
  version: z.object({
    /** The deployed commit, when the host says which one it is. */
    commit: z.string().nullable(),
    environment: z.enum(["production", "preview", "development", "local"]),
  }),
});

export type Integrations = z.infer<typeof IntegrationsSchema>;
