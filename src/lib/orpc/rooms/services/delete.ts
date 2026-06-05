import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, type RoomRow } from "../../../db/schema";
import type { DeleteRoomInput, Room } from "../schemas";

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
 * Delete a room by ID
 */
export const deleteRoom = async ({ id }: DeleteRoomInput): Promise<Room> => {
  const [room] = await db.delete(rooms).where(eq(rooms.id, id)).returning();

  if (!room) {
    throw new Error("Room not found");
  }

  return transformRoom(room);
};
