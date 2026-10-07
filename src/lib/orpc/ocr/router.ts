import { openapi } from "@orpc/openapi";
import { eventIterator } from "@orpc/server";

import { staff } from "../base";
import { toWireError } from "../errors";
import {
  CardEventSchema,
  ExtractCardSchema,
  FindFreeSpotResponseSchema,
  FindFreeSpotSchema,
  ProcessImageWithSuggestionResponseSchema,
  ProcessImageWithSuggestionSchema,
} from "./schemas";
import * as Ocr from "./service";

const docs = (summary: string) => openapi({ tags: ["Talk cards"], summary });

export const ocrRouter = {
  extractCard: staff
    .meta(docs("Read a talk card from a photo: the name and title as they are read, the card, then a place for it"))
    .input(ExtractCardSchema)
    .output(eventIterator(CardEventSchema))
    .handler(async function* ({ input, context, signal, path }) {
      try {
        yield* Ocr.cardEvents(context["effect/context"], input, signal);
      } catch (error) {
        // Mid-stream the procedure's middleware has already returned: convert here.
        throw toWireError(error, { path });
      }
    }),

  findFreeSpot: staff
    .meta(docs("Suggest a room and time for a talk on the event's board"))
    .input(FindFreeSpotSchema)
    .output(FindFreeSpotResponseSchema)
    .effect(function* ({ input }) {
      return yield* Ocr.suggestSlot(input.eventId, input);
    }),

  processImageWithSuggestion: staff
    .meta(docs("Read a talk card and suggest a place for it, in one answer"))
    .input(ProcessImageWithSuggestionSchema)
    .output(ProcessImageWithSuggestionResponseSchema)
    .effect(function* ({ input }) {
      return yield* Ocr.readCardWithSuggestion(input);
    }),
};
