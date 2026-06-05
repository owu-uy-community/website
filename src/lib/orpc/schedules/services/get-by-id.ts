import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { schedules, type ScheduleRow } from "../../../db/schema";
import type { GetScheduleInput, Schedule } from "../schemas";

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
 * Get a single schedule by ID
 */
export const getScheduleById = async ({ id }: GetScheduleInput): Promise<Schedule> => {
  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  return transformSchedule(schedule);
};
