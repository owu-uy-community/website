import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff } from "../lib/staff";

/** Base64 adds a third: this keeps the photo under the 4 MB the site accepts in one request. */
const MAX_IMAGE_BYTES = 2_900_000;

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
    "SOLO STAFF: digitaliza la foto de una card física del open space (post-it/pizarra). Lee la imagen adjunta al mensaje (queda en /workspace/attachments/...), extrae título/speaker/requisitos con el OCR del sitio y sugiere sala+horario libre según la grilla actual. NO crea la card: mostrale el resultado al staff, confirmá, y recién ahí usá create_track.",
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
      throw new Error("La foto pesa más de 2,9 MB; pedí que la manden más liviana.");
    }

    const event = await resolveActiveEvent();
    const imageData = `data:${mediaTypeFor(imagePath)};base64,${Buffer.from(bytes).toString("base64")}`;

    // The site reads the event's board itself.
    const result = await owuApi().ocr.processImageWithSuggestion({
      eventId: event.id,
      imageData,
      ...(additionalContext ? { additionalContext } : {}),
    });

    return {
      extracted: {
        title: result.title,
        speaker: result.speaker,
        needsTV: result.needsTV,
        needsWhiteboard: result.needsWhiteboard,
        requisito: result.requisito ?? null,
      },
      /** Campos que el OCR leyó con dudas: preguntá por estos, no por todos. */
      revisar: result.revisar ?? [],
      suggestion: {
        room: result.suggestedRoom,
        timeSlot: result.suggestedTimeSlot,
        reasoning: result.reasoning,
        /** Si es true, no hubo sugerencia: es el primer lugar libre. Avisale al staff. */
        degraded: result.degraded ?? false,
      },
      alternatives: result.alternatives ?? [],
      nextStep:
        "Confirmá con el staff los datos extraídos (empezando por los de `revisar`) y la ubicación; después creá la card con create_track (la sala y el horario sugeridos van como room/timeSlot).",
    };
  },
});
