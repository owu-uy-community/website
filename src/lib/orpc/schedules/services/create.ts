import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { openSpaces, schedules, type ScheduleRow } from "../../../db/schema";
import type { CreateScheduleInput, Schedule } from "../schemas";

/**
 * Transform database schedule to API format
 */
const transformSchedule = (schedule: ScheduleRow): Schedule => ({
  ...schedule,
  date: schedule.date.toISOString(),
  createdAt: schedule.createdAt.toISOString(),
  updatedAt: schedule.updatedAt.toISOString(),
});

/**
 * Create a new schedule
 */
export const createSchedule = async (input: CreateScheduleInput): Promise<Schedule> => {
  // Verify the OpenSpace exists
  const [openSpace] = await db.select().from(openSpaces).where(eq(openSpaces.id, input.openSpaceId)).limit(1);

  if (!openSpace) {
    throw new Error("OpenSpace not found");
  }

  const [schedule] = await db
    .insert(schedules)
    .values({
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      date: new Date(input.date),
      isActive: input.isActive,
      openSpaceId: input.openSpaceId,
    })
    .returning();

  return transformSchedule(schedule);
};
