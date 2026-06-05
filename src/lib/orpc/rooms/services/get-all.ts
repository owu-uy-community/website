import { asc } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, type RoomRow } from "../../../db/schema";
import type { Room } from "../schemas";

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
 * Get all rooms ordered by name
 */
export const getAllRooms = async (): Promise<Room[]> => {
  const rows = await db.select().from(rooms).orderBy(asc(rooms.name));

  return rows.map(transformRoom);
};
