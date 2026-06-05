import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, type RoomRow } from "../../../db/schema";
import type { GetRoomInput, Room } from "../schemas";

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
 * Get a single room by ID
 */
export const getRoomById = async ({ id }: GetRoomInput): Promise<Room> => {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);

  if (!room) {
    throw new Error("Room not found");
  }

  return transformRoom(room);
};
