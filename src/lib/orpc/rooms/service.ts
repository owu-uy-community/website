import { and, asc, eq, ne, sql } from "drizzle-orm";
import { Effect } from "effect";

import { events, rooms, tracks, type RoomRow } from "../../db/schema";
import { ROOM_PALETTE, roomColorFor } from "../../rooms/palette";
import { cardsDeleted, structureChanged } from "../board-events";
import { query, transaction } from "../db";
import { Conflict, NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { createAnnouncement } from "../staff-tasks/service";
import type { CreateRoomInput, Room, RoomStatus } from "./schemas";

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  openSpaceId: row.openSpaceId,
  name: row.name,
  description: row.description || undefined,
  capacity: row.capacity || undefined,
  hasTV: row.hasTV,
  hasWhiteboard: row.hasWhiteboard,
  isActive: row.isActive,
  color: row.color,
  icon: row.icon,
  sortOrder: row.sortOrder,
  status: row.status,
  statusUpdatedAt: row.statusUpdatedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const roomNotFound = new NotFound({ entity: "room", message: "Esa sala no existe" });

const found = ([row]: RoomRow[]) => (row ? Effect.succeed(toRoom(row)) : Effect.fail(roomNotFound));

/**
 * Room changes of one event run one at a time (each locks the event row inside
 * its transaction), so two staffers creating "Sala A" at once can't both pass
 * the duplicate check.
 */
const lockEvent = (eventId: string) =>
  query((db) => db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update")).pipe(
    Effect.flatMap(([row]) =>
      row ? Effect.void : Effect.fail(new NotFound({ entity: "event", message: "Ese evento no existe" }))
    )
  );

const ensureNameFree = (eventId: string, name: string, exceptRoomId?: string) =>
  query((db) =>
    db
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(eq(rooms.openSpaceId, eventId), eq(rooms.name, name), exceptRoomId ? ne(rooms.id, exceptRoomId) : undefined)
      )
  ).pipe(
    Effect.flatMap(([taken]) =>
      taken
        ? Effect.fail(new Conflict({ reason: "room_name_taken", message: `Ya hay una sala "${name}" en este evento` }))
        : Effect.void
    )
  );

export const getRoom = (id: string) =>
  query((db) => db.select().from(rooms).where(eq(rooms.id, id))).pipe(Effect.flatMap(found));

export const listRooms = (openSpaceId: string) =>
  query((db) =>
    db.select().from(rooms).where(eq(rooms.openSpaceId, openSpaceId)).orderBy(asc(rooms.sortOrder), asc(rooms.name))
  ).pipe(Effect.map((rows) => rows.map(toRoom)));

/** Tell the boards once the change is committed, so their re-read sees it. */
const announce = (room: Room) =>
  Effect.gen(function* () {
    yield* structureChanged(room.openSpaceId);
    yield* opsPing(room.openSpaceId, "activity");

    return room;
  });

const logRoom = (room: Room, verb: string, summary: string) =>
  recordActivity({ eventId: room.openSpaceId, verb, entityType: "room", entityId: room.id, summary });

/** New rooms go to the end of the board with a palette color unless told otherwise. */
export const createRoom = (input: CreateRoomInput) =>
  transaction(
    Effect.gen(function* () {
      yield* lockEvent(input.openSpaceId);
      yield* ensureNameFree(input.openSpaceId, input.name);
      const existing = yield* query((db) =>
        db
          .select({ id: rooms.id, color: rooms.color, sortOrder: rooms.sortOrder })
          .from(rooms)
          .where(eq(rooms.openSpaceId, input.openSpaceId))
      );
      const lastPosition = Math.max(-1, ...existing.map((room) => room.sortOrder));
      // Rooms are told apart by colour on the board and the kiosk: take one no other room shows.
      const shown = new Set(existing.map((room) => roomColorFor(room.id, room.color)));
      const color =
        ROOM_PALETTE.find((candidate) => !shown.has(candidate)) ?? ROOM_PALETTE[existing.length % ROOM_PALETTE.length];

      const room = yield* query((db) =>
        db
          .insert(rooms)
          .values({
            ...input,
            description: input.description || null,
            capacity: input.capacity || null,
            color: input.color ?? color,
            icon: input.icon ?? null,
            sortOrder: input.sortOrder ?? lastPosition + 1,
          })
          .returning()
      ).pipe(Effect.flatMap(found));
      yield* logRoom(room, "room.created", `agregó la sala ${room.name}`);

      return room;
    })
  ).pipe(Effect.flatMap(announce));

