import * as z from "zod";

import { CommunitySchema, RecurringSlotSchema } from "../communities/schemas";
import { CohostInvitationSchema, OrganizerEventSchema, ShowUpSchema } from "../events/schemas";
import { RequestStatusSchema } from "../venues/schemas";

export const SummaryInputSchema = z.object({ communityId: z.string().min(1) });

const Person = z.object({ id: z.string(), name: z.string(), image: z.string().nullable() });

/**
 * Everything the panel's frame and Inicio show about a community, in one read: what's ahead, what
 * needs an answer, what clashes and what the team did. Other communities appear only as the
 * calendar already shows them (a hold without its title).
 */
export const PanelSummarySchema = z.object({
  /** The community itself: its health line, the onboarding checklist and its usual day */
  community: z.object({
    status: CommunitySchema.shape.status,
    pausedUntil: z.string().nullable(),
    recurringSlot: RecurringSlotSchema.nullable(),
    hasDescription: z.boolean(),
    topics: z.array(z.string()),
  }),
  /** The start of the last published event that already ended */
  lastEventAt: z.string().nullable(),
  /** The team: everyone with a role, and the organizers (editor and up) who did something lately */
  team: z.object({ size: z.number(), activeOrganizers: z.number() }),
  /** Published events that ended less than CLOSE_OUT_DAYS ago and nobody closed out yet */
  closeOut: z.array(z.object({ id: z.string(), name: z.string(), endDate: z.string() })),
  /** Lugares ocupados (anotados, their +1s and seats offered) per event ahead */
  seats: z.record(z.string(), z.number()),
  /** Tasks of this community's events assigned to the viewer, not done, due by tomorrow */
  myTasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      eventId: z.string(),
      eventName: z.string(),
      /** "YYYY-MM-DD" */
      day: z.string(),
    })
  ),
  /** Talks proposed to this community (named, not to all of OWU) that nobody took yet */
  talkInbox: z.number(),
  /** Published and still ahead, soonest first */
  ahead: z.array(OrganizerEventSchema),
  /** Every draft: the live holds, the lapsed ones, the ones without a date */
  drafts: z.array(OrganizerEventSchema),
  /** The first of `ahead`: seats taken (with +1s) and people waiting */
  nextSeats: z.object({ taken: z.number(), waiting: z.number() }).nullable(),
  showUp: ShowUpSchema,
  followers: z.number(),
  /** Published events dated this calendar year, past and ahead */
  publishedThisYear: z.number(),
  /** Date polls from other communities still waiting for this one's answer */
  polls: z.array(z.object({ id: z.string(), title: z.string(), asker: z.string() })),
  invitations: z.array(CohostInvitationSchema),
  /** Space requests to look at: a host silent for 48 h (it expires at 72 h), or one that just answered */
  venueRequests: z.array(
    z.object({
      id: z.string(),
      venueName: z.string(),
      /** pending, accepted or declined */
      status: RequestStatusSchema,
      createdAt: z.string(),
      expiresAt: z.string(),
      respondedAt: z.string().nullable(),
    })
  ),
  /** Another community's similar event or hold the same day as one of ours (the next two months) */
  conflicts: z.array(
    z.object({
      eventId: z.string(),
      eventName: z.string(),
      day: z.string(),
      other: z.object({
        id: z.string(),
        communityName: z.string(),
        /** Null for a hold: who reserved shows, not for what */
        title: z.string().nullable(),
        kind: z.enum(["event", "hold"]),
        start: z.string(),
      }),
    })
  ),
  /** The latest changes to the community's events, newest first */
  activity: z.array(
    z.object({
      id: z.string(),
      verb: z.string(),
      summary: z.string(),
      actor: Person.nullable(),
      createdAt: z.string(),
      eventId: z.string(),
      eventName: z.string(),
    })
  ),
});

export type PanelSummary = z.infer<typeof PanelSummarySchema>;
