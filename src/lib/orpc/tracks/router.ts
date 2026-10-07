import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { pub, staff } from "../base";
import {
  BulkUpdateTracksByScheduleSchema,
  CreatePlacedTrackSchema,
  CreateTrackSchema,
  GetTracksByOpenSpaceSchema,
  ListTracksSchema,
  PlacedTrackSchema,
  StickyNoteSchema,
  SwapTracksSchema,
  TrackIdSchema,
  TrackWithRelationsSchema,
  UpdateTrackInputSchema,
} from "./schemas";
import * as Tracks from "./service";

const docs = (summary: string) => openapi({ tags: ["Talks"], summary });

export const tracksRouter = {
  list: pub
    .meta(docs("An event's talks as the board shows them, newest first"))
    .input(ListTracksSchema)
    .output(z.array(StickyNoteSchema))
    .effect(function* ({ input }) {
      return yield* Tracks.listNotes(input.openSpaceId);
    }),

  get: pub
    .meta(docs("Get one talk"))
    .input(TrackIdSchema)
    .output(StickyNoteSchema)
    .effect(function* ({ input }) {
      return yield* Tracks.getNote(input.id);
    }),

  getByOpenSpace: pub
    .meta(docs("An event's talks with their room and slot, in programme order"))
    .input(GetTracksByOpenSpaceSchema)
    .output(z.array(TrackWithRelationsSchema))
    .effect(function* ({ input }) {
      return yield* Tracks.listWithPlaces(input.openSpaceId, input.highlightedOnly);
    }),

  create: staff
    .meta(docs("Put a talk on the board; a taken place is a CONFLICT naming who has it"))
    .input(CreateTrackSchema)
    .output(StickyNoteSchema)
    .effect(function* ({ input }) {
      return yield* Tracks.createNote(input);
    }),

  createPlaced: staff
    .meta(
      docs(
        "Put a talk on the board wherever it fits best, in one call (the companion's spoken pitch); CONFLICT board_full when nothing is free"
      )
    )
    .input(CreatePlacedTrackSchema)
    .output(PlacedTrackSchema)
    .effect(function* ({ input }) {
      return yield* Tracks.createPlaced(input);
    }),

  update: staff
    .meta(docs("Edit or move a talk; only the fields sent change"))
    .input(UpdateTrackInputSchema)
    .output(StickyNoteSchema)
    .effect(function* ({ input }) {
      return yield* Tracks.updateNote(input.id, input.data);
    }),

  delete: staff
    .meta(docs("Take a talk off the board"))
    .input(TrackIdSchema)
    .output(StickyNoteSchema)
    .effect(function* ({ input }) {
      return yield* Tracks.deleteNote(input.id);
    }),

  swap: staff
    .meta(docs("Two talks trade places"))
    .input(SwapTracksSchema)
    .output(z.array(StickyNoteSchema))
    .effect(function* ({ input }) {
      return yield* Tracks.swapNotes(input.trackAId, input.trackBId);
    }),

  bulkUpdateBySchedule: staff
    .meta(docs("Re-label a slot's talks after its time changed, or move them to another slot"))
    .input(BulkUpdateTracksByScheduleSchema)
    .output(z.array(StickyNoteSchema))
    .effect(function* ({ input }) {
      return yield* Tracks.moveSlot(input);
    }),
};
