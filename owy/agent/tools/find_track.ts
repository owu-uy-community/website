import { defineTool } from "eve/tools";
import { z } from "zod";
import { getBoard, normalizeText } from "../lib/board";

export default defineTool({
  description:
    "Busca charlas/cards del open space por título o por speaker (búsqueda parcial, sin distinguir acentos). Ideal para responder '¿a qué hora es la charla de X?' o '¿dónde habla Fulano?'.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Texto a buscar en títulos y speakers"),
  }),
  async execute({ query }) {
    const board = await getBoard();
    const needle = normalizeText(query);
    const matches = board.cards.filter(
      (card) =>
        normalizeText(card.title).includes(needle) ||
        (card.speaker ? normalizeText(card.speaker).includes(needle) : false)
    );
    return {
      openSpace: board.openSpace.name,
      matches: matches.map((card) => ({
        id: card.id,
        title: card.title,
        speaker: card.speaker ?? null,
        room: card.room ?? card.roomId,
        timeSlot: card.timeSlot ?? card.scheduleId,
      })),
    };
  },
});
