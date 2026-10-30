import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import { AssetRefSchema, AssetSchema, SaveAssetSchema } from "./schemas";
import * as Assets from "./service";
import { CommunityRefSchema } from "../insights/schemas";

const docs = (summary: string) => openapi({ tags: ["Assets"], summary });

// "Cuentas y accesos": the community's accounts elsewhere and who holds each, so a handover never
// loses one. Admins read it (who sees the team) and change it (who edits the community). No passwords.
export const assetsRouter = {
  list: authed
    .meta(docs("The community's accounts elsewhere (Meetup, Slack, Instagram…) and who holds each"))
    .input(CommunityRefSchema)
    .use(inCommunity("member:read"))
    .output(z.array(AssetSchema))
    .effect(function* ({ input }) {
      return yield* Assets.list(input.communityId);
    }),

  mine: authed
    .meta(docs("The accounts I hold or back up in a community I'm on (to pass on when leaving)"))
    .input(CommunityRefSchema)
    .output(z.array(AssetSchema))
    .effect(function* ({ input }) {
      return yield* Assets.mine(input.communityId);
    }),

  save: authed
    .meta(docs("Add an account or change who holds it (never a password)"))
    .input(SaveAssetSchema)
    .use(inCommunity("organization:update"))
    .output(AssetSchema)
    .effect(function* ({ input }) {
      return yield* Assets.save(input);
    }),

  remove: authed
    .meta(docs("Take an account off the list"))
    .input(AssetRefSchema)
    .use(inCommunity("organization:update"))
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Assets.remove(input);
    }),
};
