import { prisma } from '../../../prisma'
import type { GetRoomsByOpenSpaceInput, Room } from '../schemas'
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
 * Get rooms by OpenSpace ID
 */
export const getRoomsByOpenSpace = async ({ openSpaceId }: GetRoomsByOpenSpaceInput): Promise<Room[]> => {
  const rooms = await prisma.room.findMany({
    where: { openSpaceId },
    orderBy: { name: 'asc' }
  })
  
  return rooms.map(transformRoom)
}

