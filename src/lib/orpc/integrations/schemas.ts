import * as z from "zod";

export const CommunityRefSchema = z.object({ communityId: z.string().min(1) });
export const EventRefSchema = z.object({ communityId: z.string().min(1), eventId: z.string().min(1) });

export const ConnectionSchema = z.object({
  status: z.enum(["active", "error"]),
  accountName: z.string(),
  error: z.string().nullable(),
  /** Without a webhook (it couldn't be made), the attendee list catches up by reading every 30 s */
  webhook: z.boolean(),
  connectedAt: z.string(),
});

export const IntegrationsSchema = z.object({
  /** The OAuth app is set up on this server (EVENTBRITE_CLIENT_ID/SECRET) */
  configured: z.boolean(),
  eventbrite: ConnectionSchema.nullable(),
});

export const PublicationSchema = z.object({
  status: z.enum(["pending", "published", "failed"]),
  externalUrl: z.string().nullable(),
  error: z.string().nullable(),
  /** When the next push goes, while one is waiting */
  nextAttemptAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const EventIntegrationSchema = z.object({
  /** The community has a working Eventbrite connection */
  connected: z.boolean(),
  publication: PublicationSchema.nullable(),
});

export type Integrations = z.infer<typeof IntegrationsSchema>;
export type EventIntegration = z.infer<typeof EventIntegrationSchema>;
