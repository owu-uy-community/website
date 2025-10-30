import { prisma } from '../../../prisma'
import type { DeleteRoomInput, Room } from '../schemas'
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
 * Delete a room by ID
 */
export const deleteRoom = async ({ id }: DeleteRoomInput): Promise<Room> => {
  const room = await prisma.room.findUnique({
    where: { id }
  })

  if (!room) {
    throw new Error('Room not found')
  }

  await prisma.room.delete({
    where: { id }
  })
  
  return transformRoom(room)
}

