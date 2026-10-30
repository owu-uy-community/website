import * as z from "zod";

const Person = z.object({ id: z.string(), name: z.string(), image: z.string().nullable() });

const Moment = z.object({
  id: z.string(),
  title: z.string(),
  /** "HH:MM" planned, on the event's clock. */
  plannedStart: z.string(),
  durationMin: z.number(),
  fixed: z.boolean(),
  location: z.string().nullable(),
  owner: Person.nullable(),
  cueName: z.string().nullable(),
  owyMessage: z.string().nullable(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
});

export const TodayInputSchema = z.object({ eventId: z.string().min(1) });

/**
 * Everything Hoy shows, in one read: what the team needs before the day (Preparación), on it
 * (mission control) and after it (the report). Each block is null when its data doesn't exist
 * yet, so the page can say "not connected" instead of showing zeros.
 */
export const TodaySchema = z.object({
  generatedAt: z.string(),
  phase: z.enum(["pre", "live", "post"]),
  event: z.object({
    id: z.string(),
    name: z.string(),
    timezone: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    venueMapUrl: z.string().nullable(),
  }),

  registrations: z
    .object({
      attending: z.number(),
      today: z.number(),
      week: z.number(),
      /** Cumulative registrations per day, the last 30 days ("YYYY-MM-DD"). */
      series: z.array(z.object({ day: z.string(), total: z.number() })),
      syncedAt: z.string().nullable(),
    })
    .nullable(),

  checkins: z
    .object({
      checkedIn: z.number(),
      attending: z.number(),
      last15: z.number(),
      /** Check-ins per 5 minutes over the last hour, oldest first (12 values). */
      lastHour: z.array(z.number()),
      byDevice: z.array(z.object({ device: z.string(), count: z.number() })),
      syncedAt: z.string().nullable(),
    })
    .nullable(),

  slot: z.object({
    current: z.object({ name: z.string(), start: z.string(), end: z.string() }).nullable(),
    next: z.object({ name: z.string(), start: z.string(), end: z.string() }).nullable(),
    index: z.number(),
    total: z.number(),
  }),

  rooms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string().nullable(),
      capacity: z.number().nullable(),
      hasTV: z.boolean(),
      status: z.enum(["open", "full", "evacuate"]),
      current: z.object({ trackId: z.string(), title: z.string(), speaker: z.string().nullable() }).nullable(),
      next: z.object({ trackId: z.string(), title: z.string(), start: z.string() }).nullable(),
      openIncident: z.string().nullable(),
    })
  ),

  staff: z.object({
    /** At the venue now (arrived, not gone). */
    onSite: z.number(),
    /** People with a task on the event's days. */
    expected: z.number(),
    /** Assigned to something that started ≥ 5 min ago and not arrived (no-shows excluded). */
    late: z.array(Person.extend({ task: z.string() })),
    noShows: z.number(),
    /** On site with nothing assigned right now. */
    free: z.array(Person),
    recent: z.array(Person),
  }),

  urgent: z
    .object({
      id: z.string(),
      body: z.string(),
      author: z.string().nullable(),
      createdAt: z.string(),
      acked: z.number(),
      expected: z.number(),
      pending: z.array(Person),
    })
    .nullable(),

  onAir: z
    .object({
      scene: z.string(),
      sceneTitle: z.string(),
      since: z.string(),
      obsConnected: z.boolean(),
      streaming: z.boolean(),
      recording: z.boolean(),
    })
    .nullable(),

  rundown: z.object({
    total: z.number(),
    current: Moment.nullable(),
    next: Moment.nullable(),
    upcoming: z.array(Moment),
    driftMin: z.number().nullable(),
  }),

  incidents: z.object({
    open: z.number(),
    critical: z.number(),
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        severity: z.enum(["low", "medium", "high", "critical"]),
        category: z.string(),
        status: z.enum(["open", "in_progress", "resolved"]),
        room: z.string().nullable(),
        assignee: Person.nullable(),
        createdAt: z.string(),
      })
    ),
  }),

  activity: z.array(
    z.object({ id: z.string(), verb: z.string(), summary: z.string(), actor: Person.nullable(), createdAt: z.string() })
  ),

  screens: z.object({
    online: z.number(),
    total: z.number(),
    items: z.array(
      z.object({ id: z.string(), name: z.string(), path: z.string(), online: z.boolean(), lastSeenAt: z.string() })
    ),
  }),

  /** Staffing per kind of task ("Host de sala", "Acreditación"…): people assigned vs the minimum asked. */
  coverage: z.array(z.object({ group: z.string(), have: z.number(), need: z.number() })),

  comms: z.object({
    channels: z.object({ telegram: z.boolean(), slack: z.boolean(), staffDm: z.boolean() }),
    lastSent: z.object({ body: z.string(), channel: z.string(), sentAt: z.string() }).nullable(),
    nextScheduled: z.object({ body: z.string(), channel: z.string(), scheduledAt: z.string() }).nullable(),
  }),

  report: z
    .object({
      /** Check-ins per 10 minutes on the day ("HH:MM", count). */
      arrival: z.array(z.object({ at: z.string(), count: z.number() })),
      checkedIn: z.number(),
      attending: z.number(),
      drift: z.array(
        z.object({
          title: z.string(),
          plannedStart: z.string(),
          actualStart: z.string().nullable(),
          driftMin: z.number().nullable(),
        })
      ),
      incidents: z.object({
        total: z.number(),
        byCategory: z.array(z.object({ category: z.string(), count: z.number() })),
        avgResolveMin: z.number().nullable(),
      }),
      staff: z.object({ arrived: z.number(), expected: z.number(), noShows: z.number() }),
      survey: z.object({ responses: z.number(), nps: z.number().nullable() }).nullable(),
      /** YouTube chapters from when each moment actually started. */
      chapters: z.string().nullable(),
    })
    .nullable(),
});

export type Today = z.infer<typeof TodaySchema>;
export type TodayMoment = z.infer<typeof Moment>;
