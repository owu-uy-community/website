import * as z from "zod";

/** Links the issue renders as hrefs: web pages only. */
const WebUrl = z.url({ protocol: /^https?$/ });
/** Thread permalinks point into the OWU Slack, nowhere else. */
const SlackUrl = z.url({ protocol: /^https$/, hostname: /(^|\.)slack\.com$/ });

/** "2026-10-26": the Monday the issue covers. */
export const WeekStartSchema = z.iso.date().refine((value) => new Date(`${value}T12:00:00Z`).getUTCDay() === 1, {
  message: "La semana empieza un lunes",
});

export const SemanarioSectionsSchema = z.object({
  events: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        group: z.string().trim().max(200),
        start: z.iso.datetime({ offset: true }),
        venue: z.string().trim().max(200).nullable(),
        url: WebUrl,
      })
    )
    .max(30)
    .default([]),
  threads: z
    .array(
      z.object({
        channel: z.string().regex(/^[\p{Ll}\p{N}][\p{Ll}\p{N}_-]{0,79}$/u, "Nombre de canal de Slack, sin #"),
        /** One line Owy writes about the thread; never the message itself */
        title: z.string().trim().min(1).max(200),
        permalink: SlackUrl,
        replies: z.number().int().min(0),
      })
    )
    .max(20)
    .default([]),
  jobs: z.object({ count: z.number().int().min(0), channelUrl: SlackUrl.nullable() }).nullable().default(null),
  newCommunities: z
    .array(z.object({ name: z.string().trim().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }))
    .max(20)
    .default([]),
});

export type SemanarioSections = z.infer<typeof SemanarioSectionsSchema>;

export const SemanarioIssueSchema = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  weekStart: z.string(),
  title: z.string(),
  intro: z.string(),
  sections: SemanarioSectionsSchema,
  status: z.enum(["draft", "published"]),
  publishedAt: z.iso.datetime().nullable(),
  reviewedBy: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export type SemanarioIssue = z.infer<typeof SemanarioIssueSchema>;

/** A published issue as the archive lists it */
export const SemanarioSummarySchema = SemanarioIssueSchema.pick({
  number: true,
  weekStart: true,
  title: true,
  intro: true,
  publishedAt: true,
}).extend({
  number: z.number().int(),
  counts: z.object({ events: z.number().int(), threads: z.number().int(), jobs: z.number().int() }),
});

export type SemanarioSummary = z.infer<typeof SemanarioSummarySchema>;

export const PublishedIssueSchema = SemanarioIssueSchema.extend({
  number: z.number().int(),
  prev: z.number().int().nullable(),
  next: z.number().int().nullable(),
});

export type PublishedIssue = z.infer<typeof PublishedIssueSchema>;

export const GetIssueSchema = z.object({ number: z.coerce.number().int().positive() });

const Title = z.string().trim().min(1).max(160);
const Intro = z.string().trim().max(4000);

export const SaveDraftSchema = z.object({
  weekStart: WeekStartSchema,
  title: Title,
  intro: Intro.default(""),
  sections: SemanarioSectionsSchema,
});

export const UpdateIssueSchema = z.object({
  id: z.string().min(1),
  title: Title.optional(),
  intro: Intro.optional(),
  sections: SemanarioSectionsSchema.optional(),
});

export const IssueIdSchema = z.object({ id: z.string().min(1) });
