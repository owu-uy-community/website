import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { grantsHold } from "../../authz/catalog";
import { platformGrants } from "../../authz/principal";
import { authed, inCommunity, platform, pub } from "../base";
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
    .use(inCommunity("event:list"))
    .output(z.array(OpenSpaceSchema))
    .effect(function* ({ input }) {
      return yield* Events.listByCommunity(input.communityId);
    }),

  listForAdmin: authed
    .meta(docs("Events the caller can operate: every event for site staff, their communities' for members"))
    .output(z.array(AdminEventOptionSchema))
    .effect(function* () {
      const user = yield* CurrentUser;

      // Who holds event:list on the platform (site staff, the bot) sees every event; others their communities'
      const everywhere = grantsHold(platformGrants(user.principal), "event:list");

      if (everywhere) return yield* Events.listEventsForOperator(null);
      // Nobody in particular (someone anonymous behind the bot) operates nothing

      return user.principal.memberOf ? yield* Events.listEventsForOperator(user.principal.memberOf) : [];
    }),

  get: pub
    .meta(docs("Get an event"))
    .input(EventIdSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.getEvent(input.id);
    }),

  create: platform("event:manage")
    .meta(docs("Create an event in a community"))
    .input(CreateOpenSpaceSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.createEvent(input);
    }),

  update: platform("event:manage")
    .meta(docs("Edit an event; only the fields sent change"))
    .input(UpdateOpenSpaceInputSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.updateEvent(input.id, input.data);
    }),

  delete: platform("event:manage")
    .meta(docs("Delete an event and everything in it"))
    .input(EventIdSchema)
    .output(OpenSpaceSchema)
    .effect(function* ({ input }) {
      return yield* Events.deleteEvent(input.id);
    }),
};
