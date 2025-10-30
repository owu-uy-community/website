import { prisma } from '../../../prisma'
import type { GetScheduleInput, Schedule } from '../schemas'
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
 * Get a single schedule by ID
 */
export const getScheduleById = async ({ id }: GetScheduleInput): Promise<Schedule> => {
  const schedule = await prisma.schedule.findUnique({
    where: { id }
  })
  
  if (!schedule) {
    throw new Error('Schedule not found')
  }
  
  return transformSchedule(schedule)
}

