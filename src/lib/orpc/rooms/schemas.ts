import * as z from "zod";

/** Editable fields without defaults, so a partial update only touches what it was sent. */
const RoomFields = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  description: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  hasTV: z.boolean().describe("Room has a TV/projector available"),
  hasWhiteboard: z.boolean().describe("Room has a whiteboard available"),
  isActive: z.boolean(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #rrggbb hex")
    .nullable(),
  icon: z
    .string()
    .regex(/^[a-z]+$/, "Icon must be a shape key")
    .nullable(),
  sortOrder: z.number().int(),
});

/** What the API returns. Shapes only — input rules don't apply to rows already stored. */
export const RoomSchema = z.object({
  id: z.string(),
  openSpaceId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  capacity: z.number().optional(),
  hasTV: z.boolean(),
  hasWhiteboard: z.boolean(),
  isActive: z.boolean(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateRoomSchema = RoomFields.extend({
  openSpaceId: z.string().min(1),
  hasTV: z.boolean().default(false),
  hasWhiteboard: z.boolean().default(false),
  isActive: z.boolean().default(true),
  color: RoomFields.shape.color.optional(),
  icon: RoomFields.shape.icon.optional(),
  sortOrder: z.number().int().optional(),
});

export const UpdateRoomInputSchema = z.object({ id: z.string().min(1), data: RoomFields.partial() });
export const RoomIdSchema = z.object({ id: z.string().min(1) });
export const GetRoomsByOpenSpaceSchema = z.object({ openSpaceId: z.string().min(1) });
export const ReorderRoomsSchema = z.object({
  openSpaceId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type Room = z.infer<typeof RoomSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
