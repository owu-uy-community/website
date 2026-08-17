import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { openSpaces, rooms, type RoomRow } from "../../../db/schema";
import { ROOM_PALETTE } from "../../../rooms/palette";
import type { CreateRoomInput, Room } from "../schemas";

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
 * Create a new room
 */
export const createRoom = async (input: CreateRoomInput): Promise<Room> => {
  // Verify the OpenSpace exists
  const [openSpace] = await db.select().from(openSpaces).where(eq(openSpaces.id, input.openSpaceId)).limit(1);

  if (!openSpace) {
    throw new Error("OpenSpace not found");
  }

  // Check for duplicate room names within the same OpenSpace
  const [existingRoom] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.name, input.name), eq(rooms.openSpaceId, input.openSpaceId)))
    .limit(1);

  if (existingRoom) {
    throw new Error(`Room "${input.name}" already exists in this OpenSpace`);
  }

  // New rooms go to the end of the board unless an explicit order is given
  const existing = await db
    .select({ sortOrder: rooms.sortOrder })
    .from(rooms)
    .where(eq(rooms.openSpaceId, input.openSpaceId))
    .orderBy(desc(rooms.sortOrder));
  const sortOrder = input.sortOrder ?? (existing[0]?.sortOrder ?? -1) + 1;

  // Persist a distinct palette color by default so boards start legible;
  // admins can change it any time.
  const color = input.color ?? ROOM_PALETTE[existing.length % ROOM_PALETTE.length];

  const [room] = await db
    .insert(rooms)
    .values({
      name: input.name,
      description: input.description || null,
      capacity: input.capacity || null,
      hasTV: input.hasTV,
      hasWhiteboard: input.hasWhiteboard,
      isActive: input.isActive,
      color,
      icon: input.icon ?? null,
      sortOrder,
      openSpaceId: input.openSpaceId,
    })
    .returning();

  return transformRoom(room);
};
