import { prisma } from "../../../prisma";
import type { UpdateScheduleInput, Schedule, UpdateScheduleInputType } from "../schemas";
import type { Schedule as PrismaSchedule, Prisma } from "../../../../generated/prisma";

/**
 * Transform database schedule to API format
 */
const transformSchedule = (schedule: PrismaSchedule): Schedule => ({
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
  const currentSchedule = await prisma.schedule.findUnique({
    where: { id },
  });

  if (!currentSchedule) {
    throw new Error("Schedule not found");
  }

  // Use single timestamp for consistency
  const timestamp = new Date();

  // Build update data object, only including provided fields
  const updateData: Prisma.ScheduleUpdateInput = {
    updatedAt: timestamp,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.date !== undefined) updateData.date = new Date(data.date);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.highlightInKiosk !== undefined) updateData.highlightInKiosk = data.highlightInKiosk;

  const schedule = await prisma.schedule.update({
    where: { id },
    data: updateData,
  });

  return transformSchedule(schedule);
};
