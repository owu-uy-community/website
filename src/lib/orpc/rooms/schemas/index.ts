import { z } from "zod";

/**
 * Core Room schema with all fields
 */
export const RoomSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  hasTV: z.boolean().default(false).describe("Room has a TV/projector available"),
  hasWhiteboard: z.boolean().default(false).describe("Room has a whiteboard available"),
  isActive: z.boolean().default(true),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #rrggbb hex")
    .nullable()
    .optional(),
  /** Shape key from ROOM_ICONS ("diamond", "star", …); null renders no icon. */
  icon: z
    .string()
    .regex(/^[a-z]+$/, "Icon must be a shape key")
    .nullable()
    .optional(),
  sortOrder: z.number().int().default(0),
  openSpaceId: z.string().min(1, "OpenSpace ID is required"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Schema for creating a new room (omits auto-generated fields).
 * sortOrder defaults to the end of the board when not provided.
 */
export const CreateRoomSchema = RoomSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  sortOrder: z.number().int().optional(),
});

/**
 * Schema for reordering an event's rooms (board columns)
 */
export const ReorderRoomsSchema = z.object({
  openSpaceId: z.string().min(1, "OpenSpace ID is required"),
  orderedIds: z.array(z.string().min(1)).min(1),
});

/**
 * Schema for updating a room (all fields optional except constraints)
 */
export const UpdateRoomSchema = CreateRoomSchema.omit({ openSpaceId: true }).partial();

/**
 * Schema for getting a room by ID
 */
export const GetRoomSchema = z.object({
  id: z.string().min(1, "Room ID is required"),
});

/**
 * Schema for deleting a room by ID
 */
export const DeleteRoomSchema = z.object({
  id: z.string().min(1, "Room ID is required"),
});

/**
 * Schema for updating a room with ID and data
 */
export const UpdateRoomInputSchema = z.object({
  id: z.string().min(1, "Room ID is required"),
  data: UpdateRoomSchema,
});

/**
 * Schema for getting rooms by OpenSpace ID
 */
export const GetRoomsByOpenSpaceSchema = z.object({
  openSpaceId: z.string().min(1, "OpenSpace ID is required"),
});

// Type exports
export type Room = z.infer<typeof RoomSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;
export type GetRoomInput = z.infer<typeof GetRoomSchema>;
export type DeleteRoomInput = z.infer<typeof DeleteRoomSchema>;
export type UpdateRoomInputType = z.infer<typeof UpdateRoomInputSchema>;
export type GetRoomsByOpenSpaceInput = z.infer<typeof GetRoomsByOpenSpaceSchema>;
export type ReorderRoomsInput = z.infer<typeof ReorderRoomsSchema>;
