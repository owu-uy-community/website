import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { pub, staff } from "../base";
import {
  CreateRoomSchema,
  GetRoomsByOpenSpaceSchema,
  ReorderRoomsSchema,
  RoomIdSchema,
  RoomSchema,
  UpdateRoomInputSchema,
} from "./schemas";
import * as Rooms from "./service";

const docs = (summary: string) => openapi({ tags: ["Rooms"], summary });

export const roomsRouter = {
  get: pub
    .meta(docs("Get a room"))
    .input(RoomIdSchema)
    .output(RoomSchema)
    .effect(function* ({ input }) {
      return yield* Rooms.getRoom(input.id);
    }),

  getByOpenSpace: pub
    .meta(docs("List an event's rooms in board order"))
    .input(GetRoomsByOpenSpaceSchema)
    .output(z.array(RoomSchema))
    .effect(function* ({ input }) {
      return yield* Rooms.listRooms(input.openSpaceId);
    }),

  create: staff
    .meta(docs("Add a room to an event"))
    .input(CreateRoomSchema)
    .output(RoomSchema)
    .effect(function* ({ input }) {
      return yield* Rooms.createRoom(input);
    }),

  update: staff
    .meta(docs("Edit a room; only the fields sent change"))
    .input(UpdateRoomInputSchema)
    .output(RoomSchema)
    .effect(function* ({ input }) {
      return yield* Rooms.updateRoom(input.id, input.data);
    }),

  delete: staff
    .meta(docs("Delete a room and its talks"))
    .input(RoomIdSchema)
    .output(RoomSchema)
    .effect(function* ({ input }) {
      return yield* Rooms.deleteRoom(input.id);
    }),

  reorder: staff
    .meta(docs("Set the board order of an event's rooms"))
    .input(ReorderRoomsSchema)
    .output(z.object({ success: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Rooms.reorderRooms(input.openSpaceId, input.orderedIds);
    }),
};
