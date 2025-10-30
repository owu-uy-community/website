import { prisma } from '../../../prisma'
import type { CreateScheduleInput, Schedule } from '../schemas'
import type { Schedule as PrismaSchedule } from '../../../../generated/prisma'

/**
 * Transform database schedule to API format
 */
const transformSchedule = (schedule: PrismaSchedule): Schedule => ({
  ...schedule,
  date: schedule.date.toISOString(),
  createdAt: schedule.createdAt.toISOString(),
  updatedAt: schedule.updatedAt.toISOString(),
})

/**
 * Create a new schedule
 */
export const createSchedule = async (input: CreateScheduleInput): Promise<Schedule> => {
  // Verify the OpenSpace exists
  const openSpace = await prisma.openSpace.findUnique({
    where: { id: input.openSpaceId }
  })

  if (!openSpace) {
    throw new Error('OpenSpace not found')
  }

  const schedule = await prisma.schedule.create({
    data: {
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      date: new Date(input.date),
      isActive: input.isActive,
      openSpaceId: input.openSpaceId,
    }
  })
  
  return transformSchedule(schedule)
}

