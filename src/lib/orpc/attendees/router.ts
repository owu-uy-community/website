import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity, platform } from "../base";
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
  UndoCheckinSchema,
  UpdateRaffleSchema,
  SyncSchema,
  SyncStateSchema,
} from "./schemas";
import * as Attendees from "./service";

const docs = (summary: string) => openapi({ tags: ["Attendees"], summary });
const ok = z.object({ ok: z.literal(true) });

// Attendee data is personal: names and emails for the event's community admins (and site staff);
// the door (check-ins, scans) for any member helping there; raffles stay with site staff.
export const attendeesRouter = {
  list: authed
    .meta(docs("A page of the event's attendees, searched and filtered over all of them, with facet counts"))
    .input(ListAttendeesSchema)
    .use(inCommunity("attendee:read"))
    .output(AttendeeListSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.listAttendees(input);
    }),

  sync: authed
    .meta(docs("Bring the mirror up to date with Eventbrite (at most every 30 s) and say where it stands"))
    .input(SyncSchema)
    .use(inCommunity("attendee:sync"))
    .output(SyncStateSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.sync(input.eventId, input.force);
    }),

  setTags: authed
    .meta(docs("Add and remove tags on some attendees"))
    .input(SetTagsSchema)
    .use(inCommunity("attendee:tag"))
    .output(z.object({ count: z.number() }))
    .effect(function* ({ input }) {
      return yield* Attendees.setTags(input);
    }),

  export: authed
    .meta(docs("The attendees the filters (or a selection) pick, as CSV"))
    .input(ExportAttendeesSchema)
    .use(inCommunity("attendee:export"))
    .output(ExportSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.exportAttendees(input);
    }),

  checkins: authed
    .meta(docs("Arrivals per 5 minutes, the last quarter hour, the peak and the count per door"))
    .input(CheckinsSchema)
    .use(inCommunity("attendee:checkins"))
    .output(CheckinStatsSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.checkinStats(input.eventId, input.since);
    }),

  recent: authed
    .meta(docs("The latest check-ins and the scans that let nobody in"))
    .input(RecentSchema)
    .use(inCommunity("attendee:checkins"))
    .output(z.array(RecentEntrySchema))
    .effect(function* ({ input }) {
      return yield* Attendees.recentCheckins(input.eventId, input.limit);
    }),

  scan: authed
    .meta(docs("OWU's scanner: check a ticket in (idempotent by nonce; check-ins stay in OWU)"))
    .input(ScanSchema)
    .use(inCommunity("attendee:checkin"))
    .output(ScanResultSchema)
    .effect(function* ({ input }) {
      return yield* Attendees.scan(input);
    }),

  undoCheckin: authed
    .meta(docs("Take back a check-in that shouldn't have happened; a later Eventbrite sync doesn't bring it back"))
    .input(UndoCheckinSchema)
    .use(inCommunity("attendee:undo"))
    .output(ok)
    .effect(function* ({ input }) {
      return yield* Attendees.undoCheckin(input);
    }),

  raffles: {
    list: platform("raffle:read")
      .meta(docs("The event's raffles with every draw, newest raffle first"))
      .input(ListRafflesSchema)
      .output(z.array(RaffleSchema))
      .effect(function* ({ input }) {
        return yield* Raffles.listRaffles(input.eventId);
      }),

    create: platform("raffle:run")
      .meta(docs("A new raffle among the people who checked in"))
      .input(CreateRaffleSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Raffles.createRaffle(input);
      }),

    update: platform("raffle:run")
      .meta(docs("Rename a raffle's prize; its seed, and so every draw, stays"))
      .input(UpdateRaffleSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.updateRaffle(input);
      }),

    delete: platform("raffle:run")
      .meta(docs("Delete a raffle with all its draws"))
      .input(RaffleIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.deleteRaffle(input.raffleId);
      }),

    draw: platform("raffle:run")
      .meta(docs("Draw a winner (reproducible from the raffle's seed and the draw number)"))
      .input(RaffleIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.draw(input.raffleId);
      }),

    redraw: platform("raffle:run")
      .meta(docs("The pending winner didn't come up: set them aside and draw again"))
      .input(RaffleIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.redraw(input.raffleId);
      }),

    claim: platform("raffle:run")
      .meta(docs("The pending winner took the prize"))
      .input(DrawIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.claim(input.drawId);
      }),

    show: platform("raffle:run")
      .meta(docs("Put the raffle on the wall, landing on the current winner"))
      .input(RaffleIdSchema)
      .output(ok)
      .effect(function* ({ input }) {
        return yield* Raffles.showOnWall(input.raffleId);
      }),
  },
};
