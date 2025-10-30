import { prisma } from "../../../prisma";
import type { DeleteScheduleInput, Schedule } from "../schemas";
import type { Schedule as PrismaSchedule } from "../../../../generated/prisma";

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
 * Delete a schedule by ID
 */
export const deleteSchedule = async ({ id }: DeleteScheduleInput): Promise<Schedule> => {
  const schedule = await prisma.schedule.findUnique({
    where: { id },
  });

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  await prisma.schedule.delete({
    where: { id },
  });

  return transformSchedule(schedule);
};
