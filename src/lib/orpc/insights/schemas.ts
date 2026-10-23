import * as z from "zod";

export const CommunityRefSchema = z.object({ communityId: z.string().min(1) });

const RatioSchema = z.object({ part: z.number(), of: z.number() });

/** One past event's numbers. `came` is null when the door wasn't used: then nobody knows. */
export const EventNumbersSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  /** People who kept their seat */
  seated: z.number(),
  came: z.number().nullable(),
  /** Of who came (or kept their seat, without the door), how many for the first time */
  firstTimers: RatioSchema,
  /** The post-event survey's NPS, with how many answered it */
  nps: z.number().nullable(),
  responses: z.number(),
});

/**
 * A community's numbers (or OWU's, across every community): aggregates only, never a person.
 * Every rate comes with its counts.
 */
export const InsightsSchema = z.object({
  health: z.enum(["activa", "en-riesgo", "dormida", "en-pausa"]),
  lastEventAt: z.string().nullable(),
  daysSinceLastEvent: z.number().nullable(),
  followers: z.number(),
  /** Editors and up, and how many did something in the panel in the last 90 days */
  organizers: z.object({ active: z.number(), total: z.number() }),
  /** Published events per quarter, the last 8, oldest first */
  quarters: z.array(z.object({ label: z.string(), events: z.number() })),
  /** The last 12 past events, newest first */
  events: z.array(EventNumbersSchema),
  /** Over those of the last 12 where the door was used */
  showRate: z.object({ seated: z.number(), came: z.number(), events: z.number() }),
  /** First-timers in the last 6 months (the last event aside) and how many came again */
  secondVisit: z.object({ firstTimers: z.number(), returned: z.number() }),
  /** People who came in the last 6 months and how many had come before */
  returning: z.object({ people: z.number(), before: z.number() }),
  /** Who gave talks in the last 12 months: their only talk here (new), or not the first (repeat) */
  speakers: z.object({ speakers: z.number(), new: z.number(), repeat: z.number() }),
  publicStats: z.boolean(),
});

/** The team's editors and up, and when each last did something in the community */
export const OrganizersSchema = z.object({
  active: z.number(),
  people: z.array(
    z.object({ userId: z.string(), name: z.string(), role: z.string(), lastActiveAt: z.string().nullable() })
  ),
});

/** For staff: every community at a glance, and OWU as a whole */
export const OwuInsightsSchema = z.object({
  owu: InsightsSchema.omit({ health: true, publicStats: true, organizers: true }),
  communities: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      health: InsightsSchema.shape.health,
      daysSinceLastEvent: z.number().nullable(),
      events12m: z.number(),
      came12m: z.number(),
      secondVisit: InsightsSchema.shape.secondVisit,
      organizers: InsightsSchema.shape.organizers,
      publicStats: z.boolean(),
    })
  ),
});

const YearSchema = z.object({
  year: z.number(),
  events: z.number(),
  /** Distinct people who came to at least one */
  people: z.number(),
  /** Of them, first time at any OWU event (or at the community's, per community) */
  firstTimers: z.number(),
});

/** OWU's public impact page: yearly totals, and per community only for those that opted in */
export const ImpactSchema = z.object({
  years: z.array(YearSchema.extend({ communities: z.number() })),
  communities: z.array(z.object({ slug: z.string(), name: z.string(), years: z.array(YearSchema) })),
});

export const SetPublicStatsSchema = CommunityRefSchema.extend({ publicStats: z.boolean() });

const FileSchema = z.object({ filename: z.string(), content: z.string() });
/** The community's data: one CSV per dataset, and everything aggregate as JSON */
export const ExportSchema = z.object({ csv: z.array(FileSchema), json: FileSchema });

export type Insights = z.infer<typeof InsightsSchema>;
export type OwuInsights = z.infer<typeof OwuInsightsSchema>;
export type Impact = z.infer<typeof ImpactSchema>;
