import * as z from "zod";

/**
 * What a display route shows, in words for the Pantallas page. `null` for a path that is not a
 * display, so a beat from anywhere else is turned away.
 */
const DISPLAYS: [RegExp, string][] = [
  [/^\/comunidad\/[^/]+\/events\/[^/]+\/kiosk\/map\/?$/, "Kiosco · mapa"],
  [/^\/comunidad\/[^/]+\/events\/[^/]+\/kiosk\/?$/, "Kiosco · grilla"],
  [/^\/comunidad\/[^/]+\/events\/[^/]+\/stickynote\/?$/, "Pantalla · nota destacada"],
  [/^\/comunidad\/[^/]+\/events\/[^/]+\/countdown\/?$/, "Pantalla · cuenta regresiva"],
  [/^\/owy\/stage\/?$/, "Pared · Owy stage"],
];

export function screenLabel(path: string): string | null {
  return DISPLAYS.find(([route]) => route.test(path))?.[1] ?? null;
}

/** The random id a display keeps in localStorage. */
const ScreenIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{6,64}$/, "Id de pantalla inválido");

export const BeatSchema = z.object({
  id: ScreenIdSchema,
  path: z
    .string()
    .trim()
    .max(300)
    .refine((path) => screenLabel(path) !== null, "Esa ruta no es una pantalla"),
  /** The event the display belongs to; left out, the stored one stays. */
  eventId: z.string().min(1).max(64).nullable().optional(),
  userAgent: z
    .string()
    .max(2000)
    .default("")
    .transform((agent) => agent.slice(0, 300)),
});
export type BeatInput = z.infer<typeof BeatSchema>;

export const ListScreensSchema = z.object({ eventId: z.string().min(1) });
export const ScreenRefSchema = z.object({ id: ScreenIdSchema });
export const RenameScreenSchema = z.object({ id: ScreenIdSchema, name: z.string().trim().min(1).max(60) });

export const ScreenSchema = z.object({
  id: z.string(),
  /** "" until someone names it. */
  name: z.string(),
  path: z.string(),
  /** What it shows, from its path: "Kiosco · grilla", "Pared · Owy stage"… */
  label: z.string(),
  userAgent: z.string(),
  /** Seen in the last minute. */
  online: z.boolean(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
});
export type Screen = z.infer<typeof ScreenSchema>;

/** What a display hears on the screens channel: show its name, or reload. */
export type ScreenSignal = { id: string; name?: string; label?: string };
