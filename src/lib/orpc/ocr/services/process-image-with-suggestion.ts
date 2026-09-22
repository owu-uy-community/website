import type { ProcessImageWithSuggestionInput, ProcessImageWithSuggestionResponse } from "../schemas";
import { processImage } from "./process-image";
import { findFreeSpot } from "./find-spot";

/**
 * OCR + slot suggestion in one round trip, for callers that cannot do two (Owy's
 * `digitize_board_photo` tool). The web camera tab calls the two services separately so it can
 * fill the form as soon as the card is read, without waiting for the slot.
 */
export async function processImageWithSuggestion(
  input: ProcessImageWithSuggestionInput
): Promise<ProcessImageWithSuggestionResponse> {
  const ocrResult = await processImage({ imageData: input.imageData });

  const spotResult = await findFreeSpot({
    title: ocrResult.title,
    speaker: ocrResult.speaker,
    needsTV: ocrResult.needsTV,
    needsWhiteboard: ocrResult.needsWhiteboard,
    additionalContext: input.additionalContext,
    existingNotes: input.existingNotes,
    roomsWithResources: input.roomsWithResources,
    availableRooms: input.availableRooms,
    availableTimeSlots: input.availableTimeSlots,
  });

  return { ...ocrResult, ...spotResult };
}
