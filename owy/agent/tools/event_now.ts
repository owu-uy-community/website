import { defineTool } from "eve/tools";
import { z } from "zod";
import { getBoard, ROOM_STATUS_WORDS } from "../lib/board";
import { eventNowTime } from "../lib/dates";

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export default defineTool({
  description:
    "Qué hora es en el evento y qué bloque del open space está pasando ahora y cuál viene después, con las charlas del bloque actual y las salas que no están abiertas (llenas o en evacuación). Usala para 'qué hay ahora', 'cuándo empieza el próximo bloque', '¿hay lugar en X?'.",
  inputSchema: z.object({}),
  async execute() {
    const board = await getBoard();
    const hhmm = eventNowTime();
    const minutes = toMinutes(hhmm) ?? 0;
    const slots = board.schedules
      .map((schedule) => ({
        name: schedule.name,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        start: toMinutes(schedule.startTime),
        end: toMinutes(schedule.endTime),
      }))
      .filter((slot): slot is typeof slot & { start: number } => slot.start !== null)
      .sort((a, b) => a.start - b.start);

    const current = slots.find((slot) => slot.start <= minutes && (slot.end ?? Infinity) > minutes) ?? null;
    const next = slots.find((slot) => slot.start > minutes) ?? null;
    const statusOf = (roomId: string) => board.rooms.find((room) => room.id === roomId)?.status ?? "open";
    const talksNow = current
      ? board.cards
          .filter((card) => card.timeSlot === `${current.startTime} - ${current.endTime}` || card.timeSlot === current.name)
          .map((card) => {
            const status = statusOf(card.roomId);
            const note = status === "open" ? "" : ` (sala ${ROOM_STATUS_WORDS[status]})`;
            return `«${card.title}» en ${card.room ?? "sala sin definir"}${note}`;
          })
      : [];

    return {
      now: hhmm,
      openSpace: board.openSpace.name,
      currentBlock: current ? { name: current.name, from: current.startTime, to: current.endTime, talks: talksNow } : null,
      nextBlock: next ? { name: next.name, from: next.startTime, to: next.endTime } : null,
      roomsNotOpen: board.rooms
        .filter((room) => room.status !== "open")
        .map((room) => ({ room: room.name, status: ROOM_STATUS_WORDS[room.status] })),
    };
  },
});
