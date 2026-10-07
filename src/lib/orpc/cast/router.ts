import { openapi } from "@orpc/openapi";

import { pub, staff } from "../base";
import { CastStateSchema, GetCastStateSchema, SetHighlightedNoteSchema } from "./schemas";
import * as Cast from "./service";

const docs = (summary: string) => openapi({ tags: ["Cast"], summary });

export const castRouter = {
  getState: pub
    .meta(docs("The talk an event's screens are showing, if any"))
    .input(GetCastStateSchema)
    .output(CastStateSchema)
    .effect(function* ({ input }) {
      return yield* Cast.getCast(input.eventId);
    }),

  setHighlightedNote: staff
    .meta(docs("Put a talk on an event's screens, or clear them"))
    .input(SetHighlightedNoteSchema)
    .output(CastStateSchema)
    .effect(function* ({ input }) {
      return yield* Cast.cast(input);
    }),
};
