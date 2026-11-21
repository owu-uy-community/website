import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { pub } from "../base";
import { ScanResultSchema } from "../attendees/schemas";
import {
  DoorCountsSchema,
  DoorInfoSchema,
  DoorScanSchema,
  DoorSearchResultSchema,
  DoorSearchSchema,
  DoorTokenSchema,
  WalkInSchema,
} from "./schemas";
import * as Door from "./service";

const docs = (summary: string) => openapi({ tags: ["Door"], summary });

/** The volunteers' door: everything here takes the signed link an organizer handed out. */
export const doorRouter = {
  info: pub
    .meta(docs("The event a door link opens, and how the door is going"))
    .input(DoorTokenSchema)
    .output(DoorInfoSchema)
    .effect(function* ({ input }) {
      return yield* Door.info(input.token);
    }),

  counts: pub
    .meta(docs("Who's in and who's still to come"))
    .input(DoorTokenSchema)
    .output(DoorCountsSchema)
    .effect(function* ({ input }) {
      return yield* Door.counts(input.token);
    }),

  search: pub
    .meta(docs("Find someone by name or code (no emails)"))
    .input(DoorSearchSchema)
    .output(DoorSearchResultSchema)
    .effect(function* ({ input }) {
      return yield* Door.search(input.token, input.q);
    }),

  scan: pub
    .meta(docs("Check a ticket in from the door link (idempotent by nonce)"))
    .input(DoorScanSchema)
    .output(ScanResultSchema)
    .effect(function* ({ input }) {
      const { token, ...scan } = input;
      return yield* Door.scan(token, scan);
    }),

  walkIn: pub
    .meta(docs("Let in someone who didn't sign up, and count them"))
    .input(WalkInSchema)
    .output(z.object({ id: z.string(), name: z.string() }))
    .effect(function* ({ input }) {
      return yield* Door.walkIn(input.token, input);
    }),
};
