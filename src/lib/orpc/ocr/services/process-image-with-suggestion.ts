import type { ProcessImageWithSuggestionInput, ProcessImageWithSuggestionResponse } from "../schemas";
import { processImage } from "./process-image";
import { findFreeSpot } from "./find-spot";

/**
 * Combined service: Process an image with OCR and automatically suggest the best spot using AI
 * @param input - Image data and scheduling context
 * @returns OCR results + AI-suggested room and time slot
 */
export async function processImageWithSuggestion(
  input: ProcessImageWithSuggestionInput
): Promise<ProcessImageWithSuggestionResponse> {
  // Step 1: Process the image with OCR to extract talk information
  const ocrResult = await processImage({ imageData: input.imageData });

  // Step 2: Use the extracted data to find the best spot with AI
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

  // Step 3: Combine both results
  return {
    // OCR results
    title: ocrResult.title,
    speaker: ocrResult.speaker,
    needsTV: ocrResult.needsTV,
    needsWhiteboard: ocrResult.needsWhiteboard,
    // AI suggestion results
    suggestedRoom: spotResult.suggestedRoom,
    suggestedTimeSlot: spotResult.suggestedTimeSlot,
    reasoning: spotResult.reasoning,
    swapSuggestion: spotResult.swapSuggestion,
    alternatives: spotResult.alternatives,
  };
}
