import * as z from "zod";

export const ASSET_PLATFORMS = [
  "meetup",
  "luma",
  "slack",
  "instagram",
  "linkedin",
  "x",
  "youtube",
  "email",
  "dominio",
  "otro",
] as const;
export const AssetPlatformSchema = z.enum(ASSET_PLATFORMS);

export const PLATFORM_LABELS: Record<(typeof ASSET_PLATFORMS)[number], string> = {
  meetup: "Meetup",
  luma: "Luma",
  slack: "Canal de Slack",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  email: "Email",
  dominio: "Dominio",
  otro: "Otro",
};

const Person = z.object({ userId: z.string().nullable(), name: z.string() });

/** An account the community runs elsewhere and who holds its keys. Never a password. */
export const AssetSchema = z.object({
  id: z.string(),
  platform: AssetPlatformSchema,
  label: z.string(),
  /** Someone on the team, or a name (someone outside it); null when nobody was named */
  holder: Person.nullable(),
  backup: Person.nullable(),
  note: z.string(),
  updatedAt: z.string(),
});

/** Passwords never go here: "clave: …" or "password=…" in a note is refused. */
export const NO_SECRETS = /(contraseñ\w*|password|passwd|clave|pass(word)?|pwd)\s*[:=]/i;
const free = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !NO_SECRETS.test(value), "No guardes contraseñas acá: anotá quién la tiene");

export const SaveAssetSchema = z.object({
  communityId: z.string().min(1),
  /** Absent: a new one */
  id: z.string().min(1).optional(),
  platform: AssetPlatformSchema,
  label: free(200).default(""),
  holderUserId: z.string().min(1).nullable().default(null),
  holderName: free(120).default(""),
  backupUserId: z.string().min(1).nullable().default(null),
  note: free(500).default(""),
});

export const AssetRefSchema = z.object({ communityId: z.string().min(1), id: z.string().min(1) });

export type Asset = z.infer<typeof AssetSchema>;
export type SaveAssetInput = z.infer<typeof SaveAssetSchema>;
