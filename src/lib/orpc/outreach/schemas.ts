import * as z from "zod";

export const OutreachReasonSchema = z.enum([
  "en-riesgo",
  "dormida",
  "un-organizador",
  "contacto-viejo",
  "pedido-sin-respuesta",
]);

const CommunityRef = z.object({ id: z.string(), slug: z.string(), name: z.string() });

/** One reason a community needs a hand, with its team and when staff last wrote about it */
export const OutreachRowSchema = z.object({
  community: CommunityRef,
  reason: OutreachReasonSchema,
  /** Since when it's true (the last event, the oldest request…), when known */
  since: z.string().nullable(),
  why: z.string(),
  /** Editors and up; `active` did something in the panel in the last 90 days */
  team: z.array(z.object({ name: z.string(), role: z.string(), active: z.boolean() })),
  /** The last templated email about this reason, in the last 90 days */
  emailedAt: z.string().nullable(),
});

export const OutreachQueueSchema = z.object({
  rows: z.array(OutreachRowSchema),
  /** Requests to organize a community, waiting for staff */
  claims: z.array(z.object({ id: z.string(), community: CommunityRef, person: z.string(), createdAt: z.string() })),
  /** What staff marked lately */
  log: z.array(
    z.object({
      id: z.string(),
      community: z.string(),
      reason: OutreachReasonSchema,
      status: z.enum(["done", "snoozed"]),
      by: z.string().nullable(),
      at: z.string(),
      until: z.string().nullable(),
    })
  ),
});

export const OutreachTargetSchema = z.object({ communityId: z.string().min(1), reason: OutreachReasonSchema });
export const MarkOutreachSchema = OutreachTargetSchema.extend({
  status: z.enum(["done", "snoozed"]),
  note: z.string().trim().max(500).default(""),
});

export type OutreachQueue = z.infer<typeof OutreachQueueSchema>;
export type OutreachRow = z.infer<typeof OutreachRowSchema>;
