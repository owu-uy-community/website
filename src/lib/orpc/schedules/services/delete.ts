import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { schedules, type ScheduleRow } from "../../../db/schema";
import type { DeleteScheduleInput, Schedule } from "../schemas";

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
 * Delete a schedule by ID
 */
export const deleteSchedule = async ({ id }: DeleteScheduleInput): Promise<Schedule> => {
  const [schedule] = await db.delete(schedules).where(eq(schedules.id, id)).returning();

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  return transformSchedule(schedule);
};
