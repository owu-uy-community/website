import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { staff } from "../base";
import * as Raffles from "./raffles";
import {
  AttendeeListSchema,
  CheckinStatsSchema,
  CheckinsSchema,
  CreateRaffleSchema,
  DrawIdSchema,
  ExportAttendeesSchema,
  ExportSchema,
  ListAttendeesSchema,
  ListRafflesSchema,
  RaffleIdSchema,
  RaffleSchema,
  RecentEntrySchema,
  RecentSchema,
  ScanResultSchema,
  ScanSchema,
  SetTagsSchema,
  SyncSchema,
  SyncStateSchema,
} from "./schemas";
import * as Attendees from "./service";

const docs = (summary: string) => openapi({ tags: ["Attendees"], summary });
const ok = z.object({ ok: z.literal(true) });

// Attendee data is personal: everything here is for site staff.
export const attendeesRouter = {
  list: staff
    .meta(docs("A page of the event's attendees, searched and filtered over all of them, with facet counts"))
    .input(ListAttendeesSchema)
    .output(AttendeeListSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.listAttendees(input);
    }),

  sync: staff
    .meta(docs("Bring the mirror up to date with Eventbrite (at most every 30 s) and say where it stands"))
    .input(SyncSchema)
    .output(SyncStateSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.sync(input.eventId, input.force);
    }),

  setTags: staff
    .meta(docs("Add and remove tags on some attendees"))
    .input(SetTagsSchema)
    .output(z.object({ count: z.number() }))
    .effect(function* ({ input }) {
      return yield* Attendees.setTags(input);
    }),

  export: staff
    .meta(docs("The attendees the filters (or a selection) pick, as CSV"))
    .input(ExportAttendeesSchema)
    .output(ExportSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.exportAttendees(input);
    }),

  checkins: staff
    .meta(docs("Arrivals per 5 minutes, the last quarter hour, the peak and the count per door"))
    .input(CheckinsSchema)
    .output(CheckinStatsSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.checkinStats(input.eventId, input.since);
    }),

  recent: staff
    .meta(docs("The latest check-ins and the scans that let nobody in"))
    .input(RecentSchema)
    .output(z.array(RecentEntrySchema))
    .effect(function* ({ input }) {
      return yield* Attendees.recentCheckins(input.eventId, input.limit);
    }),

  scan: staff
    .meta(docs("OWU's scanner: check a ticket in (idempotent by nonce; check-ins stay in OWU)"))
    .input(ScanSchema)
    .output(ScanResultSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.scan(input);
    }),

  raffles: {
    list: staff
      .meta(docs("The event's raffles with every draw, newest raffle first"))
      .input(ListRafflesSchema)
      .output(z.array(RaffleSchema))
      .effect(function* ({ input }) {
        return yield* Raffles.listRaffles(input.eventId);
      }),

    create: staff
      .meta(docs("A new raffle among the people who checked in"))
      .input(CreateRaffleSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Raffles.createRaffle(input);
      }),

    draw: staff
      .meta(docs("Draw a winner (reproducible from the raffle's seed and the draw number)"))
      .input(RaffleIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.draw(input.raffleId);
      }),

    redraw: staff
      .meta(docs("The pending winner didn't come up: set them aside and draw again"))
      .input(RaffleIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.redraw(input.raffleId);
      }),

    claim: staff
      .meta(docs("The pending winner took the prize"))
      .input(DrawIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.claim(input.drawId);
      }),

    show: staff
      .meta(docs("Put the raffle on the wall, landing on the current winner"))
      .input(RaffleIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.showOnWall(input.raffleId);
      }),
  },
};
