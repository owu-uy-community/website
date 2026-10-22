import { openapi } from "@orpc/openapi";

import { platform } from "../base";
import { IntegrationsSchema } from "./schemas";
import * as System from "./service";

export const systemRouter = {
  integrations: platform("insight:read")
    .meta(openapi({ tags: ["Admin"], summary: "Which integrations this server has configured (never their values)" }))
    .output(IntegrationsSchema)
    .effect(function* ({ context }) {
      return yield* System.integrations(context.requestHeaders);
    }),
};
