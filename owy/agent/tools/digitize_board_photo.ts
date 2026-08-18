import { defineTool } from "eve/tools";
import { z } from "zod";
import { getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff } from "../lib/staff";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function mediaTypeFor(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_TYPES[extension] ?? "image/jpeg";
}

export default defineTool({
  description:
    "SOLO STAFF: digitaliza la foto de una card física del open space (post-it/pizarra). Lee la imagen adjunta al mensaje (queda en /workspace/attachments/...), extrae título/speaker/requisitos con el OCR del sitio y sugiere sala+horario libre según la grilla actual. NO crea la card: mostrale el resultado al staff, confirmá, y recién ahí usá create_track (o swap_tracks si sugiere intercambio).",
  inputSchema: z.object({
    imagePath: z
      .string()
      .min(1)
      .describe("Ruta de la foto en el sandbox, ej: /workspace/attachments/foto.jpg (aparece en el mensaje adjunto)"),
    additionalContext: z
      .string()
      .optional()
      .describe("Contexto extra para la sugerencia de ubicación (ej: 'preferís bloque de la tarde')"),
  }),
  async execute({ imagePath, additionalContext }, ctx) {
    requireStaff(ctx);

    const sandbox = await ctx.getSandbox();
    const bytes = await sandbox.readBinaryFile({ path: imagePath });
    if (!bytes) {
      throw new Error(
        `No encontré la imagen en "${imagePath}". Las fotos adjuntas quedan en /workspace/attachments/ — verificá la ruta con list_files.`
      );
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("La foto pesa más de 8MB; pedí que la manden más liviana.");
    }

    const board = await getBoard();
    const imageData = `data:${mediaTypeFor(imagePath)};base64,${Buffer.from(bytes).toString("base64")}`;

    const result = await owuApi().ocr.processImageWithSuggestion({
      imageData,
      existingNotes: board.cards.map((card) => ({
        id: card.id,
        title: card.title,
        speaker: card.speaker,
        room: card.room ?? card.roomId,
        timeSlot: card.timeSlot ?? card.scheduleId,
        needsTV: card.needsTV,
        needsWhiteboard: card.needsWhiteboard,
      })),
      roomsWithResources: board.rooms.map((room) => ({
        name: room.name,
        hasTV: room.hasTV ?? false,
        hasWhiteboard: room.hasWhiteboard ?? false,
      })),
      availableRooms: board.rooms.map((room) => room.name),
      availableTimeSlots: board.schedules.map((schedule) => `${schedule.startTime} - ${schedule.endTime}`),
      ...(additionalContext ? { additionalContext } : {}),
    });

    return {
      extracted: {
        title: result.title,
        speaker: result.speaker,
        needsTV: result.needsTV,
        needsWhiteboard: result.needsWhiteboard,
      },
      suggestion: {
        room: result.suggestedRoom,
        timeSlot: result.suggestedTimeSlot,
        reasoning: result.reasoning,
      },
      swapSuggestion: result.swapSuggestion ?? null,
      alternatives: result.alternatives ?? [],
      nextStep:
        "Confirmá con el staff los datos extraídos y la ubicación; después creá la card con create_track (la sala y el horario sugeridos van como room/timeSlot).",
    };
  },
});
