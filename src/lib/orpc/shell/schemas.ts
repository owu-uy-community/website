import * as z from "zod";

export const ShellStatusInputSchema = z.object({ eventId: z.string().min(1) });

const ClockBlockSchema = z.object({
  title: z.string(),
  /** "HH:MM" on the event's wall clock. */
  start: z.string(),
  end: z.string(),
});

export const PrepItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  meta: z.string(),
  done: z.boolean(),
  /** The admin page that fixes it, relative to the event's scope ("/admin/guion"). */
  href: z.string(),
});

/**
 * What the shell shows around every page: the event's phase and clock, the counts on the
 * nav, and the live rigs. One read, refreshed on a timer and on ops pings.
 */
export const ShellStatusSchema = z.object({
  event: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    communityId: z.string(),
    communityName: z.string(),
    communitySlug: z.string(),
    communityLogoUrl: z.string().nullable(),
    startDate: z.string(),
    endDate: z.string(),
    timezone: z.string(),
  }),
  /** Before the day, on it (from the start of its day to its end), or after. */
  phase: z.enum(["pre", "live", "post"]),
  /** Whole days until the start, on the event's calendar. */
  daysLeft: z.number(),
  me: z.object({
    siteAdmin: z.boolean(),
    role: z.string().nullable(),
    /** Every "resource:action" the caller holds in this event's community (src/lib/authz/catalog.ts). */
    permissions: z.array(z.string()),
  }),
  clock: z.object({
    current: ClockBlockSchema.nullable(),
    next: ClockBlockSchema.nullable(),
    /** Run-of-show drift in minutes (+ late), when a moment is running. */
    driftMin: z.number().nullable(),
  }),
  counts: z.object({
    talks: z.number(),
    moments: z.number(),
    tasks: z.number(),
    /** Null until the attendee mirror has synced once. */
    attendees: z.number().nullable(),
    checkedIn: z.number().nullable(),
    /** Announcements waiting for my "recibido". */
    unackedAnnouncements: z.number(),
    openIncidents: z.number(),
    criticalIncidents: z.number(),
    screensOnline: z.number(),
    screensTotal: z.number(),
  }),
  /** Site staff only (the rigs are OWU's): null for community members. */
  live: z
    .object({
      wallScene: z.string(),
      onAir: z.boolean(),
      obsConnected: z.boolean(),
      obsStreaming: z.boolean(),
      obsRecording: z.boolean(),
    })
    .nullable(),
  prep: z.array(PrepItemSchema),
});

export type ShellStatus = z.infer<typeof ShellStatusSchema>;
export type PrepItem = z.infer<typeof PrepItemSchema>;
