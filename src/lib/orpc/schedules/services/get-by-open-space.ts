import { prisma } from "../../../prisma";
import type { GetSchedulesByOpenSpaceInput, Schedule } from "../schemas";
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
 * Get schedules by OpenSpace ID
 */
export const getSchedulesByOpenSpace = async ({ openSpaceId }: GetSchedulesByOpenSpaceInput): Promise<Schedule[]> => {
  const schedules = await prisma.schedule.findMany({
    where: { openSpaceId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return schedules.map(transformSchedule);
};
