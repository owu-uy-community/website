import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { schedules, type ScheduleRow } from "../../../db/schema";
import type { Schedule, UpdateScheduleInputType } from "../schemas";

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
 * Update an existing schedule
 */
export const updateSchedule = async ({ id, data }: UpdateScheduleInputType): Promise<Schedule> => {
  // Check if schedule exists
  const [currentSchedule] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);

  if (!currentSchedule) {
    throw new Error("Schedule not found");
  }

  // Use single timestamp for consistency
  const timestamp = new Date();

  // Build update data object, only including provided fields
  const updateData: Partial<typeof schedules.$inferInsert> = {
    updatedAt: timestamp,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.date !== undefined) updateData.date = new Date(data.date);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.highlightInKiosk !== undefined) updateData.highlightInKiosk = data.highlightInKiosk;

  const [schedule] = await db.update(schedules).set(updateData).where(eq(schedules.id, id)).returning();

  return transformSchedule(schedule);
};
