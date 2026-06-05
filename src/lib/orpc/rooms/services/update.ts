import { and, eq, ne } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, type RoomRow } from "../../../db/schema";
import type { UpdateRoomInput, Room } from "../schemas";

/**
 * Transform database room to API format
 */
const transformRoom = (room: RoomRow): Room => ({
  ...room,
  description: room.description || undefined,
  capacity: room.capacity || undefined,
  createdAt: room.createdAt.toISOString(),
  updatedAt: room.updatedAt.toISOString(),
});

/**
 * Update an existing room
 */
export const updateRoom = async ({ id, data }: { id: string; data: UpdateRoomInput }): Promise<Room> => {
  // Check if room exists
  const [currentRoom] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);

  if (!currentRoom) {
    throw new Error("Room not found");
  }

  // Check for duplicate room names if name is being updated
  if (data.name) {
    const [existingRoom] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.name, data.name), eq(rooms.openSpaceId, currentRoom.openSpaceId), ne(rooms.id, id)))
      .limit(1);

    if (existingRoom) {
      throw new Error(`Room "${data.name}" already exists in this OpenSpace`);
    }
  }

  const [room] = await db
    .update(rooms)
    .set({
      name: data.name,
      description: data.description || null,
      capacity: data.capacity || null,
      isActive: data.isActive,
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, id))
    .returning();

  return transformRoom(room);
};
