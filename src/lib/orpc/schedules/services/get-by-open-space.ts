import { asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { schedules, type ScheduleRow } from "../../../db/schema";
import type { GetSchedulesByOpenSpaceInput, Schedule } from "../schemas";

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
 * Get schedules by OpenSpace ID
 */
export const getSchedulesByOpenSpace = async ({ openSpaceId }: GetSchedulesByOpenSpaceInput): Promise<Schedule[]> => {
  const rows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.openSpaceId, openSpaceId))
    .orderBy(asc(schedules.date), asc(schedules.startTime));

  return rows.map(transformSchedule);
};
