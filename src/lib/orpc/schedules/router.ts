import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { pub, staff } from "../base";
import {
  CreateScheduleSchema,
  GetSchedulesByOpenSpaceSchema,
  ScheduleIdSchema,
  ScheduleSchema,
  UpdateScheduleInputSchema,
} from "./schemas";
import * as Schedules from "./service";

const docs = (summary: string) => openapi({ tags: ["Time slots"], summary });

export const schedulesRouter = {
  get: pub
    .meta(docs("Get a time slot"))
    .input(ScheduleIdSchema)
    .output(ScheduleSchema)
    .effect(function* ({ input }) {
      return yield* Schedules.getSchedule(input.id);
    }),

  getByOpenSpace: pub
    .meta(docs("List an event's time slots by date and start time"))
    .input(GetSchedulesByOpenSpaceSchema)
    .output(z.array(ScheduleSchema))
    .effect(function* ({ input }) {
      return yield* Schedules.listSchedules(input.openSpaceId);
    }),

  create: staff
    .meta(docs("Add a time slot to an event"))
    .input(CreateScheduleSchema)
    .output(ScheduleSchema)
    .effect(function* ({ input }) {
      return yield* Schedules.createSchedule(input);
    }),

  update: staff
    .meta(docs("Edit a time slot; only the fields sent change"))
    .input(UpdateScheduleInputSchema)
    .output(ScheduleSchema)
    .effect(function* ({ input }) {
      return yield* Schedules.updateSchedule(input.id, input.data);
    }),

  delete: staff
    .meta(docs("Delete a time slot and its talks"))
    .input(ScheduleIdSchema)
    .output(ScheduleSchema)
    .effect(function* ({ input }) {
      return yield* Schedules.deleteSchedule(input.id);
    }),
};
