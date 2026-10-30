import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { platform, pub } from "../base";
import {
  CadenceSchema,
  ChannelsSchema,
  DispatchResultSchema,
  EventIdSchema,
  MarkSentSchema,
  MessageRefSchema,
  OutboundMessageSchema,
  PostedMessageSchema,
  RemindResultSchema,
  RemindSchema,
  RemoveMessageSchema,
  ScheduleMessageSchema,
  SendMessageSchema,
  UpdateMessageSchema,
} from "./schemas";
import * as Comms from "./service";

const docs = (summary: string) => openapi({ tags: ["Comms"], summary });

// What Owy tells attendees (Telegram, Slack) and staff (DMs), now or when its time comes. Site staff,
// except `feed`: what attendees were already told is public (the live board shows it).
export const commsRouter = {
  feed: pub
    .meta(docs("What Owy posted for an event's attendees (Telegram, Slack), newest first: text and time only"))
    .input(EventIdSchema)
    .output(z.array(PostedMessageSchema))
    .effect(function* ({ input }) {
      return yield* Comms.feed(input.eventId);
    }),

  list: platform("comms:read")
    .meta(docs("Owy's messages for an event, newest first: scheduled, sent and failed with their error"))
    .input(EventIdSchema)
    .output(z.array(OutboundMessageSchema))
    .effect(function* ({ input }) {
      return yield* Comms.list(input.eventId);
    }),

  channels: platform("comms:read")
    .meta(docs("Which channels Owy can write to from the site"))
    .output(ChannelsSchema)
    .handler(() => Comms.channels()),

  cadence: platform("comms:read")
    .meta(docs("The conf's communication steps, with their suggested time, copy and status"))
    .input(EventIdSchema)
    .output(CadenceSchema)
    .effect(function* ({ input }) {
      return yield* Comms.cadence(input.eventId);
    }),

  send: platform("comms:send")
    .meta(docs("Send a message through Owy now; a failure is recorded and returned"))
    .input(SendMessageSchema)
    .output(OutboundMessageSchema)
    .effect(function* ({ input }) {
      return yield* Comms.send(input);
    }),

  schedule: platform("comms:schedule")
    .meta(docs("Schedule a message through Owy; one per cadence step"))
    .input(ScheduleMessageSchema)
    .output(OutboundMessageSchema)
    .effect(function* ({ input }) {
      return yield* Comms.schedule(input);
    }),

  update: platform("comms:schedule")
    .meta(docs("Edit a message: a scheduled one whole; one that went out, its text, where it landed too"))
    .input(UpdateMessageSchema)
    .output(OutboundMessageSchema)
    .effect(function* ({ input }) {
      return yield* Comms.update(input);
    }),

  cancel: platform("comms:schedule")
    .meta(docs("Drop a scheduled message (or a step marked as sent by hand)"))
    .input(MessageRefSchema)
    .output(OutboundMessageSchema)
    .effect(function* ({ input }) {
      return yield* Comms.cancel(input);
    }),

  remove: platform("comms:schedule")
    .meta(docs("Delete a message; one that went out also where it landed (Telegram, Slack), unless onlyHere"))
    .input(RemoveMessageSchema)
    .output(OutboundMessageSchema)
    .effect(function* ({ input }) {
      return yield* Comms.remove(input);
    }),

  markSent: platform("comms:schedule")
    .meta(docs("Record a cadence step that went out by other means (the Eventbrite email)"))
    .input(MarkSentSchema)
    .output(OutboundMessageSchema)
    .effect(function* ({ input }) {
      return yield* Comms.markSent(input);
    }),

  dispatchDue: platform("comms:dispatch")
    .meta(docs("Send every scheduled message whose time has come, exactly once across callers"))
    .input(EventIdSchema)
    .output(DispatchResultSchema)
    .effect(function* ({ input }) {
      return yield* Comms.dispatchDue(input.eventId);
    }),

  remind: platform("comms:send")
    .meta(docs("Owy DMs, on Slack, whoever hasn't marked a staff announcement as received"))
    .input(RemindSchema)
    .output(RemindResultSchema)
    .effect(function* ({ input }) {
      return yield* Comms.remind(input);
    }),
};
