import { owuApi, type AdminEventOption, type Room, type Schedule, type StickyNote } from "./owu-api";

/**
 * Openspace board composition + friendly-name resolution shared by the grid
 * tools. A board cell is (schedule, room) and holds at most one track/card
 * (enforced by the API with a unique constraint + slot-conflict validation).
 */

export interface BoardSnapshot {
  openSpace: { id: string; name: string; community?: string };
  rooms: Room[];
  schedules: Schedule[];
  cards: StickyNote[];
  freeCells: { scheduleId: string; timeSlot: string; roomId: string; room: string }[];
}

/**
 * The event Owy operates on. The site is multi-tenant (many communities, many
 * events), so pin it with OWY_EVENT_ID; without a pin, Owy takes the most
 * recent event it can operate (`listForAdmin` returns them newest first).
 */
export async function resolveActiveEvent(): Promise<AdminEventOption> {
  const events = await owuApi().openSpaces.listForAdmin();
  if (events.length === 0) {
    throw new Error("No hay ningún evento cargado en el sistema todavía.");
  }

  const pinned = process.env.OWY_EVENT_ID?.trim();
  if (pinned) {
    const match = events.find((event) => event.id === pinned || event.slug === pinned);
    if (!match) {
      const options = events.map((event) => `${event.name} (${event.slug}, id ${event.id})`).join("; ");
      throw new Error(`OWY_EVENT_ID="${pinned}" no matchea ningún evento. Disponibles: ${options}.`);
    }
    return match;
  }

  // listForAdmin already sorts by startDate desc
  return events[0];
}

export async function getBoard(openSpaceId?: string): Promise<BoardSnapshot> {
  const api = owuApi();
  const event = openSpaceId ? null : await resolveActiveEvent();
  const openSpace = event
    ? { id: event.id, name: event.name, community: event.communityName }
    : { id: openSpaceId!, name: openSpaceId! };

  const [rooms, schedules, cards] = await Promise.all([
    api.rooms.getByOpenSpace({ openSpaceId: openSpace.id }),
    api.schedules.getByOpenSpace({ openSpaceId: openSpace.id }),
    api.tracks.list({ openSpaceId: openSpace.id }),
  ]);

  const activeRooms = rooms.filter((room) => room.isActive !== false);
  const activeSchedules = schedules.filter((schedule) => schedule.isActive !== false);

  const occupied = new Set(cards.map((card) => `${card.scheduleId}::${card.roomId}`));
  const freeCells = activeSchedules.flatMap((schedule) =>
    activeRooms
      .filter((room) => !occupied.has(`${schedule.id}::${room.id}`))
      .map((room) => ({
        scheduleId: schedule.id,
        timeSlot: `${schedule.startTime} - ${schedule.endTime}`,
        roomId: room.id,
        room: room.name,
      }))
  );

  return { openSpace, rooms: activeRooms, schedules: activeSchedules, cards, freeCells };
}

/** Lowercased, accent-insensitive text for fuzzy matching. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const normalize = normalizeText;

/** Resolve a room by id or (accent-insensitive) name. */
export function findRoom(board: BoardSnapshot, ref: string): Room {
  const byId = board.rooms.find((room) => room.id === ref);
  if (byId) return byId;
  const needle = normalize(ref);
  const matches = board.rooms.filter((room) => normalize(room.name).includes(needle));
  if (matches.length === 1) return matches[0];
  const names = board.rooms.map((room) => room.name).join(", ");
  throw new Error(
    matches.length === 0
      ? `No encontré la sala "${ref}". Las salas son: ${names}.`
      : `"${ref}" matchea varias salas (${matches.map((room) => room.name).join(", ")}). Precisá cuál.`
  );
}

/** Resolve a time slot by schedule id, name, start time ("15:30") or "start - end" label. */
export function findSchedule(board: BoardSnapshot, ref: string): Schedule {
  const byId = board.schedules.find((schedule) => schedule.id === ref);
  if (byId) return byId;
  const needle = normalize(ref);
  const matches = board.schedules.filter((schedule) => {
    const label = `${schedule.startTime} - ${schedule.endTime}`;
    return (
      normalize(schedule.name).includes(needle) ||
      normalize(label).replace(/\s/g, "").includes(needle.replace(/\s/g, "")) ||
      normalize(schedule.startTime) === needle
    );
  });
  if (matches.length === 1) return matches[0];
  const slots = board.schedules.map((schedule) => `${schedule.name} (${schedule.startTime} - ${schedule.endTime})`).join("; ");
  throw new Error(
    matches.length === 0
      ? `No encontré el horario "${ref}". Los horarios son: ${slots}.`
      : `"${ref}" matchea varios horarios. Precisá cuál: ${slots}.`
  );
}

/** Resolve a card by id or (accent-insensitive) title/speaker substring. */
export function findCard(board: BoardSnapshot, ref: string): StickyNote {
  const byId = board.cards.find((card) => card.id === ref);
  if (byId) return byId;
  const needle = normalize(ref);
  const matches = board.cards.filter(
    (card) => normalize(card.title).includes(needle) || (card.speaker ? normalize(card.speaker).includes(needle) : false)
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`No encontré ninguna card que matchee "${ref}". Mirá la grilla con get_openspace_board.`);
  }
  const candidates = matches
    .slice(0, 6)
    .map((card) => `«${card.title}» (${card.room ?? card.roomId}, ${card.timeSlot ?? card.scheduleId}, id ${card.id})`)
    .join("; ");
  throw new Error(`"${ref}" matchea varias cards: ${candidates}. Indicá el id o un título más específico.`);
}
