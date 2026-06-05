import { asc } from "drizzle-orm";
import { db } from "../../../db";
import { schedules, type ScheduleRow } from "../../../db/schema";
import type { Schedule } from "../schemas";

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
 * Get all schedules ordered by date and start time
 */
export const getAllSchedules = async (): Promise<Schedule[]> => {
  const rows = await db.select().from(schedules).orderBy(asc(schedules.date), asc(schedules.startTime));

  return rows.map(transformSchedule);
};
