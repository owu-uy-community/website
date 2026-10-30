import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { platform } from "../base";
import {
  CreateMomentSchema,
  EventRefSchema,
  GoResultSchema,
  GoSchema,
  MomentRefSchema,
  MomentSchema,
  ReorderMomentsSchema,
  RunOfShowSchema,
  ShiftResultSchema,
  ShiftSchema,
  UndoResultSchema,
  UpdateMomentSchema,
} from "./schemas";
import * as RunOfShow from "./service";

const docs = (summary: string) => openapi({ tags: ["Guion"], summary });

// The guion del día: every moment of the event day, planned and actual. Site staff run it.
export const runOfShowRouter = {
  list: platform("runOfShow:read")
    .meta(docs("The run of show in order, with owners, cues and drift"))
    .input(EventRefSchema)
    .output(RunOfShowSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.listRunOfShow(input.eventId);
    }),

  create: platform("runOfShow:operate")
    .meta(docs("Add a moment; it goes where its start falls in the day"))
    .input(CreateMomentSchema)
    .output(MomentSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.createMoment(input);
    }),

  update: platform("runOfShow:operate")
    .meta(docs("Edit a moment's plan; only the fields sent change"))
    .input(UpdateMomentSchema)
    .output(MomentSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.updateMoment(input);
    }),

  remove: platform("runOfShow:operate")
    .meta(docs("Delete a moment"))
    .input(MomentRefSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* RunOfShow.removeMoment(input);
    }),

  reorder: platform("runOfShow:operate")
    .meta(docs("Set the order of the run of show"))
    .input(ReorderMomentsSchema)
    .output(RunOfShowSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.reorderMoments(input);
    }),

  go: platform("runOfShow:operate")
    .meta(docs("End the running moment and start the next (or the given) one, firing its cue and Owy message"))
    .input(GoSchema)
    .output(GoResultSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.go(input);
    }),

  undo: platform("runOfShow:operate")
    .meta(docs("Undo the last GO: put the actual times back (the cue stays fired)"))
    .input(EventRefSchema)
    .output(UndoResultSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.undoGo(input);
    }),

  shift: platform("runOfShow:operate")
    .meta(docs("Move the flexible moments from one on, up to the next fixed start; reports what now collides"))
    .input(ShiftSchema)
    .output(ShiftResultSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.shiftMoments(input);
    }),

  importProgram: platform("runOfShow:operate")
    .meta(docs("Build an empty run of show from the board's time slots"))
    .input(EventRefSchema)
    .output(RunOfShowSchema)
    .effect(function* ({ input }) {
      return yield* RunOfShow.importProgram(input);
    }),

  live: platform("runOfShow:read")
    .meta(docs("The event whose run of show is on now, for a Stream Deck that doesn't name one"))
    .output(z.object({ eventId: z.string().nullable() }))
    .effect(function* () {
      return yield* RunOfShow.liveEventId();
    }),
};
