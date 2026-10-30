import * as z from "zod";

import {
  DeskSchema,
  DeskStepSchema,
  EffectEventSchema,
  FaceEventSchema,
  MODERATIONS,
  PresetSchema,
  RundownSchema,
  SCENE_IDS,
  StageStateSchema,
  type SceneId,
} from "../../owy-stage/scenes";

export const SetSceneSchema = z.object({
  scene: z.enum(SCENE_IDS as [SceneId, ...SceneId[]]),
  params: z.record(z.string(), z.unknown()).optional(),
  eventId: z.string().nullable().optional(),
  /** Put the scene on air from scratch: new round, phone answers start over. */
  restart: z.boolean().optional(),
  /** The brand wipe (default) or a straight cut. */
  transition: z.enum(["wipe", "cut"]).optional(),
});

/** The whole rundown travels on every edit: it is tiny and conflict-free. */
export const SaveRundownSchema = z.object({ steps: RundownSchema });

/**
 * The desk travels whole too (preview + queue + presets: a few KB at most).
 * A desk tab opened before presets existed saves without them: the stored
 * ones stay instead of being wiped.
 */
export const SaveDeskSchema = z.object({
  desk: DeskSchema.extend({ presets: z.array(PresetSchema).max(100).optional() }),
});
export type SaveDeskInput = z.infer<typeof SaveDeskSchema>["desk"];

/**
 * The desk as it leaves the server. ponytail: `favorites` (the presets' scenes) keeps desk tabs
 * opened before presets existed working until they reload; drop it after OWU CONF.
 */
export const DeskWireSchema = DeskSchema.extend({ favorites: z.array(z.string()).optional() });

/** A preset by its id or its number on the desk, into preview (TAKE sends it) or straight on air. */
export const FirePresetSchema = z.object({
  preset: z.string().trim().min(1).max(40),
  to: z.enum(["preview", "air"]).default("preview"),
});
export const FirePresetResultSchema = z.object({ preset: PresetSchema, to: z.enum(["preview", "air"]) });

/** TAKE sends the step the operator is looking at, so what goes out is what they saw. */
export const TakeSchema = z.object({ step: DeskStepSchema, transition: z.enum(["wipe", "cut"]).optional() });
export const TakeResultSchema = z.object({ state: StageStateSchema, desk: DeskWireSchema });

export const FireEffectSchema = EffectEventSchema;
export const SetFaceSchema = FaceEventSchema;

export type SetSceneInput = z.infer<typeof SetSceneSchema>;

export const GetPulseSchema = z.object({ eventId: z.string().nullable().optional() }).optional();

export const GetInputsSchema = z.object({ round: z.string().trim().max(40) });

export const ModerateSchema = z.object({ inputId: z.string().min(1).max(40), moderation: z.enum(MODERATIONS) });
export const ModerationEventSchema = z.object({ id: z.string(), round: z.string(), moderation: z.enum(MODERATIONS) });

/** What a recogniser (Shazam via macOS Shortcuts, SongRec…) reports. */
export const SetNowPlayingSchema = z.object({
  song: z.string().trim().min(1).max(80),
  artist: z.string().trim().max(80).default(""),
  playlist: z.string().trim().max(60).optional(),
});
export type SetNowPlayingInput = z.infer<typeof SetNowPlayingSchema>;

// ---------------------------------------------------------------------------
// What the data-driven scenes read
// ---------------------------------------------------------------------------

export const StageInputSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
  voter: z.string(),
  createdAt: z.string(),
  moderation: z.enum(MODERATIONS),
});

export const StagePulseSchema = z.object({
  /** Aggregates only — never attendee data. `null` when Eventbrite isn't configured or answering. */
  tickets: z.object({ checkedIn: z.number(), active: z.number(), capacity: z.number().nullable() }).nullable(),
  board: z.object({ ideas: z.number(), rooms: z.number() }).nullable(),
});
export type StagePulse = z.infer<typeof StagePulseSchema>;

export const StageMeetupSchema = z.object({
  name: z.string(),
  title: z.string(),
  datetime: z.string(),
  venue: z.string().nullable(),
  url: z.string(),
});
export type StageMeetup = z.infer<typeof StageMeetupSchema>;

export const StageWeatherSchema = z.object({
  temp: z.number(),
  feels: z.number(),
  code: z.number(),
  wind: z.number(),
  hours: z.array(z.object({ time: z.string(), temp: z.number(), rain: z.number(), code: z.number() })),
});
export type StageWeather = z.infer<typeof StageWeatherSchema>;

export const StageSpeakerSchema = z.object({
  slug: z.string(),
  name: z.string(),
  picture: z.string().nullable(),
  role: z.string().nullable(),
});
export type StageSpeaker = z.infer<typeof StageSpeakerSchema>;

export const SpotifyTrackSchema = z.object({
  song: z.string(),
  artist: z.string(),
  album: z.string(),
  art: z.string().nullable(),
  progressMs: z.number(),
  durationMs: z.number(),
  isPlaying: z.boolean(),
  /** Server time of the reading, so the wall can extrapolate progress between polls. */
  at: z.string(),
});