/** Change only the fields that were sent; a rename still has to be unique within the event. */
export const updateRoom = (id: string, data: Partial<Omit<CreateRoomInput, "openSpaceId">>) =>
  transaction(
    Effect.gen(function* () {
      const current = yield* getRoom(id);
      if (data.name !== undefined && data.name !== current.name) {
        yield* lockEvent(current.openSpaceId);
        yield* ensureNameFree(current.openSpaceId, data.name, id);
      }

      const room = yield* query((db) =>
        db
          .update(rooms)
          .set({
            ...data,
            ...(data.description === undefined ? {} : { description: data.description || null }),
            ...(data.capacity === undefined ? {} : { capacity: data.capacity || null }),
          })
          .where(eq(rooms.id, id))
          .returning()
      ).pipe(Effect.flatMap(found));
      yield* logRoom(
        room,
        "room.updated",
        data.name !== undefined && data.name !== current.name
          ? `renombró la sala ${current.name} a ${room.name}`
          : data.isActive === false
            ? `desactivó la sala ${room.name}`
            : `editó la sala ${room.name}`
      );

      return room;
    })
  ).pipe(Effect.flatMap(announce));

/** Delete a room and its talks; the boards are told which cards went away. */
export const deleteRoom = (id: string) =>
  Effect.gen(function* () {
    const talks = yield* query((db) => db.select({ id: tracks.id }).from(tracks).where(eq(tracks.roomId, id)));
    const deleted = yield* transaction(
      Effect.gen(function* () {
        const room = yield* query((db) => db.delete(rooms).where(eq(rooms.id, id)).returning()).pipe(
          Effect.flatMap(found)
        );
        yield* logRoom(
          room,
          "room.deleted",
          `borró la sala ${room.name}${talks.length ? ` y sus ${talks.length} charlas` : ""}`
        );

        return room;
      })
    );
    yield* cardsDeleted(
      deleted.openSpaceId,
      talks.map((talk) => talk.id)
    );

    return yield* announce(deleted);
  });

/**
 * New board order: the listed rooms first, in that order, then every other
 * room of the event in its current order — one statement, no duplicates.
 * Ids from another event are ignored.
 */
export const reorderRooms = (openSpaceId: string, orderedIds: readonly string[]) =>
  Effect.gen(function* () {
    const current = yield* listRooms(openSpaceId);
    const ids = new Set(current.map((room) => room.id));
    const listed = orderedIds.filter((id, index) => ids.has(id) && orderedIds.indexOf(id) === index);
    const order = [...listed, ...current.map((room) => room.id).filter((id) => !listed.includes(id))];
    if (order.length === 0) return { success: true as const };

    const position = sql.join(
      order.map((id, index) => sql`when ${id} then ${index}`),
      sql` `
    );
    yield* query((db) =>
      db
        .update(rooms)
        .set({ sortOrder: sql`(case ${rooms.id} ${position} end)::int` })
        .where(eq(rooms.openSpaceId, openSpaceId))
    );
    yield* structureChanged(openSpaceId);

    return { success: true as const };
  });

const STATUS_WORDS: Record<RoomStatus, string> = { open: "abierta", full: "llena", evacuate: "para evacuar" };

/**
 * A host marks their room open, full or to evacuate. Boards and kiosks re-read the rooms;
 * the admin's live views get an ops ping. Evacuating tells every staff phone, urgently; the
 * all-clear goes out calmly. The previous status is read under a lock, so two hosts tapping
 * "Evacuar" at once send one announcement.
 */
export const setRoomStatus = (roomId: string, status: RoomStatus) =>
  Effect.gen(function* () {
    const { room, previous } = yield* transaction(
      Effect.gen(function* () {
        const [current] = yield* query((db) =>
          db.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, roomId)).for("update")
        );
        if (!current) return yield* Effect.fail(roomNotFound);
        const [row] = yield* query((db) =>
          db.update(rooms).set({ status, statusUpdatedAt: new Date() }).where(eq(rooms.id, roomId)).returning()
        );
        yield* recordActivity({
          eventId: row.openSpaceId,
          verb: "room.status",
          entityType: "room",
          entityId: row.id,
          summary: `marcó ${row.name} como ${STATUS_WORDS[status]}`,
        });
        return { room: toRoom(row), previous: current.status };
      })
    );
    yield* structureChanged(room.openSpaceId);
    yield* opsPing(room.openSpaceId, "rooms");

    if (status !== previous && (status === "evacuate" || previous === "evacuate")) {
      yield* createAnnouncement({
        eventId: room.openSpaceId,
        urgent: status === "evacuate",
        audience: "all",
        body: status === "evacuate" ? `Evacuar ${room.name}` : `${room.name} vuelve a estar abierta`,
      });
    }

    return room;
  });
