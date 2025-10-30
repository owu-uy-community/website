import { prisma } from '../../../prisma'
import type { Room } from '../schemas'
import type { Room as PrismaRoom } from '../../../../generated/prisma'

/**
 * Transform database room to API format
 */
const transformRoom = (room: PrismaRoom): Room => ({
  ...room,
  description: room.description || undefined,
  capacity: room.capacity || undefined,
  createdAt: room.createdAt.toISOString(),
  updatedAt: room.updatedAt.toISOString(),
})

/**
 * Get all rooms ordered by name
 */
export const getAllRooms = async (): Promise<Room[]> => {
  const rooms = await prisma.room.findMany({
    orderBy: { name: 'asc' }
  })
  
  return rooms.map(transformRoom)
}

