"use server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function processImage(imageData: string): Promise<{ title: string; speaker: string }> {
  try {
    // Convert base64 data URL to binary for sending to OpenAI
    const base64Image = imageData.split(",")[1];

    // Use OpenAI's vision capabilities to analyze the image
    const { text } = await generateText({
      model: openai("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'This is an image of a handwritten sign for a talk/presentation. Extract the talk title and speaker name from this image. Return ONLY a JSON object with the format {"title": "talk title", "speaker": "speaker name"}. If you can\'t determine one of the fields, use an empty string for that field.',
            },
            {
              type: "image",
              image: `data:image/jpeg;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    // Parse the response to get the JSON object
    try {
      // Find JSON in the response (in case there's additional text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const result = JSON.parse(jsonStr);

        // Ensure the result has the expected structure
        return {
          title: result.title || "",
          speaker: result.speaker || "",
        };
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      // Fallback to empty values if parsing fails
      return { title: "", speaker: "" };
    }
  } catch (error) {
    console.error("Error in processImage:", error);
    throw new Error("Failed to process image");
  }
}
