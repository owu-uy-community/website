import { openapi } from "@orpc/openapi";

import { staff } from "../base";
import { IntegrationsSchema } from "./schemas";
import * as System from "./service";

export const systemRouter = {
  integrations: staff
    .meta(openapi({ tags: ["Admin"], summary: "Which integrations this server has configured (never their values)" }))
    .output(IntegrationsSchema)
    .effect(function* ({ context }) {
      return yield* System.integrations(context.requestHeaders);
    }),
};
