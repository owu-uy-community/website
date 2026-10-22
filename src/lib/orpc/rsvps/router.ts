import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, pub, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import {
  CancelSpotsSchema,
  JoinSchema,
  MyEventSchema,
  MyRsvpSchema,
  ReviewSchema,
  RsvpEventSchema,
  RsvpTokenSchema,
  SeatSchema,
  TestEmailsSchema,
  TicketSchema,
} from "./schemas";
import * as Rsvps from "./service";

const docs = (summary: string) => openapi({ tags: ["RSVP"], summary });

/** Ten sign-ups a minute per person is more than anyone clicks; a script hits the wall. */
const joinLimit = ratelimit({
  limiter: limiter({ prefix: "rsvp-join:", maxRequests: 10, window: 60_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

/** Same for giving a seat back and taking an offer: each one moves the waitlist and sends email. */
const seatLimit = ratelimit({
  limiter: limiter({ prefix: "rsvp-seat:", maxRequests: 10, window: 60_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

export const rsvpsRouter = {
  mine: authed
    .meta(docs("My place in an event, if I have one"))
    .input(RsvpEventSchema)
    .output(MyRsvpSchema.nullable())
    .effect(function* ({ input }) {
      return yield* Rsvps.mine(input.eventId);
    }),

  join: authed
    .meta(docs("Sign up: a seat, the waitlist when full, or review when the organizers approve each one"))
    .input(JoinSchema)
    .use(joinLimit)
    .output(MyRsvpSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.join(input);
    }),

  leave: authed
    .meta(docs("Give my seat or waitlist place back; the next person gets it"))
    .input(RsvpEventSchema)
    .use(seatLimit)
    .output(MyRsvpSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.leave(input.eventId);
    }),

  confirmOffer: authed
    .meta(docs("Take the seat offered to me while the offer lasts"))
    .input(RsvpEventSchema)
    .use(seatLimit)
    .output(MyRsvpSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.confirmOffer(input.eventId);
    }),

  myTicket: authed
    .meta(docs("My ticket for an event, with a signed link for its QR"))
    .input(RsvpEventSchema)
    .output(TicketSchema.nullable())
    .effect(function* ({ input }) {
      return yield* Rsvps.myTicket(input.eventId);
    }),

  myEvents: authed
    .meta(docs("Every event I signed up for, offers first"))
    .output(z.array(MyEventSchema))
    .effect(function* () {
      return yield* Rsvps.myEvents;
    }),

  ticket: pub
    .meta(docs("A ticket from its signed link (the emails' link), no session needed"))
    .input(RsvpTokenSchema)
    .output(TicketSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.ticket(input.token);
    }),

  leaveByToken: pub
    .meta(docs("No puedo ir, from the signed link"))
    .input(RsvpTokenSchema)
    .output(MyRsvpSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.leaveByToken(input.token);
    }),

  confirmByToken: pub
    .meta(docs("Take an offered seat, from the signed link"))
    .input(RsvpTokenSchema)
    .output(MyRsvpSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.confirmByToken(input.token);
    }),

  review: authed
    .meta(docs("Approve or turn down someone waiting for review"))
    .input(ReviewSchema)
    .use(inCommunity("editor"))
    .output(MyRsvpSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.review(input);
    }),

  giveSeat: authed
    .meta(docs("Give someone waiting (an offer, or the waitlist when it fits) their seat now"))
    .input(SeatSchema)
    .use(inCommunity("admin"))
    .output(MyRsvpSchema)
    .effect(function* ({ input }) {
      return yield* Rsvps.giveSeat(input);
    }),

  cancelSpots: authed
    .meta(docs("Cancel people's places; each is told, and the freed seats go to the next in line"))
    .input(CancelSpotsSchema)
    .use(inCommunity("admin"))
    .output(z.object({ cancelled: z.number() }))
    .effect(function* ({ input }) {
      return yield* Rsvps.cancelSpots(input);
    }),

  sendTest: authed
    .meta(docs("Every automatic email of the event to the organizer asking, marked [Prueba]"))
    .input(TestEmailsSchema)
    .use(inCommunity("admin"))
    .output(z.object({ sent: z.number(), to: z.string() }))
    .effect(function* ({ input }) {
      return yield* Rsvps.sendTest(input.eventId);
    }),
};
