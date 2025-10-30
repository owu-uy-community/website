import { prisma } from '../../../prisma'
import type { Schedule } from '../schemas'
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
 * Get all schedules ordered by date and start time
 */
export const getAllSchedules = async (): Promise<Schedule[]> => {
  const schedules = await prisma.schedule.findMany({
    orderBy: [
      { date: 'asc' },
      { startTime: 'asc' }
    ]
  })
  
  return schedules.map(transformSchedule)
}

