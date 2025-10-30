import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { ProcessImageInput, ProcessImageResponse } from "../schemas";

/**
 * Process an image using OpenAI's vision API to extract talk information
 * @param imageData - Base64 encoded image data
 * @returns Extracted title, speaker name, and requirements
 */
export async function processImage(input: ProcessImageInput): Promise<ProcessImageResponse> {
  try {
    // Convert base64 data URL to binary for sending to OpenAI
    const base64Image = input.imageData.split(",")[1];

    // Use OpenAI's vision capabilities to analyze the image
    const { object } = await generateObject({
      model: openai("gpt-4.1"),
      temperature: 0.3,
      schema: z.object({
        title: z.string().describe("The extracted talk title from the handwritten sign"),
        speaker: z.string().describe("The extracted speaker name from the handwritten sign"),
        needsTV: z
          .boolean()
          .describe(
            "Check the REQUISITOS section: If the TV circle icon is marked with a black X, return true. Otherwise false."
          ),
        needsWhiteboard: z
          .boolean()
          .describe(
            "Check the REQUISITOS section: If the Whiteboard circle icon is marked with a black X, return true. Otherwise false."
          ),
      }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this handwritten sign for a talk/presentation.

REQUISITOS SECTION INSTRUCTIONS:
The sign has a "REQUISITOS" (requirements) section with THREE icons that can be circled:
Only ONE icon should be marked with a black X. If you cannot clearly identify which icon is marked with a black X, or if the NO icon is marked with a black X, set both requirements to false.

Extract the talk title, speaker name, and determine which requirements are needed based on which icon is circled.`,
            },
            {
              type: "image",
              image: `data:image/jpeg;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    return {
      title: object.title || "",
      speaker: object.speaker || "",
      needsTV: object.needsTV || false,
      needsWhiteboard: object.needsWhiteboard || false,
    };
  } catch (error) {
    console.error("Error in processImage:", error);
    throw new Error("Failed to process image with OCR");
  }
}
