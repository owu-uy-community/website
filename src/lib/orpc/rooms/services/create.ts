import { prisma } from "../../../prisma";
import type { CreateRoomInput, Room } from "../schemas";
import type { Room as PrismaRoom } from "../../../../generated/prisma";

/**
 * Transform database room to API format
 */
const transformRoom = (room: PrismaRoom): Room => ({
  ...room,
  description: room.description || undefined,
  capacity: room.capacity || undefined,
  createdAt: room.createdAt.toISOString(),
  updatedAt: room.updatedAt.toISOString(),
});

/**
 * Create a new room
 */
export const createRoom = async (input: CreateRoomInput): Promise<Room> => {
  // Verify the OpenSpace exists
  const openSpace = await prisma.openSpace.findUnique({
    where: { id: input.openSpaceId },
  });

  if (!openSpace) {
    throw new Error("OpenSpace not found");
  }

  // Check for duplicate room names within the same OpenSpace
  const existingRoom = await prisma.room.findFirst({
    where: {
      name: input.name,
      openSpaceId: input.openSpaceId,
    },
  });

  if (existingRoom) {
    throw new Error(`Room "${input.name}" already exists in this OpenSpace`);
  }

  const room = await prisma.room.create({
    data: {
      name: input.name,
      description: input.description || null,
      capacity: input.capacity || null,
      isActive: input.isActive,
      openSpaceId: input.openSpaceId,
    },
  });

  return transformRoom(room);
};
