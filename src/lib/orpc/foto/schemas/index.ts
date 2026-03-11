import { z } from "zod";

export const RPG_CLASSES = ["warrior", "witch", "warlock", "ranger", "paladin", "druid", "rogue"] as const;
export type RpgClass = (typeof RPG_CLASSES)[number];

/**
 * Schema for avatar generation input
 */
export const GenerateAvatarSchema = z.object({
  imageData: z.string().describe("Base64 encoded image data URL from camera capture"),
  rpgClass: z
    .enum(RPG_CLASSES)
    .optional()
    .describe("RPG character class — random if not provided"),
});

/**
 * Schema for SSE events yielded during avatar generation
 */
export const AvatarEventSchema = z.object({
  status: z.enum(["analyzing", "generating", "finalizing", "complete", "error"]),
  message: z.string(),
  avatarBase64: z.string().optional(),
  mediaType: z.string().optional(),
});

export type GenerateAvatarInput = z.infer<typeof GenerateAvatarSchema>;
export type AvatarEvent = z.infer<typeof AvatarEventSchema>;

export type GenerateAvatarResponse = {
  avatarBase64: string;
  mediaType: string;
};
