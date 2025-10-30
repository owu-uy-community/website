import { prisma } from '../../../prisma'
import type { UpdateRoomInput, Room } from '../schemas'
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
 * Update an existing room
 */
export const updateRoom = async ({ id, data }: { id: string; data: UpdateRoomInput }): Promise<Room> => {
  // Check if room exists
  const currentRoom = await prisma.room.findUnique({
    where: { id }
  })

  if (!currentRoom) {
    throw new Error('Room not found')
  }

  // Check for duplicate room names if name is being updated
  if (data.name) {
    const existingRoom = await prisma.room.findFirst({
      where: {
        name: data.name,
        openSpaceId: currentRoom.openSpaceId,
        id: { not: id }
      }
    })

    if (existingRoom) {
      throw new Error(`Room "${data.name}" already exists in this OpenSpace`)
    }
  }

  const room = await prisma.room.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description || null,
      capacity: data.capacity || null,
      isActive: data.isActive,
      updatedAt: new Date(),
    }
  })
  
  return transformRoom(room)
}

