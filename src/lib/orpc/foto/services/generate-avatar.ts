import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { GenerateAvatarInput, GenerateAvatarResponse } from "../schemas";

const RPG_CLASSES = ["warrior", "witch", "warlock", "ranger", "paladin", "druid", "rogue"] as const;

function getRandomClass(): string {
  return RPG_CLASSES[Math.floor(Math.random() * RPG_CLASSES.length)];
}

/**
 * Generate a pixel-art RPG avatar from a photo using Gemini (nano-banana)
 */
export async function generateAvatar(input: GenerateAvatarInput): Promise<GenerateAvatarResponse> {
  const base64Image = input.imageData.split(",")[1];
  const detectedMime = input.imageData.match(/data:([^;]+);/)?.[1] || "image/jpeg";
  const rpgClass = input.rpgClass || getRandomClass();

  const result = await generateText({
    model: google("gemini-3.1-flash-image-preview"),
    providerOptions: {
      google: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: Buffer.from(base64Image, "base64"),
            mediaType: detectedMime,
          },
          {
            type: "text",
            text: `Transform the person in this reference photo into a fantasy RPG character portrait in detailed pixel art style.

The character must be a ${rpgClass}.

CRITICAL — FACIAL LIKENESS IS THE #1 PRIORITY:
Study the person's face in the photo very carefully before generating. The RPG character MUST be clearly recognizable as the same person. Preserve:
 – Exact face shape and proportions
 – Eye shape, color, and spacing
 – Nose shape and size
 – Mouth/smile characteristics
 – Beard/facial hair if present (exact style and coverage)
 – Hairstyle, hair color, and hair length
 – Skin tone
 – Any distinctive features (glasses, freckles, dimples, etc.)
 – Overall facial expression and vibe

The person should look at this avatar and immediately say "that's me!"

Art style — CLOSE-UP RPG portrait (NOT full body):
 – Frame the character from CHEST/SHOULDERS UP only — this is a tight portrait crop, NOT a full body shot
 – High-detail pixel art with dense, refined pixels — textured and rich, not flat or vector-like
 – Warm, moody color palette: deep browns, dark forest greens, warm golds, earthy amber tones
 – Mature, confident expression — NOT a goofy cartoon smile
 – Subtle, natural pose (e.g. sword peeking over shoulder, hand raised with a gesture)
 – Soft, blurred painterly landscape background (distant mountains, misty forests, warm sky) — background should have depth-of-field blur
 – Class-appropriate gear visible: cloak, shoulder armor, medallion/amulet, weapon handle for a ${rpgClass}
 – Warm directional lighting with depth and shadow on the face
 – Thick, detailed pixel clusters for hair and beard texture
 – Overall mood: serious adventure RPG, like a character portrait from a classic JRPG

ABSOLUTE CONSTRAINTS:
 – Do NOT add any text, words, letters, labels, names, titles, banners, or watermarks anywhere on the image. The image must contain ZERO text.
 – Do NOT show full body — chest/shoulders up ONLY
 – Do NOT use bright saturated cartoon colors — use warm, muted, earthy tones
 – Do NOT make it a cute caricature — it should feel like a real RPG game portrait
 – Do NOT make it realistic or painterly — it must be pixel art with visible pixels
 – Do NOT over-pixelate (no extreme chunky low-res look)`,
          },
        ],
      },
    ],
  });

  // Extract generated image from result.files (nano-banana returns images here)
  const imageFile = result.files?.find((f) => f.mediaType?.startsWith("image/"));

  if (!imageFile) {
    throw new Error("No image was generated. Please try again.");
  }

  return {
    avatarBase64: Buffer.from(imageFile.uint8Array).toString("base64"),
    mediaType: imageFile.mediaType || "image/png",
  };
}
