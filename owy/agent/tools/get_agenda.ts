import { defineTool } from "eve/tools";
import { z } from "zod";
import { getBoard } from "../lib/board";

export default defineTool({
  description:
    "Devuelve los bloques horarios del open space cargados en el sistema (nombre y horario de cada bloque). Para la agenda general del evento (acreditación, charlas, after) usá los archivos de knowledge; esta tool es la fuente viva de los horarios del open space.",
  inputSchema: z.object({}),
  async execute() {
    const board = await getBoard();
    return {
      openSpace: board.openSpace.name,
      timeSlots: board.schedules.map((schedule) => ({
        name: schedule.name,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        highlightInKiosk: schedule.highlightInKiosk ?? false,
      })),
    };
  },
});
