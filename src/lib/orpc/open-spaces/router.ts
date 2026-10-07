import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity, staff, pub } from "../base";
import { CurrentUser } from "../services";
import {
  AdminEventOptionSchema,
  CreateOpenSpaceSchema,
  EventIdSchema,
  ListOpenSpacesByCommunitySchema,
  OpenSpaceSchema,
  UpdateOpenSpaceInputSchema,
} from "./schemas";
import * as Events from "./service";

const docs = (summary: string) => openapi({ tags: ["Events"], summary });

export const openSpacesRouter = {
  listByCommunity: authed
    .meta(docs("List a community's events, newest first"))
    .input(ListOpenSpacesByCommunitySchema)
    .use(inCommunity("member"))
    .output(z.array(OpenSpaceSchema))
    .effect(function* ({ input }) {
      return yield* Events.listByCommunity(input.communityId);
    }),

  listForAdmin: authed
    .meta(docs("Events the caller can operate: every event for site staff, their communities' for members"))
    .output(z.array(AdminEventOptionSchema))
    .effect(function* () {
      const user = yield* CurrentUser;

      return yield* Events.listEventsForOperator(user.role === "admin" ? null : user.id);
    }),

  get: pub
    .meta(docs("Get an event"))
    .input(EventIdSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.getEvent(input.id);
    }),

  create: staff
    .meta(docs("Create an event in a community"))
    .input(CreateOpenSpaceSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.createEvent(input);
    }),

  update: staff
    .meta(docs("Edit an event; only the fields sent change"))
    .input(UpdateOpenSpaceInputSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.updateEvent(input.id, input.data);
    }),

  delete: staff
    .meta(docs("Delete an event and everything in it"))
    .input(EventIdSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.deleteEvent(input.id);
    }),
};
