import { asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, type RoomRow } from "../../../db/schema";
import type { GetRoomsByOpenSpaceInput, Room } from "../schemas";

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
 * Get rooms by OpenSpace ID
 */
export const getRoomsByOpenSpace = async ({ openSpaceId }: GetRoomsByOpenSpaceInput): Promise<Room[]> => {
  const rows = await db.select().from(rooms).where(eq(rooms.openSpaceId, openSpaceId)).orderBy(asc(rooms.name));

  return rows.map(transformRoom);
};
